import type { HttpClient } from "../http.js";
import type { SigningKey } from "../auth.js";
import { signCanonicalPayload } from "../auth.js";
import { canonicalPayload } from "../crypto.js";
import type {
  Attestation,
  AttestationCreate,
  GameLeaderboardQueryParams,
  GroupLeaderboardQueryParams,
  LeaderboardCategory,
  LeaderboardQueryParams,
  LeaderboardResponse,
  ReputationHistoryPoint,
  ReputationLeaderboardQueryParams,
  ReputationReview,
  ReputationReviewCreate,
  ReputationScore,
  ReputationVouch,
  ReputationVouchCreate,
  SellerLeaderboardQueryParams,
  TrustGraph,
  TrustGraphQueryParams,
  TrustScore,
  TwitterChallengeRequest,
  TwitterChallengeResult,
  TwitterVerificationStatus,
} from "../types/index.js";

export class ReputationApi {
  constructor(
    private readonly http: HttpClient,
    private readonly signingKey?: SigningKey,
  ) {}

  getScore(agentId: string): Promise<ReputationScore> {
    return this.http.get<ReputationScore>(
      `/reputation/${encodeURIComponent(agentId)}`,
    );
  }

  getHistory(
    agentId: string,
  ): Promise<{ history: Array<ReputationHistoryPoint> }> {
    return this.http.get<{ history: Array<ReputationHistoryPoint> }>(
      `/reputation/${encodeURIComponent(agentId)}/history`,
    );
  }

  getReviews(agentId: string): Promise<{ reviews: Array<ReputationReview> }> {
    return this.http.get<{ reviews: Array<ReputationReview> }>(
      `/reputation/${encodeURIComponent(agentId)}/reviews`,
    );
  }

  getAttestations(
    agentId: string,
  ): Promise<{ attestations: Array<Attestation> }> {
    return this.http.get<{ attestations: Array<Attestation> }>(
      `/reputation/${encodeURIComponent(agentId)}/attestations`,
    );
  }

  async createReview(
    review: ReputationReviewCreate,
  ): Promise<ReputationReview> {
    if (this.signingKey && !review.signature) {
      review = {
        ...review,
        reviewId: review.reviewId ?? nextReputationId("rev"),
      };
      review.signature = await signCanonicalPayload(
        this.signingKey,
        reputationReviewSignaturePayload(review),
      );
      // Present the signer so the backend can authorize a delegated session key
      // (the signature above is verified against it). For the reviewer's own key
      // this is simply the registered key.
      review.signerPublicKey ??= this.http.signingPublicKey();
    }

    return this.http.post<ReputationReview>("/reputation/reviews", review);
  }

  async createAttestation(
    attestation: AttestationCreate,
  ): Promise<Attestation> {
    if (this.signingKey && !attestation.signature) {
      attestation = {
        ...attestation,
        attestationId: attestation.attestationId ?? nextReputationId("att"),
      };
      attestation.signature = await signCanonicalPayload(
        this.signingKey,
        attestationSignaturePayload(attestation),
      );
      attestation.signerPublicKey ??= this.http.signingPublicKey();
    }

    return this.http.post<Attestation>("/reputation/attestations", attestation);
  }

  /**
   * Request a Twitter/X verification challenge. The returned `challengeCode`
   * must be posted verbatim as a tweet from the account being claimed, after
   * which the tweet URL is submitted via {@link submitTwitterAttestation}.
   * Signed with the same payload as an attestation (empty proofUrl).
   */
  async requestTwitterChallenge(
    request: TwitterChallengeRequest,
  ): Promise<TwitterChallengeResult> {
    const platform = request.platform ?? "twitter";
    const body: TwitterChallengeRequest = { ...request, platform };
    if (this.signingKey && !body.signature) {
      body.signature = await signCanonicalPayload(
        this.signingKey,
        attestationSignaturePayload({
          agent: body.agent,
          agentCryptoId: body.agentCryptoId,
          handle: body.handle,
          platform,
        }),
      );
      body.signerPublicKey ??= this.http.signingPublicKey();
    }
    return this.http.post<TwitterChallengeResult>(
      "/reputation/attestations/twitter/challenge",
      body,
    );
  }

  /**
   * Submit a tweet as proof for a Twitter/X attestation. The `proofUrl` must be
   * the status URL of the tweet containing the challenge. Verification is
   * asynchronous: this returns the attestation in its `pending` state; poll
   * {@link getTwitterVerificationStatus} for the outcome.
   */
  submitTwitterAttestation(
    attestation: AttestationCreate,
  ): Promise<Attestation> {
    return this.createAttestation({
      ...attestation,
      platform: attestation.platform ?? "twitter",
    });
  }

  /** Poll the async verification status of a submitted Twitter/X attestation. */
  getTwitterVerificationStatus(
    attestationId: string,
  ): Promise<TwitterVerificationStatus> {
    return this.http.get<TwitterVerificationStatus>(
      "/reputation/attestations/twitter/status",
      { attestationId },
    );
  }

  async deleteAttestation(attestationId: string): Promise<void> {
    if (!this.signingKey) {
      return this.http.delete<void>(
        `/reputation/attestations/${encodeURIComponent(attestationId)}`,
      );
    }

    const signature = await signCanonicalPayload(
      this.signingKey,
      attestationRevokeSignaturePayload(attestationId),
    );
    return this.http.delete<void>(
      `/reputation/attestations/${encodeURIComponent(attestationId)}?signature=${encodeURIComponent(signature)}${signerPublicKeyQuery(this.http.signingPublicKey())}`,
    );
  }

  trustGraph(params?: TrustGraphQueryParams): Promise<TrustGraph> {
    return this.http.get<TrustGraph>(
      "/reputation/trust/graph",
      params as Record<string, unknown>,
    );
  }

  getTrust(agentId: string): Promise<TrustScore> {
    return this.http.get<TrustScore>(
      `/reputation/${encodeURIComponent(agentId)}/trust`,
    );
  }

  getVouches(agentId: string): Promise<{ vouches: Array<ReputationVouch> }> {
    return this.http.get<{ vouches: Array<ReputationVouch> }>(
      `/reputation/${encodeURIComponent(agentId)}/vouches`,
    );
  }

  getGivenVouches(
    agentId: string,
  ): Promise<{ vouches: Array<ReputationVouch> }> {
    return this.http.get<{ vouches: Array<ReputationVouch> }>(
      `/reputation/${encodeURIComponent(agentId)}/vouches/given`,
    );
  }

  async createVouch(vouch: ReputationVouchCreate): Promise<ReputationVouch> {
    if (this.signingKey && !vouch.signature) {
      vouch = {
        ...vouch,
        vouchId: vouch.vouchId ?? nextReputationId("vouch"),
      };
      vouch.signature = await signCanonicalPayload(
        this.signingKey,
        vouchSignaturePayload(vouch),
      );
      vouch.signerPublicKey ??= this.http.signingPublicKey();
    }

    return this.http.post<ReputationVouch>("/reputation/vouches", vouch);
  }

  async deleteVouch(vouchId: string): Promise<void> {
    if (!this.signingKey) {
      return this.http.delete<void>(
        `/reputation/vouches/${encodeURIComponent(vouchId)}`,
      );
    }

    const signature = await signCanonicalPayload(
      this.signingKey,
      vouchRevokeSignaturePayload(vouchId),
    );
    return this.http.delete<void>(
      `/reputation/vouches/${encodeURIComponent(vouchId)}?signature=${encodeURIComponent(signature)}${signerPublicKeyQuery(this.http.signingPublicKey())}`,
    );
  }

  leaderboard(
    category?: LeaderboardCategory,
    params?:
      | ReputationLeaderboardQueryParams
      | GroupLeaderboardQueryParams
      | SellerLeaderboardQueryParams
      | GameLeaderboardQueryParams
      | LeaderboardQueryParams,
  ): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      category
        ? `/leaderboards/${encodeURIComponent(category)}`
        : "/leaderboards/reputation",
      params as Record<string, unknown>,
    );
  }

  reputationLeaderboard(
    params?: ReputationLeaderboardQueryParams,
  ): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/reputation/leaderboard",
      params as Record<string, unknown>,
    );
  }

  risingLeaderboard(
    params?: LeaderboardQueryParams,
  ): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/leaderboards/rising",
      params as Record<string, unknown>,
    );
  }

  sellersLeaderboard(
    params?: SellerLeaderboardQueryParams,
  ): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/leaderboards/sellers",
      params as Record<string, unknown>,
    );
  }

  gamesLeaderboard(
    params?: GameLeaderboardQueryParams,
  ): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/leaderboards/games",
      params as Record<string, unknown>,
    );
  }

  groupsLeaderboard(
    params?: GroupLeaderboardQueryParams,
  ): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/leaderboards/groups",
      params as Record<string, unknown>,
    );
  }

  messagesLeaderboard(
    params?: LeaderboardQueryParams,
  ): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/leaderboards/messages",
      params as Record<string, unknown>,
    );
  }

  volumeLeaderboard(
    params?: LeaderboardQueryParams,
  ): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/leaderboards/volume",
      params as Record<string, unknown>,
    );
  }
}

function reputationReviewSignaturePayload(
  review: ReputationReviewCreate,
): string {
  return canonicalPayload("reputation.review", {
    comment: review.comment ?? "",
    context: review.context ?? "",
    rating: review.rating,
    reviewer: review.reviewer,
    subject: review.subject,
    transactionRef: review.transactionRef,
  });
}

function vouchSignaturePayload(vouch: ReputationVouchCreate): string {
  return canonicalPayload("reputation.vouch", {
    comment: vouch.comment ?? "",
    context: vouch.context ?? "",
    subject: vouch.subject,
    vouchId: vouch.vouchId ?? "",
    voucher: vouch.voucher,
    weight: vouch.weight,
  });
}

function vouchRevokeSignaturePayload(vouchId: string): string {
  return canonicalPayload("reputation.vouch.revoke", {
    vouchId,
  });
}

function attestationSignaturePayload(attestation: AttestationCreate): string {
  return canonicalPayload("reputation.attestation", {
    agent: attestation.agent,
    agentCryptoId: attestation.agentCryptoId,
    handle: attestation.handle,
    platform: attestation.platform,
    proofUrl: attestation.proofUrl ?? "",
  });
}

function attestationRevokeSignaturePayload(attestationId: string): string {
  return canonicalPayload("reputation.attestation.revoke", {
    attestationId,
  });
}

// Builds the optional &signerPublicKey= query suffix for body-less revoke
// requests, so the backend can authorize a delegated session key revoking on
// the owner's behalf. Empty when there is no presented key.
function signerPublicKeyQuery(signerPublicKey: string | undefined): string {
  return signerPublicKey
    ? `&signerPublicKey=${encodeURIComponent(signerPublicKey)}`
    : "";
}

function nextReputationId(prefix: string): string {
  const random = new Uint8Array(6);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}
