import type { HttpClient } from "../http.js";
import type { TinyVerseWebSocket } from "../websocket.js";
import type {
  Escrow,
  EscrowCreateRequest,
  EscrowDispute,
  EscrowEvidence,
  EscrowMilestone,
  EscrowQueryParams,
} from "../types/index.js";

export class EscrowApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (
      path: string,
      options?: { directoryAuth?: boolean },
    ) => TinyVerseWebSocket,
  ) {}

  list(params?: EscrowQueryParams): Promise<{ escrows: Array<Escrow> }> {
    return this.http.getAuth<{ escrows: Array<Escrow> }>(
      "/escrow",
      params as Record<string, unknown>,
    );
  }

  create(request: EscrowCreateRequest): Promise<Escrow> {
    return this.http.postDirectoryAuthAs<Escrow>(
      "/escrow",
      request.client,
      request,
    );
  }

  get(escrowId: string): Promise<Escrow> {
    return this.http.getAuth<Escrow>(`/escrow/${encodeURIComponent(escrowId)}`);
  }

  stream(escrowId: string, agentId?: string): TinyVerseWebSocket | undefined {
    const query = agentId
      ? `?${new URLSearchParams({ "X-Agent-ID": agentId }).toString()}`
      : "";
    return this.wsFactory?.(
      `/escrow/${encodeURIComponent(escrowId)}/stream${query}`,
      agentId ? { directoryAuth: true } : undefined,
    );
  }

  accept(escrowId: string, actor?: string): Promise<Escrow> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/accept`,
      actor,
    );
  }

  deliver(
    escrowId: string,
    proof: { actor?: string; description: string; refs?: Array<string> },
  ): Promise<Escrow> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/deliver`,
      proof.actor,
      proof,
    );
  }

  acceptDelivery(
    escrowId: string,
    actor?: string,
    onChainTx?: string,
  ): Promise<Escrow> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/accept-delivery`,
      actor,
      onChainTx ? { onChainTx } : undefined,
    );
  }

  claimRelease(
    escrowId: string,
    actor?: string,
    onChainTx?: string,
  ): Promise<Escrow> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/claim-release`,
      actor,
      onChainTx ? { onChainTx } : undefined,
    );
  }

  claimRefund(
    escrowId: string,
    actor?: string,
    onChainTx?: string,
  ): Promise<Escrow> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/claim-refund`,
      actor,
      onChainTx ? { onChainTx } : undefined,
    );
  }

  requestRevision(
    escrowId: string,
    reason: string,
    actor?: string,
  ): Promise<Escrow> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/request-revision`,
      actor,
      { actor, reason },
    );
  }

  cancel(escrowId: string, actor?: string, onChainTx?: string): Promise<Escrow> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/cancel`,
      actor,
      onChainTx ? { onChainTx } : undefined,
    );
  }

  extendDeadline(
    escrowId: string,
    newDeadline: string,
    actor?: string,
  ): Promise<Escrow> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/extend-deadline`,
      actor,
      { actor, deadline: newDeadline },
    );
  }

  approveExtension(escrowId: string, actor?: string): Promise<Escrow> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/approve-extension`,
      actor,
    );
  }

  // --- Disputes ---

  openDispute(
    escrowId: string,
    reason: string,
    actor?: string,
  ): Promise<EscrowDispute> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/dispute`,
      actor,
      { actor, reason },
    );
  }

  getDispute(escrowId: string): Promise<EscrowDispute> {
    return this.http.getAuth<EscrowDispute>(`/escrow/${encodeURIComponent(escrowId)}/dispute`);
  }

  submitEvidence(
    escrowId: string,
    evidence: { actor?: string; type: string; description: string; ref?: string },
  ): Promise<void> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/dispute/evidence`,
      evidence.actor,
      evidence,
    );
  }

  acceptMediation(escrowId: string, actor?: string): Promise<EscrowDispute> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/dispute/accept-mediation`,
      actor,
    );
  }

  rejectMediation(escrowId: string, actor?: string): Promise<EscrowDispute> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/dispute/reject-mediation`,
      actor,
    );
  }

  payArbitration(
    escrowId: string,
    onChainTx: string,
    actor?: string,
  ): Promise<EscrowDispute> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/dispute/pay-arbitration`,
      actor,
      { actor, onChainTx },
    );
  }

  voteArbitration(
    escrowId: string,
    vote: { actor?: string; councilMember: string; vote: string; clientPct?: number; providerPct?: number; rationale?: string },
  ): Promise<void> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/dispute/vote`,
      vote.actor ?? vote.councilMember,
      vote,
    );
  }

  // --- Milestones ---

  deliverMilestone(
    escrowId: string,
    milestoneId: string,
    proof: { actor?: string; description: string; refs?: Array<string> },
  ): Promise<EscrowMilestone> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/milestones/${encodeURIComponent(milestoneId)}/deliver`,
      proof.actor,
      proof,
    );
  }

  acceptMilestoneDelivery(
    escrowId: string,
    milestoneId: string,
    actor?: string,
    onChainTx?: string,
  ): Promise<EscrowMilestone> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/milestones/${encodeURIComponent(milestoneId)}/accept-delivery`,
      actor,
      onChainTx ? { onChainTx } : undefined,
    );
  }

  requestMilestoneRevision(
    escrowId: string,
    milestoneId: string,
    reason: string,
    actor?: string,
  ): Promise<EscrowMilestone> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/milestones/${encodeURIComponent(milestoneId)}/request-revision`,
      actor,
      { actor, reason },
    );
  }

  disputeMilestone(
    escrowId: string,
    milestoneId: string,
    reason: string,
    actor?: string,
  ): Promise<EscrowDispute> {
    return this.postEscrowActor(
      `/escrow/${encodeURIComponent(escrowId)}/milestones/${encodeURIComponent(milestoneId)}/dispute`,
      actor,
      { actor, reason },
    );
  }

  private postEscrowActor<T>(
    path: string,
    actor?: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    if (actor) {
      return this.http.postDirectoryAuthAs<T>(path, actor, {
        ...(body ?? {}),
        actor,
      });
    }
    return this.http.post<T>(path, body);
  }
}
