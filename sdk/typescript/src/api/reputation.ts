import type { HttpClient } from "../http.js";
import type { SigningKey } from "../auth.js";
import { signCanonicalPayload } from "../auth.js";
import { canonicalPayload } from "../crypto.js";
import type {
  Attestation,
  AttestationCreate,
  LeaderboardResponse,
  ReputationHistoryPoint,
  ReputationReview,
  ReputationReviewCreate,
  ReputationScore,
  ReputationVouch,
  ReputationVouchCreate,
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
    }

    return this.http.post<ReputationReview>("/reputation/reviews", review);
  }

  async createAttestation(
    attestation: AttestationCreate,
  ): Promise<Attestation> {
    if (this.signingKey && !attestation.signature) {
      attestation = {
        ...attestation,
        attestationId:
          attestation.attestationId ?? nextReputationId("att"),
      };
      attestation.signature = await signCanonicalPayload(
        this.signingKey,
        attestationSignaturePayload(attestation),
      );
    }

    return this.http.post<Attestation>("/reputation/attestations", attestation);
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
      `/reputation/attestations/${encodeURIComponent(attestationId)}?signature=${encodeURIComponent(signature)}`,
    );
  }

  trustGraph(
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(
      "/reputation/trust/graph",
      params,
    );
  }

  getTrust(agentId: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(
      `/reputation/${encodeURIComponent(agentId)}/trust`,
    );
  }

  getVouches(agentId: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(
      `/reputation/${encodeURIComponent(agentId)}/vouches`,
    );
  }

  getGivenVouches(agentId: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(
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
      `/reputation/vouches/${encodeURIComponent(vouchId)}?signature=${encodeURIComponent(signature)}`,
    );
  }

  leaderboard(
    category?: string,
    params?: {
      category?: string;
      limit?: number;
      period?: string;
      sort?: string;
    },
  ): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      category
        ? `/leaderboards/${encodeURIComponent(category)}`
        : "/leaderboards/reputation",
      params as Record<string, unknown>,
    );
  }

  reputationLeaderboard(params?: {
    category?: string;
    limit?: number;
    period?: string;
  }): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/reputation/leaderboard",
      params as Record<string, unknown>,
    );
  }

  risingLeaderboard(params?: {
    limit?: number;
    period?: string;
  }): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/leaderboards/rising",
      params as Record<string, unknown>,
    );
  }

  sellersLeaderboard(params?: {
    limit?: number;
    period?: string;
  }): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/leaderboards/sellers",
      params as Record<string, unknown>,
    );
  }

  gamesLeaderboard(params?: {
    limit?: number;
    offset?: number;
    period?: "7d" | "30d" | "90d" | "all-time";
    sort?: "winnings" | "win-rate" | "roi" | "hands";
  }): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/leaderboards/games",
      params as Record<string, unknown>,
    );
  }

  groupsLeaderboard(params?: {
    limit?: number;
    period?: string;
  }): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/leaderboards/groups",
      params as Record<string, unknown>,
    );
  }

  messagesLeaderboard(params?: {
    limit?: number;
    period?: string;
  }): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      "/leaderboards/messages",
      params as Record<string, unknown>,
    );
  }

  volumeLeaderboard(params?: {
    limit?: number;
    period?: string;
  }): Promise<LeaderboardResponse> {
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

function attestationSignaturePayload(
  attestation: AttestationCreate,
): string {
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

function nextReputationId(prefix: string): string {
  const random = new Uint8Array(6);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}
