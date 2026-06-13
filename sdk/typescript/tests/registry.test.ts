import { describe, expect, it } from "vitest";
import {
  canonicalPayload,
  LocalSigner,
  TinyVerseClient,
} from "../src/index.js";

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function fromBase64Url(value: string): string {
  const padded = value.padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  return atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
}

async function verifyFreshSignature(
  signer: LocalSigner,
  signature: string,
  payload: string,
): Promise<boolean> {
  const [version, timestamp, nonce, rawSignature] = signature.split(":");
  expect(version).toBe("v1");
  expect(timestamp).toBeTruthy();
  expect(nonce).toBeTruthy();
  expect(rawSignature).toBeTruthy();

  const publicKey = await globalThis.crypto.subtle.importKey(
    "raw",
    signer.publicKey,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return globalThis.crypto.subtle.verify(
    "Ed25519",
    publicKey,
    fromBase64(rawSignature!),
    new TextEncoder().encode(
      `${payload}\n${fromBase64Url(timestamp!)}\n${fromBase64Url(nonce!)}`,
    ),
  );
}

describe("RegistryApi", () => {
  it("signs registration with empty omitted metadata and null payment methods", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(19));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          username: "@agent",
          bio: "Agent",
          cryptoId: signer.agentId,
          publicKey: signer.publicKeyBase64,
          registeredAt: "2026-06-13T00:00:00Z",
          expiresAt: "2027-06-13T00:00:00Z",
          status: "active",
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    await client.registry.register({
      username: "@agent",
      bio: "Agent",
      cryptoId: signer.agentId,
      publicKey: signer.publicKeyBase64,
    });

    expect(requests).toHaveLength(1);
    const body = (await requests[0]!.json()) as {
      bio: string;
      cryptoId: string;
      publicKey: string;
      signature: string;
      username: string;
    };
    expect(body.signature).toBeTruthy();

    const ok = await verifyFreshSignature(
      signer,
      body.signature,
      canonicalPayload("identity.register", {
        bio: "Agent",
        cryptoId: signer.agentId,
        metadata: {},
        paymentMethods: null,
        publicKey: signer.publicKeyBase64,
        username: "@agent",
      }),
    );
    expect(ok).toBe(true);
  });

  it("signs profile visibility updates with null omitted fields", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(16));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          activity: false,
          groups: true,
          broadcasts: true,
          attestations: true,
          agentCard: true,
          searchEngineIndexing: false,
        });
      },
    });

    await client.registry.updateProfileVisibility("@agent", {
      activity: false,
      searchEngineIndexing: false,
    });

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("PUT");
    expect(request.url).toBe(
      "https://example.test/registry/names/%40agent/profile-visibility",
    );

    const body = (await request.json()) as {
      activity: boolean;
      agentCard?: boolean;
      attestations?: boolean;
      broadcasts?: boolean;
      groups?: boolean;
      searchEngineIndexing: boolean;
      signature: string;
    };
    expect(body).toMatchObject({
      activity: false,
      searchEngineIndexing: false,
    });
    expect(body.signature).toBeTruthy();

    const ok = await verifyFreshSignature(
      signer,
      body.signature,
      canonicalPayload("identity.profile.visibility", {
        activity: false,
        agentCard: null,
        attestations: null,
        broadcasts: null,
        groups: null,
        searchEngineIndexing: false,
        username: "@agent",
      }),
    );
    expect(ok).toBe(true);
  });

  it("treats renewal and auction claim responses as identities", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(17));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          username: "@agent",
          bio: "Agent",
          cryptoId: signer.agentId,
          publicKey: signer.publicKeyBase64,
          registeredAt: "2026-06-13T00:00:00Z",
          expiresAt: "2027-06-13T00:00:00Z",
          status: "active",
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    const renewed = await client.registry.renew("@agent", {
      payment: { tx: "tx_renew" },
    });
    const claimed = await client.registry.claim("@agent", {
      cryptoId: signer.agentId,
      publicKey: signer.publicKeyBase64,
      payment: { tx: "tx_claim" },
    });

    expect(renewed.username).toBe("@agent");
    expect(claimed.publicKey).toBe(signer.publicKeyBase64);
    expect(requests.map((request) => [request.method, request.url])).toEqual([
      ["POST", "https://example.test/registry/names/%40agent/renew"],
      ["POST", "https://example.test/registry/names/%40agent/claim"],
    ]);
  });

  it("sends subname delete ownership signatures in the header", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(18));
    const requests: Array<Request> = [];
    const client = new TinyVerseClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          username: "@agent",
          bio: "Agent",
          cryptoId: signer.agentId,
          publicKey: signer.publicKeyBase64,
          subnames: [],
          registeredAt: "2026-06-13T00:00:00Z",
          expiresAt: "2027-06-13T00:00:00Z",
          status: "active",
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    const updated = await client.registry.deleteSubname("@agent", "@agent/v2");

    expect(updated.subnames).toEqual([]);
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("DELETE");
    expect(request.url).toBe(
      "https://example.test/registry/names/%40agent/subnames/%40agent%2Fv2",
    );
    expect(request.headers.get("Authorization")).toBeNull();
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    await expect(request.text()).resolves.toBe("");

    const ok = await verifyFreshSignature(
      signer,
      request.headers.get("X-TinyPlace-Signature")!,
      canonicalPayload("identity.subname.delete", {
        subname: "@agent/v2",
        username: "@agent",
      }),
    );
    expect(ok).toBe(true);
  });
});
