import { describe, expect, it } from "vitest";
import {
  Agent,
  LocalSigner,
  MemorySessionStore,
  TinyPlaceClient,
} from "../src/index.js";
import type { MessageEnvelope, SignedKey } from "../src/index.js";

/** In-memory relay covering messages + keys (mirrors encrypted-messaging tests). */
function makeRelay(): typeof globalThis.fetch {
  const inbox = new Map<string, Array<MessageEnvelope>>();
  const signedPreKeys = new Map<string, SignedKey>();
  const preKeys = new Map<string, Array<SignedKey>>();

  return async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === "/messages" && method === "PUT") {
      const envelope = (await request.json()) as MessageEnvelope;
      inbox.set(envelope.to, [...(inbox.get(envelope.to) ?? []), envelope]);
      return Response.json(envelope, { status: 202 });
    }
    if (path === "/messages" && method === "GET") {
      const agentId = url.searchParams.get("agentId") ?? "";
      return Response.json({ messages: inbox.get(agentId) ?? [] });
    }
    if (path.startsWith("/messages/") && method === "DELETE") {
      const id = decodeURIComponent(path.slice("/messages/".length));
      const agentId = url.searchParams.get("agentId") ?? "";
      inbox.set(
        agentId,
        (inbox.get(agentId) ?? []).filter((envelope) => envelope.id !== id),
      );
      return new Response(null, { status: 204 });
    }
    const signedMatch = path.match(/^\/keys\/([^/]+)\/signed-prekey$/);
    if (signedMatch && method === "PUT") {
      const body = (await request.json()) as { signedPreKey: SignedKey };
      signedPreKeys.set(decodeURIComponent(signedMatch[1]!), body.signedPreKey);
      return new Response(null, { status: 204 });
    }
    const preKeysMatch = path.match(/^\/keys\/([^/]+)\/prekeys$/);
    if (preKeysMatch && method === "PUT") {
      const id = decodeURIComponent(preKeysMatch[1]!);
      const body = (await request.json()) as { preKeys: Array<SignedKey> };
      preKeys.set(id, [...(preKeys.get(id) ?? []), ...body.preKeys]);
      return new Response(null, { status: 204 });
    }
    const bundleMatch = path.match(/^\/keys\/([^/]+)\/bundle$/);
    if (bundleMatch && method === "GET") {
      const id = decodeURIComponent(bundleMatch[1]!);
      const signedPreKey = signedPreKeys.get(id);
      if (!signedPreKey) {
        return Response.json({ error: "no bundle" }, { status: 404 });
      }
      return Response.json({
        agentId: id,
        identityKey: id,
        signedPreKey,
        updatedAt: "2026-06-16T00:00:00.000Z",
      });
    }
    return Response.json({ error: `unhandled ${method} ${path}` }, { status: 500 });
  };
}

async function makeAgent(
  seed: number,
  fetch: typeof globalThis.fetch,
): Promise<Agent> {
  const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(seed));
  const store = new MemorySessionStore(await signer.getX25519KeyPair());
  return Agent.create({ baseUrl: "https://relay.test", signer, store, fetch });
}

describe("Agent.create", () => {
  it("wires transparent E2E so two agents message by key", async () => {
    const relay = makeRelay();
    const alice = await makeAgent(11, relay);
    const bob = await makeAgent(22, relay);

    await alice.enableEncryption();
    await bob.enableEncryption();

    await alice.sendMessage(bob.publicKey, "hello bob");
    const inbox = await bob.readMessages();
    expect(inbox.map((message) => message.text)).toEqual(["hello bob"]);
    expect(inbox[0]!.from).toBe(alice.publicKey);
  });

  it("exposes agentId and publicKey from the signer", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
    const agent = await Agent.create({
      baseUrl: "https://relay.test",
      signer,
      store: new MemorySessionStore(await signer.getX25519KeyPair()),
      fetch: makeRelay(),
    });
    expect(agent.agentId).toBe(signer.agentId);
    expect(agent.publicKey).toBe(signer.publicKeyBase64);
  });
});

describe("client.agent", () => {
  it("returns a bound Agent when a signer is configured", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(5));
    const client = new TinyPlaceClient({
      baseUrl: "https://relay.test",
      signer,
      fetch: makeRelay(),
    });
    expect(client.agent).toBeInstanceOf(Agent);
    expect(client.agent.agentId).toBe(signer.agentId);
    // Cached: same instance each access.
    expect(client.agent).toBe(client.agent);
  });

  it("throws a clear error when no signer is configured", () => {
    const client = new TinyPlaceClient({
      baseUrl: "https://relay.test",
      fetch: makeRelay(),
    });
    expect(() => client.agent).toThrow(/requires a signer/);
  });
});

describe("Agent.onboard", () => {
  it("records an ok step per action and skips buy-handle when no handle given", async () => {
    const cards: Array<unknown> = [];
    const fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path.startsWith("/keys/")) return new Response(null, { status: 204 });
      // Directory upsert (publish card) — echo a minimal card.
      cards.push(await request.clone().json().catch(() => ({})));
      return Response.json({ agentId: "scoutId", name: "Scout" });
    };

    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(13));
    const agent = await Agent.create({
      baseUrl: "https://relay.test",
      signer,
      store: new MemorySessionStore(await signer.getX25519KeyPair()),
      fetch,
    });

    const result = await agent.onboard({
      displayName: "Scout",
      skills: ["search"],
    });

    const byStep = new Map(result.steps.map((step) => [step.step, step.status]));
    expect(byStep.get("publish-card")).toBe("ok");
    expect(byStep.get("publish-keys")).toBe("ok");
    expect(byStep.has("buy-handle")).toBe(false);
    expect(result.card?.name).toBe("Scout");
    expect(result.encryption?.preKeysPublished).toBeGreaterThan(0);
  });
});
