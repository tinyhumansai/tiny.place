import { describe, expect, it } from "vitest";
import { TinyPlaceClient, TinyPlaceError } from "../src/index.js";

/**
 * Transport-resilience tests: timeouts and retry-with-backoff. These exercise
 * the central HttpClient via a public read (`directory.listAgents`, a GET) and a
 * write (`feedback.submit`-style POST) so the method-eligibility rules are
 * covered end-to-end.
 */
describe("HttpClient transport resilience", () => {
  it("retries an idempotent GET on a 503 and then succeeds", async () => {
    let calls = 0;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      retry: { retries: 3, baseDelayMs: 1, maxDelayMs: 2 },
      fetch: async () => {
        calls += 1;
        if (calls < 3) {
          return new Response("upstream down", { status: 503 });
        }
        return Response.json({ agents: [] });
      },
    });

    const result = await client.directory.listAgents();
    expect(result).toEqual({ agents: [] });
    expect(calls).toBe(3);
  });

  it("gives up after the configured number of retries", async () => {
    let calls = 0;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      retry: { retries: 2, baseDelayMs: 1, maxDelayMs: 2 },
      fetch: async () => {
        calls += 1;
        return new Response("nope", { status: 500 });
      },
    });

    await expect(client.directory.listAgents()).rejects.toMatchObject({
      status: 500,
    });
    // 1 initial attempt + 2 retries.
    expect(calls).toBe(3);
  });

  it("does not retry a non-idempotent write by default", async () => {
    let calls = 0;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      retry: { retries: 3, baseDelayMs: 1 },
      fetch: async () => {
        calls += 1;
        return new Response("server error", { status: 500 });
      },
    });

    // DELETE is not in the default retry-eligible method set, so a 5xx is
    // surfaced immediately rather than risking a duplicated write.
    await expect(
      client.directory.deleteAgent("agent-1"),
    ).rejects.toBeInstanceOf(TinyPlaceError);
    expect(calls).toBe(1);
  });

  it("does not retry a non-transient status (404)", async () => {
    let calls = 0;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      retry: { retries: 3, baseDelayMs: 1 },
      fetch: async () => {
        calls += 1;
        return new Response("not found", { status: 404 });
      },
    });

    await expect(client.directory.listAgents()).rejects.toMatchObject({
      status: 404,
    });
    expect(calls).toBe(1);
  });

  it("honours a Retry-After header on 429", async () => {
    let calls = 0;
    const started = Date.now();
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      retry: { retries: 1, baseDelayMs: 10_000, maxDelayMs: 20_000 },
      fetch: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("slow down", {
            status: 429,
            headers: { "retry-after": "0" },
          });
        }
        return Response.json({ agents: [] });
      },
    });

    await client.directory.listAgents();
    // Retry-After: 0 overrides the (huge) backoff, so the retry is near-instant.
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(calls).toBe(2);
  });

  it("times out a hung request as a TinyPlaceError(status 0)", async () => {
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      timeoutMs: 10,
      retry: { retries: 0 },
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            );
          });
        }),
    });

    const error = await client.directory.listAgents().catch((cause) => cause);
    expect(error).toBeInstanceOf(TinyPlaceError);
    expect((error as TinyPlaceError).status).toBe(0);
    expect((error as TinyPlaceError).message).toContain("timed out");
  });

  it("retries connection-level failures for GETs", async () => {
    let calls = 0;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      retry: { retries: 2, baseDelayMs: 1, maxDelayMs: 2 },
      fetch: async () => {
        calls += 1;
        if (calls < 2) {
          throw new TypeError("fetch failed");
        }
        return Response.json({ agents: [] });
      },
    });

    await client.directory.listAgents();
    expect(calls).toBe(2);
  });
});
