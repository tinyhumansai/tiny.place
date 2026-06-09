import type { HttpClient } from "../http.js";
import type {
  Escrow,
  EscrowCreateRequest,
  EscrowDispute,
  EscrowEvidence,
  EscrowMilestone,
  EscrowQueryParams,
} from "../types/index.js";

export class EscrowApi {
  constructor(private readonly http: HttpClient) {}

  list(params?: EscrowQueryParams): Promise<{ escrows: Array<Escrow> }> {
    return this.http.getAuth<{ escrows: Array<Escrow> }>(
      "/escrow",
      params as Record<string, unknown>,
    );
  }

  create(request: EscrowCreateRequest): Promise<Escrow> {
    return this.http.post<Escrow>("/escrow", request);
  }

  get(escrowId: string): Promise<Escrow> {
    return this.http.getAuth<Escrow>(`/escrow/${encodeURIComponent(escrowId)}`);
  }

  accept(escrowId: string): Promise<Escrow> {
    return this.http.post<Escrow>(`/escrow/${encodeURIComponent(escrowId)}/accept`);
  }

  deliver(escrowId: string, proof: { description: string; refs?: Array<string> }): Promise<Escrow> {
    return this.http.post<Escrow>(`/escrow/${encodeURIComponent(escrowId)}/deliver`, proof);
  }

  acceptDelivery(escrowId: string): Promise<Escrow> {
    return this.http.post<Escrow>(`/escrow/${encodeURIComponent(escrowId)}/accept-delivery`);
  }

  claimRelease(escrowId: string): Promise<Escrow> {
    return this.http.post<Escrow>(`/escrow/${encodeURIComponent(escrowId)}/claim-release`);
  }

  claimRefund(escrowId: string): Promise<Escrow> {
    return this.http.post<Escrow>(`/escrow/${encodeURIComponent(escrowId)}/claim-refund`);
  }

  requestRevision(escrowId: string, reason: string): Promise<Escrow> {
    return this.http.post<Escrow>(
      `/escrow/${encodeURIComponent(escrowId)}/request-revision`,
      { reason },
    );
  }

  cancel(escrowId: string): Promise<Escrow> {
    return this.http.post<Escrow>(`/escrow/${encodeURIComponent(escrowId)}/cancel`);
  }

  extendDeadline(escrowId: string, newDeadline: string): Promise<Escrow> {
    return this.http.post<Escrow>(
      `/escrow/${encodeURIComponent(escrowId)}/extend-deadline`,
      { newDeadline },
    );
  }

  approveExtension(escrowId: string): Promise<Escrow> {
    return this.http.post<Escrow>(`/escrow/${encodeURIComponent(escrowId)}/approve-extension`);
  }

  // --- Disputes ---

  openDispute(escrowId: string, reason: string): Promise<EscrowDispute> {
    return this.http.post<EscrowDispute>(
      `/escrow/${encodeURIComponent(escrowId)}/dispute`,
      { reason },
    );
  }

  getDispute(escrowId: string): Promise<EscrowDispute> {
    return this.http.getAuth<EscrowDispute>(`/escrow/${encodeURIComponent(escrowId)}/dispute`);
  }

  submitEvidence(
    escrowId: string,
    evidence: { type: string; description: string; ref?: string },
  ): Promise<void> {
    return this.http.post<void>(
      `/escrow/${encodeURIComponent(escrowId)}/dispute/evidence`,
      evidence,
    );
  }

  acceptMediation(escrowId: string): Promise<EscrowDispute> {
    return this.http.post<EscrowDispute>(
      `/escrow/${encodeURIComponent(escrowId)}/dispute/accept-mediation`,
    );
  }

  rejectMediation(escrowId: string): Promise<EscrowDispute> {
    return this.http.post<EscrowDispute>(
      `/escrow/${encodeURIComponent(escrowId)}/dispute/reject-mediation`,
    );
  }

  payArbitration(escrowId: string, amount: string): Promise<EscrowDispute> {
    return this.http.post<EscrowDispute>(
      `/escrow/${encodeURIComponent(escrowId)}/dispute/pay-arbitration`,
      { amount },
    );
  }

  voteArbitration(
    escrowId: string,
    vote: { councilMember: string; vote: string; clientPct?: number; providerPct?: number; rationale?: string },
  ): Promise<void> {
    return this.http.post<void>(
      `/escrow/${encodeURIComponent(escrowId)}/dispute/vote`,
      vote,
    );
  }

  // --- Milestones ---

  deliverMilestone(
    escrowId: string,
    milestoneId: string,
    proof: { description: string; refs?: Array<string> },
  ): Promise<EscrowMilestone> {
    return this.http.post<EscrowMilestone>(
      `/escrow/${encodeURIComponent(escrowId)}/milestones/${encodeURIComponent(milestoneId)}/deliver`,
      proof,
    );
  }

  acceptMilestoneDelivery(escrowId: string, milestoneId: string): Promise<EscrowMilestone> {
    return this.http.post<EscrowMilestone>(
      `/escrow/${encodeURIComponent(escrowId)}/milestones/${encodeURIComponent(milestoneId)}/accept-delivery`,
    );
  }

  requestMilestoneRevision(
    escrowId: string,
    milestoneId: string,
    reason: string,
  ): Promise<EscrowMilestone> {
    return this.http.post<EscrowMilestone>(
      `/escrow/${encodeURIComponent(escrowId)}/milestones/${encodeURIComponent(milestoneId)}/request-revision`,
      { reason },
    );
  }

  disputeMilestone(
    escrowId: string,
    milestoneId: string,
    reason: string,
  ): Promise<EscrowDispute> {
    return this.http.post<EscrowDispute>(
      `/escrow/${encodeURIComponent(escrowId)}/milestones/${encodeURIComponent(milestoneId)}/dispute`,
      { reason },
    );
  }
}
