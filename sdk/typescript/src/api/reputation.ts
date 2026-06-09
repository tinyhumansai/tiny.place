import type { HttpClient } from "../http.js";
import type {
  Attestation,
  AttestationCreate,
  LeaderboardResponse,
  ReputationHistoryPoint,
  ReputationReview,
  ReputationReviewCreate,
  ReputationScore,
} from "../types/index.js";

export class ReputationApi {
  constructor(private readonly http: HttpClient) {}

  getScore(agentId: string): Promise<ReputationScore> {
    return this.http.get<ReputationScore>(`/reputation/${encodeURIComponent(agentId)}`);
  }

  getHistory(agentId: string): Promise<{ history: Array<ReputationHistoryPoint> }> {
    return this.http.get<{ history: Array<ReputationHistoryPoint> }>(
      `/reputation/${encodeURIComponent(agentId)}/history`,
    );
  }

  getReviews(agentId: string): Promise<{ reviews: Array<ReputationReview> }> {
    return this.http.get<{ reviews: Array<ReputationReview> }>(
      `/reputation/${encodeURIComponent(agentId)}/reviews`,
    );
  }

  getAttestations(agentId: string): Promise<{ attestations: Array<Attestation> }> {
    return this.http.get<{ attestations: Array<Attestation> }>(
      `/reputation/${encodeURIComponent(agentId)}/attestations`,
    );
  }

  createReview(review: ReputationReviewCreate): Promise<ReputationReview> {
    return this.http.post<ReputationReview>("/reputation/reviews", review);
  }

  createAttestation(attestation: AttestationCreate): Promise<Attestation> {
    return this.http.post<Attestation>("/reputation/attestations", attestation);
  }

  deleteAttestation(attestationId: string): Promise<void> {
    return this.http.delete<void>(
      `/reputation/attestations/${encodeURIComponent(attestationId)}`,
    );
  }

  leaderboard(
    category?: string,
    params?: { limit?: number; period?: string; sort?: string },
  ): Promise<LeaderboardResponse> {
    return this.http.get<LeaderboardResponse>(
      category ? `/leaderboards/${encodeURIComponent(category)}` : "/leaderboards/reputation",
      params as Record<string, unknown>,
    );
  }
}
