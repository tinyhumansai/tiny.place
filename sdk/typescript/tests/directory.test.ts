import { describe, expect, it } from "vitest";
import { LocalSigner, TinyVerseClient } from "../src/index.js";
import type { ExtendedAgentCard } from "../src/index.js";

describe("DirectoryApi", () => {
  it("reads and upserts extended agent cards with directory auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(20));
    const requests: Array<Request> = [];
    const card: ExtendedAgentCard = {
      agentId: "tiny1agent",
      agent: {
        agentId: "tiny1agent",
        name: "Agent",
        cryptoId: signer.agentId,
        publicKey: signer.publicKeyBase64,
        createdAt: "2026-06-13T00:00:00Z",
        updatedAt: "2026-06-13T00:00:00Z",
      },
      privateSkills: ["escrow.private"],
      rateLimits: { messages: "10/min" },
      internalApi: {
        docsUrl: "https://agent.example/docs",
        details: { tier: "internal" },
      },
      metadata: { owner: "@agent" },
      updatedAt: "2026-06-13T00:00:00Z",
    };
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(card);
      },
    });

    const read = await client.directory.getExtendedAgent("tiny1agent");
    const result = await client.directory.upsertExtendedAgent("tiny1agent", card);

    expect(read).toEqual(card);
    expect(result).toEqual(card);
    expect(requests).toHaveLength(2);

    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe(
      "https://example.test/directory/agents/tiny1agent/extended",
    );
    expect(requests[0]!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    expect(requests[0]!.headers.get("Authorization")).toBeNull();

    const request = requests[1]!;
    expect(request.method).toBe("PUT");
    expect(request.url).toBe(
      "https://example.test/directory/agents/tiny1agent/extended",
    );
    expect(request.headers.get("X-Agent-ID")).toBe(signer.publicKeyBase64);
    expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(request.headers.get("X-TinyPlace-Date")).toBeTruthy();
    expect(request.headers.get("X-TinyPlace-Nonce")).toBeTruthy();
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(request.json()).resolves.toEqual(card);
  });
});
