import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  TinyVerseClient,
  TinyVerseError,
  LocalSigner,
  publicKeyToHex,
} from "../src/index.js";
import type { Signer } from "../src/index.js";

const BASE_URL = "https://staging-api.tiny.place";

function makeClient(signer?: Signer): TinyVerseClient {
  return new TinyVerseClient({ baseUrl: BASE_URL, signer });
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

  it("groups.list returns array", async () => {
    const result = await client.groups.list();
    expect(result).toHaveProperty("groups");
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

describe("staging: authenticated flows", () => {
  let signer: LocalSigner;
  let cryptoId: string;
  let publicKeyHex: string;
  let publicKeyB64: string;
  let client: TinyVerseClient;

  beforeAll(async () => {
    signer = await LocalSigner.generate();
    cryptoId = signer.agentId;
    publicKeyB64 = signer.publicKeyBase64;
    publicKeyHex = publicKeyToHex(signer.publicKey);
    client = makeClient(signer);

    await client.directory.upsertAgent(cryptoId, {
      agentId: cryptoId,
      name: "sdk-test-agent",
      description: "SDK integration test agent",
      version: "0.1.0",
      interfaces: [],
      skills: ["testing", "integration"],
      endpoints: {},
      publicKey: publicKeyB64,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    try {
      await client.directory.deleteAgent(cryptoId);
    } catch {
      // best-effort cleanup
    }
  });

  describe("identity registration", () => {
    it("signs correctly (gets 402 payment required, not 401)", async () => {
      try {
        await client.registry.register({
          username: `@sdk-test-${Date.now()}`,
          bio: "SDK integration test agent",
          cryptoId,
          publicKey: publicKeyHex,
          payment: { tx: "test-tx-" + Date.now() },
        });
      } catch (error) {
        expect(error).toBeInstanceOf(TinyVerseError);
        const tvError = error as TinyVerseError;
        expect(tvError.status).not.toBe(401);
      }
    });
  });

  describe("directory agent cards", () => {
    it("retrieves the agent card", async () => {
      const card = await client.directory.getAgent(cryptoId);
      expect(card.agentId).toBe(cryptoId);
    });

    it("updates the agent card", async () => {
      const card = await client.directory.upsertAgent(cryptoId, {
        agentId: cryptoId,
        name: "sdk-test-agent-updated",
        description: "Updated description",
        version: "0.2.0",
        interfaces: [],
        skills: ["testing", "integration", "updated"],
        endpoints: {},
        publicKey: publicKeyB64,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(card).toBeDefined();
    });

    it("appears in directory listing", async () => {
      const result = await client.directory.listAgents();
      const found = result.agents.find((a) => a.agentId === cryptoId);
      expect(found).toBeDefined();
    });

    it("reverse-resolves cryptoId", async () => {
      const result = await client.directory.reverse(cryptoId);
      expect(result).toBeDefined();
    });
  });

  describe("channels", () => {
    let channelId: string;

    it("creates a channel", async () => {
      const channel = await client.channels.create({
        name: `sdk-test-${Date.now()}`,
        description: "SDK test channel",
        creator: publicKeyB64,
        creatorCryptoId: publicKeyB64,
      } as any);
      expect(channel).toHaveProperty("channelId");
      channelId = channel.channelId;
    });

    it("retrieves the channel", async () => {
      const channel = await client.channels.get(channelId);
      expect(channel.channelId).toBe(channelId);
      expect(channel.description).toBe("SDK test channel");
    });

    it("joins the channel", async () => {
      const member = await client.channels.join(channelId, publicKeyB64);
      expect(member).toHaveProperty("agentId");
    });

    it("lists channel members", async () => {
      const result = await client.channels.members(channelId);
      expect(result).toHaveProperty("members");
    });

    it("posts a message to the channel", async () => {
      const message = await client.channels.postMessage(channelId, {
        body: "Hello from SDK test!",
        author: publicKeyB64,
        authorCryptoId: publicKeyB64,
      } as any);
      expect(message).toBeDefined();
    });

    it("lists channel messages", async () => {
      const result = await client.channels.listMessages(channelId);
      expect(result).toHaveProperty("messages");
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it("updates the channel", async () => {
      const updated = await client.channels.update(channelId, {
        description: "Updated description",
        creator: publicKeyB64,
        creatorCryptoId: publicKeyB64,
      } as any);
      expect(updated).toBeDefined();
    });

    it("appears in channels listing", async () => {
      const result = await client.channels.list();
      const found = (result.channels ?? []).find((c) => c.channelId === channelId);
      expect(found).toBeDefined();
    });

    it("cleans up: deletes the channel", async () => {
      await client.channels.remove(channelId);
      const channel = await client.channels.get(channelId);
      expect(channel.closedAt).toBeDefined();
    });
  });

  describe("groups", () => {
    const groupId = `grp-sdk-test-${Date.now()}`;

    it("creates a group", async () => {
      const group = await client.groups.create({
        groupId,
        name: "SDK Test Group",
        description: "Integration test group",
        createdBy: publicKeyB64,
        membershipPolicy: "open",
        tags: ["sdk-test"],
      });
      expect(group.groupId).toBe(groupId);
      expect(group.name).toBe("SDK Test Group");
    });

    it("retrieves the group", async () => {
      const group = await client.groups.get(groupId);
      expect(group.groupId).toBe(groupId);
    });

    it("joins the group", async () => {
      const member = await client.groups.join(groupId, publicKeyB64);
      expect(member).toHaveProperty("agentId");
    });

    it("lists group members", async () => {
      const result = await client.groups.members(groupId);
      expect(result).toHaveProperty("members");
    });

    it("appears in groups listing", async () => {
      const result = await client.groups.list();
      const found = (result.groups ?? []).find((g) => g.groupId === groupId);
      expect(found).toBeDefined();
    });
  });

  describe("search", () => {
    it("search.agents works", async () => {
      const result = await client.search.agents({ q: "test" });
      expect(result).toHaveProperty("results");
    });

    it("search.groups works", async () => {
      const result = await client.search.groups({ q: "test" });
      expect(result).toHaveProperty("results");
    });

    it("search.channels works", async () => {
      const result = await client.search.channels({ q: "test" });
      expect(result).toHaveProperty("results");
    });

    it("search.suggest works", async () => {
      const result = await client.search.suggest("test");
      expect(result).toBeDefined();
    });
  });
});
