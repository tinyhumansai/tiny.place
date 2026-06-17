import { describe, expect, it } from "vitest";
import {
  LocalSigner,
  MemorySessionStore,
  TinyPlaceClient,
} from "../src/index.js";
import type { MessageEnvelope, SignedKey } from "../src/index.js";

/**
 * Minimal in-memory relay so two encrypted clients can talk end-to-end without a
 * backend: it stores pending envelopes per recipient and serves each agent's
 * published key bundle (popping a one-time pre-key per fetch, like the real relay).
 */
function makeRelay(): typeof globalThis.fetch {
  const inbox = new Map<string, Array<MessageEnvelope>>();
  const signedPreKeys = new Map<string, SignedKey>();
  const preKeys = new Map<string, Array<SignedKey>>();

  return async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ── messages ──
    if (path === "/messages" && method === "PUT") {
      const envelope = (await request.json()) as MessageEnvelope;
      const queue = inbox.get(envelope.to) ?? [];
      queue.push(envelope);
      inbox.set(envelope.to, queue);
      return Response.json(envelope, { status: 202 });
    }
    if (path === "/messages" && method === "GET") {
      const agentId = url.searchParams.get("agentId") ?? "";
      return Response.json({ messages: inbox.get(agentId) ?? [] });
    }
    if (path.startsWith("/messages/") && method === "DELETE") {
      const id = decodeURIComponent(path.slice("/messages/".length));
      const agentId = url.searchParams.get("agentId") ?? "";
      const queue = inbox.get(agentId) ?? [];
      inbox.set(
        agentId,
        queue.filter((envelope) => envelope.id !== id),
      );
      return new Response(null, { status: 204 });
    }

    // ── keys ──
    const signedMatch = path.match(/^\/keys\/([^/]+)\/signed-prekey$/);
    if (signedMatch && method === "PUT") {
      const id = decodeURIComponent(signedMatch[1]!);
      const body = (await request.json()) as { signedPreKey: SignedKey };
      signedPreKeys.set(id, body.signedPreKey);
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
      const oneTimePreKey = preKeys.get(id)?.shift();
      return Response.json({
        agentId: id,
        identityKey: id,
        signedPreKey,
        ...(oneTimePreKey ? { oneTimePreKey } : {}),
        updatedAt: "2026-06-16T00:00:00.000Z",
      });
    }

    return Response.json({ error: `unhandled ${method} ${path}` }, { status: 500 });
  };
}

async function makeClient(
  seed: number,
  fetch: typeof globalThis.fetch,
): Promise<{ client: TinyPlaceClient; address: string }> {
  const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(seed));
  const store = new MemorySessionStore(await signer.getX25519KeyPair());
  const client = new TinyPlaceClient({
    baseUrl: "https://relay.test",
    signer,
    encryption: { store },
    fetch,
  });
  return { client, address: signer.publicKeyBase64 };
}

function envelope(
  from: string,
  to: string,
  body: string,
): MessageEnvelope {
  return {
    id: `m_${Math.round(performance.now() * 1000)}_${body.length}`,
    from,
    to,
    timestamp: "2026-06-16T00:00:00.000Z",
    deviceId: 1,
    type: "CIPHERTEXT",
    body,
  };
}

describe("transparent E2E messaging", () => {
  it("round-trips a message: ciphertext on the wire, plaintext to the peer", async () => {
    const relay = makeRelay();
    const { client: alice, address: aliceAddr } = await makeClient(11, relay);
    const { client: bob, address: bobAddr } = await makeClient(22, relay);

    // Both publish bundles so either can initiate.
    await alice.enableEncryption();
    await bob.enableEncryption();

    // Alice → Bob (first message: X3DH establishes the session).
    await alice.messages.send(envelope(aliceAddr, bobAddr, "hello bob"));

    // What actually landed on the relay is ciphertext, not the plaintext.
    const raw = await bob.messages.listRaw(bobAddr);
    expect(raw.messages).toHaveLength(1);
    expect(raw.messages[0]!.body).not.toBe("hello bob");
    expect(raw.messages[0]!.type).toBe("PREKEY_BUNDLE");

    // Transparent decrypt on receive.
    const inbound = await bob.messages.list(bobAddr);
    expect(inbound.messages).toHaveLength(1);
    expect(inbound.messages[0]!.body).toBe("hello bob");
    expect(inbound.messages[0]!.from).toBe(aliceAddr);

    // Consumed: a second poll is empty (acked during decrypt).
    expect((await bob.messages.list(bobAddr)).messages).toHaveLength(0);

    // Bob → Alice on the established ratchet (no bundle fetch needed).
    await bob.messages.send(envelope(bobAddr, aliceAddr, "hi alice"));
    const reply = await alice.messages.list(aliceAddr);
    expect(reply.messages.map((message) => message.body)).toEqual(["hi alice"]);
  });

  it("leaves messages plaintext when encryption is not configured", async () => {
    const relay = makeRelay();
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(33));
    const plain = new TinyPlaceClient({
      baseUrl: "https://relay.test",
      signer,
      fetch: relay,
    });
    const addr = signer.publicKeyBase64;

    await plain.messages.send(envelope(addr, addr, "plaintext body"));
    const got = await plain.messages.list(addr);
    expect(got.messages[0]!.body).toBe("plaintext body");
  });
});
