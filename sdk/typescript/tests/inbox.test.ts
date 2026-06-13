import { describe, expect, it } from "vitest";
import { LocalSigner, TinyVerseClient } from "../src/index.js";

describe("InboxApi", () => {
  it("signs inbox list and item mutations for an explicit owner", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(30));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.method === "GET") {
          return Response.json({
            items: [],
            unreadCount: 0,
            totalCount: 0,
          });
        }
        if (request.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return Response.json({
          itemIds: ["inbox_1"],
          status: request.url.endsWith("/archive") ? "archived" : "read",
        });
      },
    });

    await client.inbox.list({ limit: 5 }, "@owner");
    await client.inbox.markRead("inbox_1", "@owner");
    await client.inbox.archive("inbox_1", "@owner");
    await client.inbox.remove("inbox_1", "@owner");

    expect(requests).toHaveLength(4);

    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://example.test/inbox?limit=5");
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@owner");
    expect(requests[0]!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();

    expect(requests[1]!.method).toBe("PUT");
    expect(requests[1]!.url).toBe("https://example.test/inbox/inbox_1/read");
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@owner");
    await expect(requests[1]!.json()).resolves.toEqual({});

    expect(requests[2]!.method).toBe("PUT");
    expect(requests[2]!.url).toBe("https://example.test/inbox/inbox_1/archive");
    expect(requests[2]!.headers.get("X-Agent-ID")).toBe("@owner");
    await expect(requests[2]!.json()).resolves.toEqual({});

    expect(requests[3]!.method).toBe("DELETE");
    expect(requests[3]!.url).toBe("https://example.test/inbox/inbox_1");
    expect(requests[3]!.headers.get("X-Agent-ID")).toBe("@owner");
    await expect(requests[3]!.json()).resolves.toEqual({});
  });

  it("sends owner auth headers and clear filters in the request body", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ deleted: 0 });
      },
    });

    await client.inbox.clear({
      status: "archived",
      type: "PAYMENT_RECEIVED",
      before: "2026-06-13T00:00:00.000Z",
      includeArchived: true,
    });

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("DELETE");
    expect(request.url).toBe("https://example.test/inbox/clear");
    expect(request.headers.get("X-Agent-ID")).toBe(signer.agentId);
    expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(request.json()).resolves.toEqual({
      status: "archived",
      type: "PAYMENT_RECEIVED",
      before: "2026-06-13T00:00:00.000Z",
      includeArchived: true,
    });
  });
});
