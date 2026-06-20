import { describe, expect, it } from "vitest";
import {
  publishKeys,
  readMessages,
  resolveRecipientKey,
  sendMessage,
} from "../src/agent/index.js";
import {
  LocalSigner,
  MemorySessionStore,
  TinyPlaceClient,
} from "../src/index.js";
import type { MessageEnvelope, SignedKey } from "../src/index.js";

/** Minimal in-memory relay so two encrypted clients can talk end-to-end. */
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
        ...(preKeys.get(id)?.shift()
          ? { oneTimePreKey: preKeys.get(id)?.shift() }
          : {}),
        updatedAt: "2026-06-16T00:00:00.000Z",
      });
    }
    return Response.json({ error: `unhandled ${method} ${path}` }, { status: 500 });
  };
}

async function makeClient(
  seed: number,
  fetch: typeof globalThis.fetch,
): Promise<{ client: TinyPlaceClient; signer: LocalSigner }> {
  const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(seed));
  const store = new MemorySessionStore(await signer.getX25519KeyPair());
  const client = new TinyPlaceClient({
    baseUrl: "https://relay.test",
    signer,
    encryption: { store },
    fetch,
  });
  return { client, signer };
}

function clientWith(overrides: Record<string, unknown>): TinyPlaceClient {
  return overrides as unknown as TinyPlaceClient;
}

describe("resolveRecipientKey", () => {
  it("returns a raw base64 messaging key unchanged", async () => {
    const key = (await LocalSigner.generate()).publicKeyBase64;
    const resolved = await resolveRecipientKey(clientWith({}), key);
    expect(resolved).toBe(key);
  });

  it("resolves a base58 cryptoId via the directory card", async () => {
    const client = clientWith({
      directory: {
        getAgent: async () => ({
          agentId: "x",
          publicKey: "cardKey",
          metadata: { encryptionPublicKey: "advertisedKey" },
        }),
      },
    });
    const resolved = await resolveRecipientKey(
      client,
      "4S3656ssvbVpaD9yGMtwVj3e7qMZNuSSxuQuhXKccrQj",
    );
    expect(resolved).toBe("advertisedKey");
  });

  it("prefers the advertised encryption key for a @handle, then card, then identity", async () => {
    const advertised = clientWith({
      directory: {
        resolve: async () => ({
          agent: {
            publicKey: "cardKey",
            metadata: { encryptionPublicKey: "advertisedKey" },
          },
          identity: { publicKey: "idKey" },
        }),
      },
    });
    expect(await resolveRecipientKey(advertised, "@iris")).toBe("advertisedKey");

    const cardOnly = clientWith({
      directory: {
        resolve: async () => ({
          agent: { publicKey: "cardKey" },
          identity: { publicKey: "idKey" },
        }),
      },
    });
    expect(await resolveRecipientKey(cardOnly, "iris")).toBe("cardKey");

    const identityOnly = clientWith({
      directory: {
        resolve: async () => ({ identity: { publicKey: "idKey" } }),
      },
    });
    expect(await resolveRecipientKey(identityOnly, "@iris")).toBe("idKey");
  });
});

describe("sendMessage / readMessages round-trip", () => {
  it("encrypts on the wire and decrypts to the peer through the facade", async () => {
    const relay = makeRelay();
    const alice = await makeClient(11, relay);
    const bob = await makeClient(22, relay);

    await publishKeys(alice.client, alice.signer);
    await publishKeys(bob.client, bob.signer);

    const sent = await sendMessage(
      alice.client,
      alice.signer,
      bob.signer.publicKeyBase64,
      "hello bob",
    );
    expect(sent.to).toBe(bob.signer.publicKeyBase64);

    // Ciphertext on the wire (first message bootstraps X3DH).
    const raw = await bob.client.messages.listRaw(bob.signer.publicKeyBase64);
    expect(raw.messages[0]!.body).not.toBe("hello bob");

    // Facade read decrypts + acks.
    const inbox = await readMessages(bob.client, bob.signer);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.text).toBe("hello bob");
    expect(inbox[0]!.from).toBe(alice.signer.publicKeyBase64);

    // Consumed on read.
    expect(await readMessages(bob.client, bob.signer)).toHaveLength(0);
  });
});
