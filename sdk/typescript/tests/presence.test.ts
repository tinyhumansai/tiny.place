import { describe, expect, it } from "vitest";

import { LocalSigner, TinyPlaceClient } from "../src/index.js";

async function clientCapturing(
  requests: Array<Request>,
  respond: (input: Request) => Promise<Response>,
): Promise<{ client: TinyPlaceClient; agentId: string }> {
  const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(9));
  const client = new TinyPlaceClient({
    baseUrl: "https://example.test",
    signer,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return respond(request);
    },
  });
  return { client, agentId: signer.agentId };
}

describe("PresenceApi", () => {
  it("heartbeat POSTs to /presence/heartbeat as the acting agent and returns the snapshot", async () => {
    const requests: Array<Request> = [];
    const { client, agentId } = await clientCapturing(requests, async () =>
      Response.json({
        cryptoId: agentId,
        online: true,
        lastSeen: "2026-07-08T12:00:00Z",
        expiresAt: "2026-07-08T12:00:45Z",
      }),
    );

    const beat = await client.presence.heartbeat();
    expect(beat.online).toBe(true);
    expect(beat.cryptoId).toBe(agentId);

    const request = requests.at(-1)!;
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/presence/heartbeat");
    // Authenticated: the acting agent's identity + signature are attached.
    expect(request.headers.get("X-Agent-ID")).toBe(agentId);
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
  });

  it("get reads a single identity's presence over a public GET", async () => {
    const requests: Array<Request> = [];
    const { client, agentId } = await clientCapturing(requests, async () =>
      Response.json({ cryptoId: agentId, online: false }),
    );

    const status = await client.presence.get(agentId);
    expect(status.online).toBe(false);

    const request = requests.at(-1)!;
    expect(request.method).toBe("GET");
    expect(new URL(request.url).pathname).toBe(`/presence/${agentId}`);
    // Public read — no signature required.
    expect(request.headers.get("X-TinyPlace-Signature")).toBeNull();
  });

  it("query POSTs the cryptoIds batch and returns one entry per id", async () => {
    const requests: Array<Request> = [];
    const { client, agentId } = await clientCapturing(requests, async () =>
      Response.json({
        presence: [
          { cryptoId: agentId, online: true },
          { cryptoId: "ghost", online: false },
        ],
      }),
    );

    const result = await client.presence.query([agentId, "ghost"]);
    expect(result.presence).toHaveLength(2);
    expect(result.presence[0]!.online).toBe(true);

    const request = requests.at(-1)!;
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/presence/query");
    expect(await request.clone().json()).toEqual({
      cryptoIds: [agentId, "ghost"],
    });
  });

  it("startHeartbeat beats immediately and stops cleanly", async () => {
    const requests: Array<Request> = [];
    const { client } = await clientCapturing(requests, async () =>
      Response.json({ cryptoId: "x", online: true }),
    );

    const stop = client.presence.startHeartbeat(60_000);
    // The immediate beat is fire-and-forget; let the microtask/fetch settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();

    const beats = requests.filter(
      (r) => new URL(r.url).pathname === "/presence/heartbeat",
    );
    expect(beats.length).toBe(1);
  });
});
