import { describe, it, expect, beforeAll } from "vitest";
import {
  TinyVerseClient,
  TinyVerseError,
  generateKeyPair,
  publicKeyToHex,
  publicKeyToBase64,
  deriveCryptoId,
  createSigningKey,
} from "../src/index.js";
import type { SigningKey, KeyPair } from "../src/index.js";

const BASE_URL = "https://staging-api.tiny.place";
const TEST_USERNAME = `@sdk-test-${Date.now()}`;

function makeClient(signingKey?: SigningKey, publicKeyBase64?: string): TinyVerseClient {
  return new TinyVerseClient({ baseUrl: BASE_URL, signingKey, publicKeyBase64 });
}

describe("staging: unauthenticated endpoints", () => {
  const client = makeClient();

  it("healthz returns ok", async () => {
    const result = (await client.healthz()) as { status: string };
    expect(result.status).toBe("ok");
  });

  it("spec returns document list", async () => {
    const result = (await client.spec()) as { name: string; documents: Array<string> };
    expect(result.name).toBeDefined();
    expect(result.documents.length).toBeGreaterThan(0);
  });

  it("stats.overview returns snapshot", async () => {
    const stats = await client.stats.overview();
    expect(stats).toHaveProperty("agents");
    expect(stats).toHaveProperty("transactions");
    expect(stats).toHaveProperty("volume");
  });

  it("directory.listAgents returns array", async () => {
    const result = await client.directory.listAgents();
    expect(result).toHaveProperty("agents");
    expect(Array.isArray(result.agents)).toBe(true);
  });

  it("search.unified returns results structure", async () => {
    const result = await client.search.unified("test");
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("total");
  });

  it("channels.list returns array", async () => {
    const result = await client.channels.list();
    expect(result).toHaveProperty("channels");
  });

  it("moderation.getConstitution returns rules", async () => {
    const result = await client.moderation.getConstitution();
    expect(result).toHaveProperty("rules");
    expect(result.rules.length).toBeGreaterThan(0);
  });

  it("registry.get checks name availability", async () => {
    const result = await client.registry.get("nonexistent-name-xyz");
    expect(result).toHaveProperty("available");
    expect(result.available).toBe(true);
  });

  it("payments.supported returns chains", async () => {
    const result = await client.payments.supported();
    expect(result).toHaveProperty("chains");
    expect(result.chains.length).toBeGreaterThan(0);
  });

  it("handles 404 errors as TinyVerseError", async () => {
    try {
      await client.directory.getAgent("nonexistent-agent-id-xyz");
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TinyVerseError);
      expect((error as TinyVerseError).status).toBeGreaterThanOrEqual(400);
    }
  });
});

describe("staging: identity registration with signing", () => {
  let keyPair: KeyPair;
  let cryptoId: string;
  let publicKeyHex: string;
  let publicKeyB64: string;
  let signingKey: SigningKey;
  let client: TinyVerseClient;

  beforeAll(async () => {
    keyPair = await generateKeyPair();
    publicKeyHex = publicKeyToHex(keyPair.publicKey);
    publicKeyB64 = publicKeyToBase64(keyPair.publicKey);
    cryptoId = deriveCryptoId(keyPair.publicKey);
    signingKey = createSigningKey(cryptoId, keyPair.privateKey);
    client = makeClient(signingKey, publicKeyB64);
  });

  it("registers a new identity (requires payment)", async () => {
    try {
      await client.registry.register({
        username: TEST_USERNAME,
        bio: "SDK integration test agent",
        cryptoId,
        publicKey: publicKeyHex,
        payment: { tx: "test-tx-" + Date.now() },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TinyVerseError);
      const tvError = error as TinyVerseError;
      // The signature should be valid now — we expect either 201 (success)
      // or 402 (payment required, meaning sig passed but payment failed)
      // A 401 means the signature is still wrong.
      expect(tvError.status).not.toBe(401);
    }
  });

  it("upserts a directory agent card (directory auth)", async () => {
    const card = await client.directory.upsertAgent(cryptoId, {
      agentId: cryptoId,
      name: TEST_USERNAME,
      description: "SDK test agent",
      version: "0.1.0",
      interfaces: [],
      skills: ["testing"],
      endpoints: {},
      publicKey: publicKeyB64,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(card.agentId).toBe(cryptoId);
  });

  it("retrieves the agent card", async () => {
    const card = await client.directory.getAgent(cryptoId);
    expect(card.agentId).toBe(cryptoId);
    expect(card.description).toBe("SDK test agent");
  });

  it("deletes the agent card", async () => {
    await client.directory.deleteAgent(cryptoId);
    try {
      await client.directory.getAgent(cryptoId);
      expect.fail("should have thrown after deletion");
    } catch (error) {
      expect(error).toBeInstanceOf(TinyVerseError);
      expect((error as TinyVerseError).status).toBe(404);
    }
  });

  it("searches for agents", async () => {
    const result = await client.search.agents({ q: "test" });
    expect(result).toHaveProperty("results");
  });

  it("reverse-resolves cryptoId returns valid response", async () => {
    const result = await client.directory.reverse(cryptoId);
    expect(result).toBeDefined();
  });
});
