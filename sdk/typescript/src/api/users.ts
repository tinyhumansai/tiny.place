import type { SigningKey } from "../auth.js";
import { signFreshCanonicalPayload } from "../auth.js";
import { canonicalPayload } from "../crypto.js";
import type { HttpClient } from "../http.js";
import type {
  User,
  UserEmailVerificationConfirmRequest,
  UserEmailVerificationRequest,
  UserProfileUpdate,
} from "../types/index.js";

/**
 * UsersApi reads and writes the per-wallet User profile — the single source of
 * truth for human-facing fields (display name, bio, Gravatar email, link, tags). A
 * wallet is identified by its `cryptoId`; the @handles it owns are pointers to
 * it. These fields used to live on each Identity (handle) and now live here.
 */
export class UsersApi {
  constructor(
    private readonly http: HttpClient,
    private readonly signingKey?: SigningKey,
    private readonly harnessKey?: string,
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
    update = withDefaultHarnessKey(update, this.harnessKey);
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

  /**
   * Start email verification for a wallet. The backend stores the normalized
   * email on the wallet profile, marks it unverified, and sends a short-lived
   * code through the configured email provider.
   */
  async startEmailVerification(
    cryptoId: string,
    request: UserEmailVerificationRequest,
  ): Promise<User> {
    request = withDefaultHarnessKey(request, this.harnessKey);
    if (this.signingKey && !request.signature) {
      const payload = userEmailStartSignaturePayload(cryptoId, request);
      request = {
        ...request,
        signature: await signFreshCanonicalPayload(this.signingKey, payload),
      };
    }
    return this.http.postDirectoryAuth<User>(
      `/users/${encodeURIComponent(cryptoId)}/email/verification`,
      request,
    );
  }

  /**
   * Confirm a wallet email verification code. Emails are not unique across
   * wallets; verification is scoped to the signed wallet cryptoId.
   */
  async confirmEmailVerification(
    cryptoId: string,
    request: UserEmailVerificationConfirmRequest,
  ): Promise<User> {
    request = withDefaultHarnessKey(request, this.harnessKey);
    if (this.signingKey && !request.signature) {
      const payload = userEmailConfirmSignaturePayload(cryptoId, request);
      request = {
        ...request,
        signature: await signFreshCanonicalPayload(this.signingKey, payload),
      };
    }
    return this.http.postDirectoryAuth<User>(
      `/users/${encodeURIComponent(cryptoId)}/email/verification/confirm`,
      request,
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
    avatarEmail: update.avatarEmail ?? null,
    bio: update.bio ?? null,
    cryptoId,
    displayName: update.displayName ?? null,
    harnessKey: update.harnessKey ?? null,
    link: update.link ?? null,
    private: update.private ?? null,
    tags: update.tags ?? null,
  });
}

function userEmailStartSignaturePayload(
  cryptoId: string,
  request: UserEmailVerificationRequest,
): string {
  return canonicalPayload("user.email.start", {
    cryptoId,
    email: request.email,
    harnessKey: request.harnessKey ?? null,
  });
}

function userEmailConfirmSignaturePayload(
  cryptoId: string,
  request: UserEmailVerificationConfirmRequest,
): string {
  return canonicalPayload("user.email.confirm", {
    code: request.code,
    cryptoId,
    email: request.email,
    harnessKey: request.harnessKey ?? null,
  });
}

function withDefaultHarnessKey<T extends { harnessKey?: string }>(
  value: T,
  harnessKey: string | undefined,
): T {
  if (value.harnessKey || !harnessKey) {
    return value;
  }
  return { ...value, harnessKey };
}
