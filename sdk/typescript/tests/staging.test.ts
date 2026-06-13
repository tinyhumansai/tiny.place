import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  TinyVerseClient,
  TinyVerseError,
  LocalSigner,
  publicKeyToHex,
  SignalSession,
  MemorySessionStore,
  generateSignedPreKey,
  generatePreKeys,
  serializeSignedKey,
  serializePreKey,
} from "../src/index.js";
import type { Signer } from "../src/index.js";
import { toBase64, ed25519PubToX25519Pub } from "../src/signal/crypto.js";

const BASE_URL = "https://staging-api.tiny.place";
const SOLANA_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const BASE_NETWORK = "eip155:8453";
const RATE_LIMIT_RETRY_PADDING_MS = 250;
const MAX_RATE_LIMIT_RETRIES = 2;

function makeClient(signer?: Signer): TinyVerseClient {
  return new TinyVerseClient({
    baseUrl: BASE_URL,
    fetch: fetchWithRateLimitRetry,
    signer,
  });
}

async function fetchWithRateLimitRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let response = await fetch(input, init);
  for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    if (response.status !== 429) {
      return response;
    }

    const delayMs = rateLimitDelayMs(response);
    await delay(delayMs);
    response = await fetch(input, init);
  }
  return response;
}

function rateLimitDelayMs(response: Response): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds)) {
      return retryAfterSeconds * 1000 + RATE_LIMIT_RETRY_PADDING_MS;
    }

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.max(0, retryAt - Date.now()) + RATE_LIMIT_RETRY_PADDING_MS;
    }
  }

  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    return Math.max(0, reset * 1000 - Date.now()) + RATE_LIMIT_RETRY_PADDING_MS;
  }

  return 1000 + RATE_LIMIT_RETRY_PADDING_MS;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

describe("staging: unauthenticated endpoints", () => {
  const client = makeClient();

  it("healthz returns ok", async () => {
    const result = (await client.healthz()) as { status: string };
    expect(result.status).toBe("ok");
  });

  it("spec returns document list", async () => {
    const result = (await client.spec()) as {
      name: string;
      documents: Array<string>;
    };
    expect(result.name).toBeDefined();
    expect(result.documents.length).toBeGreaterThan(0);
  });

  it("docs.swaggerJson returns the live OpenAPI document", async () => {
    const result = await client.docs.swaggerJson();
    expect(result).toHaveProperty("paths");
    expect(Object.keys(result.paths as Record<string, unknown>).length).toBeGreaterThan(
      0,
    );
  });

  it("docs.terms returns the current terms document", async () => {
    const result = await client.docs.terms();
    expect(result.version).toBeDefined();
    expect(result.effectiveDate).toBeDefined();
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("docs.termsHistory returns prior terms documents", async () => {
    const result = await client.docs.termsHistory();
    expect(Array.isArray(result.terms)).toBe(true);
    expect(result.terms.length).toBeGreaterThan(0);
  });

  it("stats.overview returns snapshot", async () => {
    const stats = await client.stats.overview();
    expect(stats).toHaveProperty("agents");
    expect(stats).toHaveProperty("transactions");
    expect(stats).toHaveProperty("volume");
  });

  it("stats.agents returns agent stats", async () => {
    const stats = await client.stats.agents();
    expect(stats).toBeDefined();
  });

  it("stats.transactions returns transaction stats", async () => {
    const stats = await client.stats.transactions();
    expect(stats).toBeDefined();
  });

  it("stats.volume returns volume stats", async () => {
    const stats = await client.stats.volume();
    expect(stats).toBeDefined();
  });

  it("directory.listAgents returns array", async () => {
    const result = await client.directory.listAgents();
    expect(result).toHaveProperty("agents");
    expect(Array.isArray(result.agents)).toBe(true);
  });

  it("directory.listIdentities returns identity listings", async () => {
    const result = await client.directory.listIdentities({ limit: 3 });
    expect(result).toHaveProperty("identities");
    expect(Array.isArray(result.identities)).toBe(true);
    expect(result).toHaveProperty("cursor");
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

  it("channels.trending returns array", async () => {
    const result = await client.channels.trending();
    expect(result).toHaveProperty("channels");
  });

  it("channels.categories returns array", async () => {
    const result = await client.channels.categories();
    expect(result).toHaveProperty("categories");
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

  it("marketplace.listIdentities returns identities array", async () => {
    const result = await client.marketplace.listIdentities({ limit: 3 });
    expect(result).toHaveProperty("identities");
    expect(Array.isArray(result.identities)).toBe(true);
  });

  it("marketplace.featured returns items array", async () => {
    const result = await client.marketplace.featured();
    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("marketplace.recent returns sales array", async () => {
    const result = await client.marketplace.recent();
    expect(result).toHaveProperty("sales");
    expect(Array.isArray(result.sales)).toBe(true);
  });

  it("marketplace.identityFloor returns floor metadata", async () => {
    const result = await client.marketplace.identityFloor(6);
    expect(result.length).toBe(6);
  });

  it("marketplace.identitySaleHistory returns history field", async () => {
    const result = await client.marketplace.identitySaleHistory("@alpha");
    expect(result).toHaveProperty("history");
  });

  it("swap status route returns API errors through TinyVerseError", async () => {
    try {
      await client.pricing.getSwapStatus("missing-codex-status");
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TinyVerseError);
      expect((error as TinyVerseError).status).toBeGreaterThanOrEqual(400);
    }
  });

  it("bridge status route returns API errors through TinyVerseError", async () => {
    try {
      await client.pricing.getBridgeStatus("missing-codex-status");
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TinyVerseError);
      expect((error as TinyVerseError).status).toBeGreaterThanOrEqual(400);
    }
  });

  it("groups.list returns array", async () => {
    const result = await client.groups.list();
    expect(result).toHaveProperty("groups");
  });

  it("broadcasts.list returns array", async () => {
    const result = await client.broadcasts.list();
    expect(result).toHaveProperty("broadcasts");
  });

  it("events.list returns array", async () => {
    const result = await client.events.list();
    expect(result).toHaveProperty("events");
  });

  it("rooms.list returns array", async () => {
    const result = await client.rooms.list();
    expect(result).toHaveProperty("rooms");
    expect(Array.isArray(result.rooms)).toBe(true);
  });

  it("reputation.leaderboard returns data", async () => {
    const result = await client.reputation.leaderboard();
    expect(result).toBeDefined();
  });

  it("reputation.gamesLeaderboard returns data", async () => {
    const result = await client.reputation.gamesLeaderboard({ limit: 5 });
    expect(result).toBeDefined();
  });

  it("reputation.groupsLeaderboard returns data", async () => {
    const result = await client.reputation.groupsLeaderboard({ limit: 5 });
    expect(result).toHaveProperty("leaderboard");
    expect(result.leaderboard).toBe("groups");
  });

  it("reputation.messagesLeaderboard returns data", async () => {
    const result = await client.reputation.messagesLeaderboard({ limit: 5 });
    expect(result).toHaveProperty("leaderboard");
    expect(result.leaderboard).toBe("messages");
  });

  it("reputation.volumeLeaderboard returns data", async () => {
    const result = await client.reputation.volumeLeaderboard({ limit: 5 });
    expect(result).toHaveProperty("leaderboard");
    expect(result.leaderboard).toBe("volume");
  });

  it("pricing.swapQuote accepts live quote parameters", async () => {
    const result = await client.pricing.swapQuote({
      from: "SOL",
      to: "USDC",
      amount: "1",
      network: SOLANA_NETWORK,
    });
    expect(result).toHaveProperty("quoteId");
    expect(result.from.asset).toBe("SOL");
    expect(result.to.asset).toBe("USDC");
  });

  it("pricing.bridgeRoutes accepts live route parameters", async () => {
    const result = await client.pricing.bridgeRoutes({
      from: SOLANA_NETWORK,
      to: BASE_NETWORK,
      asset: "USDC",
    });
    expect(result).toHaveProperty("routes");
    expect(Array.isArray(result.routes)).toBe(true);
  });

  it("pricing.bridgeQuote accepts live quote parameters", async () => {
    const result = await client.pricing.bridgeQuote({
      from: SOLANA_NETWORK,
      to: BASE_NETWORK,
      asset: "USDC",
      amount: "1",
    });
    expect(result).toHaveProperty("quoteId");
    expect(result.provider).toBeDefined();
  });

  it("search.suggest returns suggestions", async () => {
    const result = await client.search.suggest("test");
    expect(result).toBeDefined();
  });

  it("search.trending returns discover data", async () => {
    const result = await client.search.trending();
    expect(result).toBeDefined();
  });

  it("search.newest returns discover data", async () => {
    const result = await client.search.newest();
    expect(result).toBeDefined();
  });

  it("search.categories returns category list", async () => {
    const result = await client.search.categories();
    expect(result).toHaveProperty("categories");
  });

  it("moderation.listActions returns array", async () => {
    const result = await client.moderation.listActions();
    expect(result).toHaveProperty("actions");
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
      const found = (result.channels ?? []).find(
        (c) => c.channelId === channelId,
      );
      expect(found).toBeDefined();
    });

    it("cleans up: deletes the channel", async () => {
      await client.channels.remove(channelId);
      const channel = await client.channels.get(channelId);
      expect(channel.closedAt).toBeDefined();
    });
  });

  describe("conversations", () => {
    let conversationId: string;
    let messageId: string;

    it("creates a conversation", async () => {
      const conversation = await client.conversations.create({
        type: "public_group",
        name: `sdk-conversation-${Date.now()}`,
        description: "SDK test conversation",
        creator: publicKeyB64,
        creatorCryptoId: publicKeyB64,
        membershipPolicy: "open",
        visibility: "public",
      });
      expect(conversation).toHaveProperty("conversationId");
      conversationId = conversation.conversationId;
    });

    it("retrieves the conversation", async () => {
      const conversation = await client.conversations.get(conversationId);
      expect(conversation.conversationId).toBe(conversationId);
      expect(conversation.description).toBe("SDK test conversation");
    });

    it("lists conversation members", async () => {
      const result = await client.conversations.members(conversationId);
      expect(result.members.length).toBeGreaterThan(0);
    });

    it("posts a conversation message", async () => {
      const message = await client.conversations.postMessage(conversationId, {
        body: "Hello from SDK conversation test!",
        author: publicKeyB64,
        authorCryptoId: publicKeyB64,
      });
      expect(message).toHaveProperty("messageId");
      messageId = message.messageId;
    });

    it("lists conversation messages", async () => {
      const result = await client.conversations.listMessages(conversationId);
      const found = result.messages.find(
        (message) => message.messageId === messageId,
      );
      expect(found).toBeDefined();
    });

    it("updates the conversation", async () => {
      const updated = await client.conversations.update(conversationId, {
        description: "Updated SDK test conversation",
      });
      expect(updated.description).toBe("Updated SDK test conversation");
    });

    it("appears in conversation listing", async () => {
      const result = await client.conversations.list({ creator: publicKeyB64 });
      const found = result.conversations.find(
        (conversation) => conversation.conversationId === conversationId,
      );
      expect(found).toBeDefined();
    });

    it("deletes the conversation message", async () => {
      await client.conversations.deleteMessage(conversationId, messageId);
    });

    it("cleans up: deletes the conversation", async () => {
      await client.conversations.remove(conversationId);
      const conversation = await client.conversations.get(conversationId);
      expect(conversation.closedAt).toBeDefined();
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

  describe("broadcasts", () => {
    let broadcastId: string;

    it("creates a broadcast", async () => {
      const broadcast = await client.broadcasts.create({
        name: `sdk-broadcast-${Date.now()}`,
        description: "SDK test broadcast",
        owner: publicKeyB64,
        ownerCryptoId: publicKeyB64,
        visibility: "public",
      } as any);
      expect(broadcast).toHaveProperty("broadcastId");
      broadcastId = broadcast.broadcastId;
    });

    it("retrieves the broadcast", async () => {
      const broadcast = await client.broadcasts.get(broadcastId);
      expect(broadcast.broadcastId).toBe(broadcastId);
    });

    it("subscribes to the broadcast", async () => {
      const sub = await client.broadcasts.subscribe(broadcastId);
      expect(sub).toBeDefined();
    });

    it("lists subscribers", async () => {
      const result = await client.broadcasts.subscribers(broadcastId);
      expect(result).toHaveProperty("subscribers");
    });

    it("posts a message to the broadcast", async () => {
      const message = await client.broadcasts.postMessage(broadcastId, {
        body: "Broadcast from SDK test!",
        publisher: publicKeyB64,
      });
      expect(message).toBeDefined();
    });

    it("lists broadcast messages", async () => {
      const result = await client.broadcasts.listMessages(broadcastId);
      expect(result).toHaveProperty("messages");
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it("updates the broadcast", async () => {
      const updated = await client.broadcasts.update(broadcastId, {
        description: "Updated broadcast",
      } as any);
      expect(updated).toBeDefined();
    });

    it("appears in broadcasts listing", async () => {
      const result = await client.broadcasts.list();
      const found = (result.broadcasts ?? []).find(
        (b) => b.broadcastId === broadcastId,
      );
      expect(found).toBeDefined();
    });

    it("unsubscribes from the broadcast", async () => {
      await client.broadcasts.unsubscribe(broadcastId);
    });

    it("cleans up: deletes the broadcast", async () => {
      await client.broadcasts.remove(broadcastId);
    });
  });

  describe("events", () => {
    let eventId: string;

    it("creates an event", async () => {
      const event = await client.events.create({
        title: `SDK Test Event ${Date.now()}`,
        description: "Integration test event",
        type: "meetup",
        host: publicKeyB64,
        hostCryptoId: publicKeyB64,
        schedule: {
          startAt: new Date(Date.now() + 3600000).toISOString(),
          endAt: new Date(Date.now() + 7200000).toISOString(),
        },
        visibility: "public",
      } as any);
      expect(event).toHaveProperty("eventId");
      eventId = event.eventId;
    });

    it("retrieves the event", async () => {
      const event = await client.events.get(eventId);
      expect(event.eventId).toBe(eventId);
    });

    it("RSVPs to the event", async () => {
      const attendee = await client.events.rsvp(eventId);
      expect(attendee).toBeDefined();
    });

    it("lists attendees", async () => {
      const result = await client.events.attendees(eventId);
      expect(result).toHaveProperty("attendees");
    });

    it("updates the event", async () => {
      const updated = await client.events.update(eventId, {
        description: "Updated event description",
      } as any);
      expect(updated).toBeDefined();
    });

    it("appears in events listing", async () => {
      const result = await client.events.list();
      const found = (result.events ?? []).find((e) => e.eventId === eventId);
      expect(found).toBeDefined();
    });

    it("cleans up: deletes the event", async () => {
      await client.events.remove(eventId);
    });
  });

  describe("relay messages (Signal encrypted)", () => {
    let secondSigner: LocalSigner;
    let secondClient: TinyVerseClient;
    let secondPubKeyB64: string;
    let aliceSignal: SignalSession;
    let bobSignal: SignalSession;

    beforeAll(async () => {
      secondSigner = await LocalSigner.generate();
      secondPubKeyB64 = secondSigner.publicKeyBase64;
      secondClient = makeClient(secondSigner);

      await secondClient.directory.upsertAgent(secondSigner.agentId, {
        agentId: secondSigner.agentId,
        name: "sdk-test-agent-2",
        description: "Second SDK test agent",
        version: "0.1.0",
        interfaces: [],
        skills: [],
        endpoints: {},
        publicKey: secondPubKeyB64,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const aliceX25519 = await signer.getX25519KeyPair();
      const bobX25519 = await secondSigner.getX25519KeyPair();

      const aliceStore = new MemorySessionStore(aliceX25519);
      const bobStore = new MemorySessionStore(bobX25519);

      const bobSignedPreKey = await generateSignedPreKey(secondSigner, "spk_1");
      const bobPreKeys = await generatePreKeys(secondSigner, 1, 5);

      await bobStore.storeSignedPreKey(bobSignedPreKey);
      for (const pk of bobPreKeys) {
        await bobStore.storePreKey(pk);
      }

      await secondClient.keys.rotateSignedPreKey(secondPubKeyB64, {
        identityKey: secondPubKeyB64,
        signedPreKey: serializeSignedKey(bobSignedPreKey),
      });
      await secondClient.keys.uploadPreKeys(secondPubKeyB64, {
        identityKey: secondPubKeyB64,
        preKeys: bobPreKeys.map(serializePreKey),
      });

      aliceSignal = new SignalSession(aliceStore, aliceX25519.publicKey);
      bobSignal = new SignalSession(bobStore, bobX25519.publicKey);
    });

    afterAll(async () => {
      try {
        await secondClient.directory.deleteAgent(secondSigner.agentId);
      } catch {
        // best-effort cleanup
      }
    });

    it("uploads key bundle to the relay", async () => {
      const bundle = await secondClient.keys.getBundle(secondPubKeyB64);
      expect(bundle.identityKey).toBeDefined();
      expect(bundle.signedPreKey).toBeDefined();
    });

    it("sends a Signal-encrypted PREKEY_BUNDLE message", async () => {
      const bundle = await client.keys.getBundle(secondPubKeyB64);
      const bobX25519Pub = ed25519PubToX25519Pub(secondSigner.publicKey);

      const encrypted = await aliceSignal.encrypt(
        secondPubKeyB64,
        bobX25519Pub,
        new TextEncoder().encode("hello from SDK signal test!"),
        bundle,
      );
      expect(encrypted.type).toBe("PREKEY_BUNDLE");

      const envelope = await client.messages.send({
        id: `msg-signal-${Date.now()}`,
        from: publicKeyB64,
        to: secondPubKeyB64,
        body: encrypted.body,
        type: encrypted.type,
        deviceId: 1,
        signal: encrypted.signal,
      } as any);
      expect(envelope).toBeDefined();
    });

    it("recipient fetches and decrypts the message", async () => {
      const result = await secondClient.messages.list(secondPubKeyB64);
      expect(result.messages.length).toBeGreaterThan(0);

      const envelope = result.messages[0]!;
      const aliceX25519Pub = ed25519PubToX25519Pub(signer.publicKey);
      const decrypted = await bobSignal.decrypt(
        publicKeyB64,
        aliceX25519Pub,
        envelope,
      );
      expect(new TextDecoder().decode(decrypted)).toBe(
        "hello from SDK signal test!",
      );
    });

    it("recipient acknowledges the message", async () => {
      const result = await secondClient.messages.list(secondPubKeyB64);
      const message = result.messages[0]!;
      await secondClient.messages.acknowledge(message.id, secondPubKeyB64);
    });
  });

  describe("moderation", () => {
    it("creates a moderation report", async () => {
      const report = await client.moderation.createReport({
        reporter: publicKeyB64,
        contentType: "channel-message",
        contentId: "msg_test_fake",
        ruleViolated: "spam",
        comment: "SDK test report",
      });
      expect(report).toHaveProperty("reportId");
      expect(report.status).toBe("pending");
    });
  });

  describe("reputation (read endpoints)", () => {
    it("gets reputation score for an agent", async () => {
      const score = await client.reputation.getScore(cryptoId);
      expect(score).toBeDefined();
    });

    it("gets reputation history", async () => {
      const result = await client.reputation.getHistory(cryptoId);
      expect(result).toHaveProperty("history");
    });

    it("gets reviews for an agent", async () => {
      const result = await client.reputation.getReviews(cryptoId);
      expect(result).toHaveProperty("reviews");
    });

    it("gets attestations for an agent", async () => {
      const result = await client.reputation.getAttestations(cryptoId);
      expect(result).toHaveProperty("attestations");
    });
  });

  describe("search (authenticated)", () => {
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

    it("search.broadcasts works", async () => {
      const result = await client.search.broadcasts({ q: "test" });
      expect(result).toHaveProperty("results");
    });

    it("search.events works", async () => {
      const result = await client.search.events({ q: "test" });
      expect(result).toHaveProperty("results");
    });

    it("search.suggest works", async () => {
      const result = await client.search.suggest("test");
      expect(result).toBeDefined();
    });
  });
});
