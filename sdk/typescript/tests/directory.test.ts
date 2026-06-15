import { describe, expect, it } from "vitest";
import {
  LocalSigner,
  TinyPlaceClient,
  TinyPlaceValidationError,
} from "../src/index.js";
import type { AgentCard, ExtendedAgentCard } from "../src/index.js";

const agentId = "7YttLkHDoVzP6pYphcCg5GkA2N4GokB3k1drpbUaW7oX";

describe("DirectoryApi", () => {
  it("reads and upserts extended agent cards with directory auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(20));
    const requests: Array<Request> = [];
    const card: ExtendedAgentCard = {
      agentId,
      agent: {
        agentId,
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
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(card);
      },
    });

    const read = await client.directory.getExtendedAgent(agentId);
    const result = await client.directory.upsertExtendedAgent(agentId, card);

    expect(read).toEqual(card);
    expect(result).toEqual(card);
    expect(requests).toHaveLength(2);

    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe(
      `https://example.test/directory/agents/${agentId}/extended`,
    );
    expect(requests[0]!.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    expect(requests[0]!.headers.get("Authorization")).toBeNull();

    const request = requests[1]!;
    expect(request.method).toBe("PUT");
    expect(request.url).toBe(
      `https://example.test/directory/agents/${agentId}/extended`,
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

  it("rejects malformed agent cards before making requests", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(21));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });
    const card: AgentCard = {
      agentId,
      name: "Agent",
      cryptoId: signer.agentId,
      publicKey: signer.publicKeyBase64,
      url: "javascript:alert(1)",
      createdAt: "2026-06-13T00:00:00Z",
      updatedAt: "2026-06-13T00:00:00Z",
    };

    expect(() => client.directory.upsertAgent(agentId, card)).toThrow(
      TinyPlaceValidationError,
    );
    expect(requests).toHaveLength(0);
  });

  it("rejects malformed extended agent cards before making requests", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(22));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });
    const card: ExtendedAgentCard = {
      agentId,
      agent: {
        agentId,
        name: "Agent",
        cryptoId: signer.agentId,
        publicKey: signer.publicKeyBase64,
        createdAt: "2026-06-13T00:00:00Z",
        updatedAt: "2026-06-13T00:00:00Z",
      },
      privateSkills: ["private.search"],
      internalApi: { docsUrl: "file:///etc/passwd" },
      updatedAt: "2026-06-13T00:00:00Z",
    };

    expect(() => client.directory.upsertExtendedAgent(agentId, card)).toThrow(
      TinyPlaceValidationError,
    );
    expect(requests).toHaveLength(0);
  });

  it("rejects malformed directory query params before making requests", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });

    expect(() => client.directory.listAgents({ limit: -1 })).toThrow(
      TinyPlaceValidationError,
    );
    expect(() => client.directory.listIdentities({ offset: -1 })).toThrow(
      TinyPlaceValidationError,
    );
    expect(requests).toHaveLength(0);
  });
});
