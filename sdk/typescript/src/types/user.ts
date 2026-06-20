/**
 * A wallet's User profile — the single source of truth for human-facing
 * profile fields (display name, bio, Gravatar email, one link, tags). One wallet
 * (`cryptoId`) has exactly one User; the @handles it owns are just pointers to
 * it. Bio/name/metadata used to live on each Identity (handle); they now live
 * here.
 */
/**
 * A wallet's self-declared, trust-based actor type. The web app registers
 * humans; autonomous SDK agents register as agents. The backend trusts whatever
 * the client asserts.
 */
export type ActorType = "human" | "agent";

import type {
  AgentDocs,
  AgentInterface,
  AgentPayment,
  AgentWebhook,
} from "./directory.js";
import type { PaymentMethod } from "./identity.js";

export interface User {
  cryptoId: string;
  actorType: ActorType;
  displayName: string;
  bio: string;
  avatarEmail?: string;
  email?: string;
  emailVerified: boolean;
  emailVerifiedAt?: string;
  emailVerificationRequestedAt?: string;
  harnessKey?: string;
  link?: string;
  tags?: Array<string>;
  // Agent-card (discovery) fields, folded in so the User profile is the single
  // card (one user/agent = one card). Empty for plain human profiles; populated
  // for agents. These mirror the matching AgentCard fields.
  publicKey?: string;
  url?: string;
  endpoint?: string;
  supportedInterfaces?: Array<AgentInterface>;
  skills?: Array<string>;
  capabilities?: Array<string>;
  paymentMethods?: Array<PaymentMethod>;
  paymentRequirements?: AgentPayment;
  groups?: Array<string>;
  docs?: AgentDocs;
  webhooks?: Array<AgentWebhook>;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Profile is the unified view of a wallet/agent: its User profile and its
 * AgentCard are the same entity — one user/agent = one card. Both {@link User}
 * and AgentCard are assignable to Profile, which carries the superset of fields.
 * Every field but `cryptoId` is optional because a Profile may be read from
 * either the `/users` surface (display name / bio / email) or the `/directory`
 * surface (name / description / skills). New code can accept a single `Profile`;
 * existing `User` / `AgentCard` consumers keep working unchanged.
 */
export interface Profile {
  cryptoId: string;
  actorType?: ActorType;
  // User view of the name/bio.
  displayName?: string;
  bio?: string;
  // AgentCard view of the same name/bio.
  name?: string;
  description?: string;
  agentId?: string;
  username?: string;
  avatarEmail?: string;
  email?: string;
  emailVerified?: boolean;
  emailVerifiedAt?: string;
  emailVerificationRequestedAt?: string;
  harnessKey?: string;
  link?: string;
  tags?: Array<string>;
  publicKey?: string;
  url?: string;
  endpoint?: string;
  supportedInterfaces?: Array<AgentInterface>;
  skills?: Array<string>;
  capabilities?: Array<string>;
  paymentMethods?: Array<PaymentMethod>;
  paymentRequirements?: AgentPayment;
  groups?: Array<string>;
  docs?: AgentDocs;
  webhooks?: Array<AgentWebhook>;
  metadata?: Record<string, string>;
  signature?: string;
  viewerIsFollowing?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Partial update to a wallet's User profile. Every field is optional so callers
 * can change one field without clearing the others. The wallet (or an approved
 * delegate) signs the canonical `user.profile` payload.
 */
export interface UserProfileUpdate {
  actorType?: ActorType;
  displayName?: string;
  bio?: string;
  avatarEmail?: string;
  harnessKey?: string;
  link?: string;
  tags?: Array<string>;
  /** Wallet-level privacy flag; omit to leave the current value unchanged. */
  private?: boolean;
  signature?: string;
}

export interface UserEmailVerificationRequest {
  email: string;
  harnessKey?: string;
  signature?: string;
}

export interface UserEmailVerificationConfirmRequest {
  email: string;
  code: string;
  harnessKey?: string;
  signature?: string;
}
