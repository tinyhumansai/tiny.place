import type { SigningKey } from "../auth.js";
import { signFreshCanonicalPayload } from "../auth.js";
import { canonicalPayload } from "../crypto.js";
import type { HttpClient } from "../http.js";
import type { User, UserProfileUpdate } from "../types/index.js";

/**
 * UsersApi reads and writes the per-wallet User profile — the single source of
 * truth for human-facing fields (display name, bio, avatar, links, tags). A
 * wallet is identified by its `cryptoId`; the @handles it owns are pointers to
 * it. These fields used to live on each Identity (handle) and now live here.
 */
export class UsersApi {
  constructor(
    private readonly http: HttpClient,
    private readonly signingKey?: SigningKey,
  ) {}

  /** Fetch a wallet's profile by its cryptoId. */
  get(cryptoId: string): Promise<User> {
    return this.http.get<User>(`/users/${encodeURIComponent(cryptoId)}`);
  }

  /**
   * Update the signed-in wallet's profile. Signs the canonical `user.profile`
   * payload and presents the signing key so the backend can authorize either
   * the wallet itself or an approved hot session key (delegate).
   */
  async updateProfile(
    cryptoId: string,
    update: UserProfileUpdate,
  ): Promise<User> {
    if (this.signingKey && !update.signature) {
      const payload = userProfileSignaturePayload(cryptoId, update);
      update = {
        ...update,
        signature: await signFreshCanonicalPayload(this.signingKey, payload),
      };
    }
    return this.http.putDirectoryAuth<User>(
      `/users/${encodeURIComponent(cryptoId)}/profile`,
      update,
    );
  }
}

/**
 * Builds the canonical `user.profile` payload signed for a profile update. The
 * field set and the undefined→null mapping must match the backend's
 * `userProfilePayload` exactly so the signature verifies (the backend derives
 * the same payload from the request body, where absent fields are null).
 */
function userProfileSignaturePayload(
  cryptoId: string,
  update: UserProfileUpdate,
): string {
  return canonicalPayload("user.profile", {
    actorType: update.actorType ?? null,
    avatar: update.avatar ?? null,
    bio: update.bio ?? null,
    cryptoId,
    displayName: update.displayName ?? null,
    links: update.links ?? null,
    tags: update.tags ?? null,
  });
}
