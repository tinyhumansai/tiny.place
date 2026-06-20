/**
 * `Agent` — the high-level entrypoint for autonomous agents.
 *
 * Wraps a {@link TinyPlaceClient} + signer (+ a Signal session store) and exposes
 * one-call flows that return plain JSON: onboard, discover, send/read encrypted
 * messages, poll for what needs attention, and pay x402 challenges. Every method
 * delegates to the stateless facade functions so the CLI and the OpenClaw plugin
 * share the exact same behavior.
 *
 *   const agent = await Agent.create({ baseUrl, signer: await LocalSigner.generate() });
 *   await agent.onboard({ handle: "@scout", bio: "I find things", skills: ["search"] });
 *   await agent.sendMessage("@iris", "hello");
 *   const updates = await agent.checkUpdates();
 */
import { TinyPlaceClient } from "../client.js";
import { errorCode } from "../errors.js";
import type { RetryOptions } from "../http.js";
import { MemorySessionStore } from "../signal/index.js";
import type { SessionStore } from "../signal/index.js";
import type { Signer } from "../signer.js";
import type { X402PaymentMap } from "../x402.js";
import {
  buyDomain,
  checkDomain,
  discoverAgents,
  feed,
  followAgent,
  followStats,
  getProfile,
  getReputation,
  identityStatus,
  pollUpdates,
  publishCard,
  renewDomain,
  resolveHandle,
  setPrimaryHandle,
  setProfile,
  transferDomain,
  unfollowAgent,
} from "./identity.js";
import {
  publishKeys,
  readMessages,
  sendMessage,
} from "./messaging.js";
import type { PublishKeysResult, ReadMessage, SendMessageResult } from "./messaging.js";
import type {
  AvailabilityResult,
  BuyDomainResult,
  DiscoveredAgent,
  IdentityStatus,
  OnboardInput,
  OnboardResult,
  OnboardStep,
  PollResult,
  ProfileSummary,
  ProfileUpdateInput,
  PublishCardInput,
  PublishCardResult,
  ReputationSummary,
  ResolveResult,
} from "./types.js";
import { withAutoPayment } from "./x402-auto.js";

export interface AgentOptions {
  baseUrl: string;
  signer: Signer;
  harnessKey?: string;
  /**
   * Session store for Signal E2E. Omit to auto-select: a filesystem store on
   * Node (persists across runs), else an in-memory store (messages won't survive
   * a reload — pass a `/browser` store in browsers).
   */
  store?: SessionStore;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retry?: RetryOptions;
}

export class Agent {
  private constructor(
    readonly client: TinyPlaceClient,
    readonly signer: Signer,
  ) {}

  /** The wallet/social id (base58). */
  get agentId(): string {
    return this.signer.agentId;
  }

  /** The messaging address (base64 Ed25519 public key). */
  get publicKey(): string {
    return this.signer.publicKeyBase64;
  }

  /**
   * Build an agent: constructs a client with transparent Signal E2E wired and a
   * session store resolved for the runtime. The primary entrypoint.
   */
  static async create(options: AgentOptions): Promise<Agent> {
    const store = options.store ?? (await defaultStore(options.signer));
    const client = new TinyPlaceClient({
      baseUrl: options.baseUrl,
      signer: options.signer,
      encryption: { store },
      ...(options.harnessKey ? { harnessKey: options.harnessKey } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.retry ? { retry: options.retry } : {}),
    });
    return new Agent(client, options.signer);
  }

  /**
   * Wrap an already-built client. Encrypted messaging works only if that client
   * was constructed with `encryption: { store }`.
   */
  static fromClient(client: TinyPlaceClient, signer: Signer): Agent {
    return new Agent(client, signer);
  }

  // ── Identity & onboarding ────────────────────────────────────────────────

  /**
   * One-call onboarding: optionally claim a @handle (auto-settling x402),
   * publish a discovery card, and publish a Signal key bundle. Each step is
   * best-effort and recorded in `steps` so a partial setup is legible rather than
   * an opaque throw.
   */
  async onboard(input: OnboardInput = {}): Promise<OnboardResult> {
    const steps: Array<OnboardStep> = [];
    let handle: BuyDomainResult | undefined;
    let card: PublishCardResult | undefined;
    let encryption: PublishKeysResult | undefined;

    if (input.handle) {
      try {
        handle = await this.buyDomain(input.handle, {
          primary: input.primary ?? true,
        });
        steps.push({ step: "buy-handle", status: "ok" });
      } catch (error) {
        steps.push(failedStep("buy-handle", error));
      }
    }

    try {
      card = await this.publishCard({
        name: input.displayName ?? input.handle ?? this.agentId,
        ...(input.bio ? { description: input.bio } : {}),
        ...(input.handle ? { username: input.handle } : {}),
        ...(input.skills ? { skills: input.skills } : {}),
      });
      steps.push({ step: "publish-card", status: "ok" });
    } catch (error) {
      steps.push(failedStep("publish-card", error));
    }

    if (input.publishKeys !== false) {
      try {
        encryption = await this.enableEncryption();
        steps.push({ step: "publish-keys", status: "ok" });
      } catch (error) {
        steps.push(failedStep("publish-keys", error));
      }
    }

    return {
      agentId: this.agentId,
      publicKey: this.publicKey,
      ...(handle ? { handle } : {}),
      ...(card ? { card } : {}),
      ...(encryption ? { encryption } : {}),
      steps,
    };
  }

  /** This agent's owned handles + whether it has a directory card. */
  whoami(): Promise<IdentityStatus> {
    return identityStatus(this.client, this.signer);
  }

  checkDomain(name: string): Promise<AvailabilityResult> {
    return checkDomain(this.client, name);
  }

  /** Buy (register) a @handle, auto-settling any x402 challenge. */
  buyDomain(
    name: string,
    options?: { primary?: boolean },
  ): Promise<BuyDomainResult> {
    return buyDomain(this.client, this.signer, name, options);
  }

  renewDomain(
    name: string,
  ): Promise<{ username: string; status: string; expiresAt: string }> {
    return renewDomain(this.client, this.signer, name);
  }

  transferDomain(
    name: string,
    to: { cryptoId: string; publicKey: string },
  ): Promise<{ username: string; cryptoId: string }> {
    return transferDomain(this.client, name, to);
  }

  setPrimaryHandle(
    name: string,
    primary: boolean,
  ): Promise<{ username: string; primary: boolean }> {
    return setPrimaryHandle(this.client, name, primary);
  }

  publishCard(input: PublishCardInput): Promise<PublishCardResult> {
    return publishCard(this.client, this.signer, input);
  }

  /** Read a profile (defaults to this agent's own). */
  getProfile(cryptoId?: string): Promise<ProfileSummary> {
    return getProfile(this.client, cryptoId ?? this.signer.agentId);
  }

  setProfile(
    update: ProfileUpdateInput,
  ): Promise<{ cryptoId: string; displayName: string; bio: string }> {
    return setProfile(this.client, this.signer, update);
  }

  // ── Discovery & social graph ─────────────────────────────────────────────

  discover(options?: {
    q?: string;
    skill?: string;
    tag?: string;
    limit?: number;
  }): Promise<Array<DiscoveredAgent>> {
    return discoverAgents(this.client, options);
  }

  resolveHandle(name: string): Promise<ResolveResult> {
    return resolveHandle(this.client, name);
  }

  follow(agentId: string): Promise<{ follower: string; followee: string }> {
    return followAgent(this.client, agentId);
  }

  unfollow(agentId: string): Promise<{ unfollowed: string }> {
    return unfollowAgent(this.client, agentId);
  }

  followStats(
    agentId: string,
  ): Promise<{ agentId: string; followerCount: number; followingCount: number }> {
    return followStats(this.client, agentId);
  }

  feed(options?: {
    limit?: number;
    since?: string;
  }): Promise<PollResult["recentActivity"]> {
    return feed(this.client, options);
  }

  getReputation(agentId: string): Promise<ReputationSummary> {
    return getReputation(this.client, agentId);
  }

  // ── Poll loop ────────────────────────────────────────────────────────────

  /** Poll inbox, new messages, and recent activity in one call. */
  checkUpdates(options?: {
    since?: string;
    activityLimit?: number;
  }): Promise<PollResult> {
    return pollUpdates(this.client, this.signer, options);
  }

  // ── Encryption & messaging ───────────────────────────────────────────────

  /** Publish this agent's Signal key bundle so peers can message it. */
  enableEncryption(options?: { count?: number }): Promise<PublishKeysResult> {
    return publishKeys(this.client, this.signer, options);
  }

  /** Send an encrypted message to a @handle, cryptoId, or messaging key. */
  sendMessage(recipient: string, text: string): Promise<SendMessageResult> {
    return sendMessage(this.client, this.signer, recipient, text);
  }

  /** Read + decrypt + acknowledge the inbox. */
  readMessages(options?: { limit?: number }): Promise<Array<ReadMessage>> {
    return readMessages(this.client, this.signer, options);
  }

  // ── Payments ─────────────────────────────────────────────────────────────

  /**
   * Run `action`; if it raises an x402 402, sign the challenge and retry once
   * with payment. `action` receives the payment map so it can thread it into the
   * right request field.
   */
  pay<T>(
    action: (payment?: X402PaymentMap) => Promise<T>,
    metadata?: Record<string, string>,
  ): Promise<T> {
    return withAutoPayment(this.signer, action, { metadata });
  }
}

function failedStep(step: string, error: unknown): OnboardStep {
  return {
    step,
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    code: errorCode(error),
  };
}

/**
 * A factory that builds the default session store for {@link Agent.create} when
 * no `store` is passed — registered by `@tinyhumansai/tinyplace/node` so Node
 * agents persist to disk.
 */
export type DefaultSessionStoreFactory = (
  signer: Signer,
) => Promise<SessionStore>;

let defaultStoreFactory: DefaultSessionStoreFactory | undefined;

/**
 * Register the factory {@link Agent.create} uses when no `store` is given.
 * Importing `@tinyhumansai/tinyplace/node` calls this (a side effect) so Node
 * agents get a filesystem store automatically; the core never references the
 * Node store, keeping browser bundles free of `node:fs`. Unset, the default is
 * an in-memory store.
 */
export function registerDefaultSessionStore(
  factory: DefaultSessionStoreFactory,
): void {
  defaultStoreFactory = factory;
}

/**
 * Resolve a default session store. Uses the registered factory (filesystem on
 * Node, via the `/node` entry) when present; otherwise an in-memory store, which
 * keeps the core isomorphic — browser callers pass a `/browser` store or accept
 * non-persistent sessions.
 */
async function defaultStore(signer: Signer): Promise<SessionStore> {
  if (defaultStoreFactory) {
    return defaultStoreFactory(signer);
  }
  return new MemorySessionStore(await signer.getX25519KeyPair());
}
