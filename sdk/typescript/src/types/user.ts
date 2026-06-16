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
  createdAt: string;
  updatedAt: string;
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
