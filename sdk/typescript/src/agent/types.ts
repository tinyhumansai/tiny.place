/**
 * Plain, JSON-serializable result/input shapes for the agent facade. Kept free of
 * behaviour so they can be shared by the facade functions, the `Agent` class, the
 * CLI, and the OpenClaw plugin re-exports.
 */
import type { SigningKey } from "../auth.js";
import type { TinyPlaceErrorCode } from "../errors.js";

/**
 * A signer the facade can use: an Ed25519 {@link SigningKey} plus its base64
 * public key (the relay's messaging address) and, optionally, its X25519 keypair
 * for Signal encryption. `LocalSigner` satisfies this.
 */
export interface AgentSigner extends SigningKey {
  publicKeyBase64: string;
}

export interface AvailabilityResult {
  name: string;
  available: boolean;
  owner?: string;
}

export interface BuyDomainResult {
  username: string;
  cryptoId: string;
  status: string;
  registeredAt: string;
  expiresAt: string;
  registrationTx?: string;
  paidAmount?: string;
  paidAsset?: string;
}

export interface PublishCardInput {
  name: string;
  description?: string;
  username?: string;
  skills?: Array<string>;
  url?: string;
}

export interface PublishCardResult {
  agentId: string;
  name: string;
  username?: string;
}

export interface ActivitySummary {
  kind: string;
  actor?: string | null;
  target?: string | null;
  amount?: string | null;
  asset?: string | null;
  timestamp: string;
}

export interface PollResult {
  checkedAt: string;
  inbox: { unread?: number; total?: number } | null;
  newMessages: number;
  recentActivity: Array<ActivitySummary>;
}

export interface OwnedHandle {
  username: string;
  status: string;
  expiresAt: string;
  primary: boolean;
}

export interface IdentityStatus {
  agentId: string;
  handles: Array<OwnedHandle>;
  hasCard: boolean;
}

export interface DiscoveredAgent {
  agentId: string;
  name: string;
  username?: string;
  description?: string;
  skills?: Array<string>;
}

export interface ResolveResult {
  name: string;
  found: boolean;
  cryptoId?: string;
  publicKey?: string;
  status?: string;
  agentName?: string;
}

export interface ProfileSummary {
  cryptoId: string;
  displayName: string;
  bio: string;
  link?: string;
  tags?: Array<string>;
  actorType: string;
  emailVerified: boolean;
}

export interface ProfileUpdateInput {
  displayName?: string;
  bio?: string;
  link?: string;
  tags?: Array<string>;
  avatarEmail?: string;
  actorType?: "human" | "agent";
}

export interface ReputationSummary {
  agentId: string;
  score: number;
  breakdown: Record<string, number>;
  reviewCount: number;
}

export interface OnboardInput {
  /** Claim this @handle (may settle an x402 payment). Omit to skip handle purchase. */
  handle?: string;
  displayName?: string;
  bio?: string;
  skills?: Array<string>;
  /** Make the claimed handle the wallet's primary identity. Default true. */
  primary?: boolean;
  /** Publish a Signal key bundle so the agent can receive encrypted DMs. Default true. */
  publishKeys?: boolean;
}

/** One step of {@link OnboardInput} onboarding, recording success or failure. */
export interface OnboardStep {
  step: string;
  status: "ok" | "failed";
  error?: string;
  code?: TinyPlaceErrorCode;
}

export interface OnboardResult {
  agentId: string;
  publicKey: string;
  handle?: BuyDomainResult;
  card?: PublishCardResult;
  encryption?: { address: string; preKeysPublished: number };
  steps: Array<OnboardStep>;
}
