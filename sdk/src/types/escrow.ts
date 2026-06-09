export type EscrowStatus =
  | "funded"
  | "accepted"
  | "delivered"
  | "revision_requested"
  | "settled"
  | "cancelled"
  | "disputed"
  | "resolved"
  | "expired";

export type EscrowDisputeTier = "mediation" | "arbitration";

export type EscrowDisputeStatus =
  | "open"
  | "proposed"
  | "accepted"
  | "escalated"
  | "resolved";

export type EscrowEvidenceType =
  | "message"
  | "delivery"
  | "file"
  | "external_link"
  | "transaction";

export interface EscrowTerms {
  description: string;
  deliverables?: Array<string>;
  deadline: string;
  maxRevisions: number;
  autoReleaseAfter?: string;
}

export interface EscrowMilestone {
  milestoneId: string;
  title: string;
  amount: string;
  deadline: string;
  status: string;
  revisionCount: number;
}

export interface EscrowDelivery {
  deliveryId: string;
  submittedBy: string;
  description: string;
  refs?: Array<string>;
  submittedAt: string;
}

export interface EscrowExtension {
  extensionId: string;
  requestedBy: string;
  reason?: string;
  deadline: string;
  status: string;
  requestedAt: string;
  approvedAt?: string;
}

export interface EscrowEvidence {
  evidenceId: string;
  disputeId: string;
  submittedBy: string;
  type: EscrowEvidenceType;
  description: string;
  ref?: string;
  submittedAt: string;
}

export interface EscrowMediationProposal {
  proposedAt: string;
  resolution: string;
  clientAmount?: string;
  providerAmount?: string;
  rationale?: string;
}

export interface EscrowCouncilVote {
  agent: string;
  vote: string;
  clientPct?: number;
  providerPct?: number;
  round: number;
  rationale?: string;
  votedAt: string;
}

export interface EscrowArbitrationOutcome {
  resolution: string;
  clientPct?: number;
  providerPct?: number;
  round: number;
  rationale?: string;
  resolvedAt: string;
}

export interface EscrowDispute {
  disputeId: string;
  escrowId: string;
  tier: EscrowDisputeTier;
  openedBy: string;
  reason: string;
  evidence?: Array<EscrowEvidence>;
  status: EscrowDisputeStatus;
  proposal?: EscrowMediationProposal;
  mediationAcceptedBy?: Array<string>;
  arbitrationPaidBy?: Array<string>;
  arbitrationRound?: number;
  council?: Array<EscrowCouncilVote>;
  arbitrationOutcome?: EscrowArbitrationOutcome;
  openedAt: string;
  escalatedAt?: string;
  resolvedAt?: string;
}

export interface Escrow {
  escrowId: string;
  status: EscrowStatus;
  client: string;
  clientCryptoId?: string;
  provider: string;
  providerCryptoId?: string;
  amount: string;
  asset: string;
  network: string;
  terms: EscrowTerms;
  milestones?: Array<EscrowMilestone>;
  deliveries?: Array<EscrowDelivery>;
  extensions?: Array<EscrowExtension>;
  revisionCount: number;
  dispute?: EscrowDispute;
  createdAt: string;
  fundedAt: string;
  acceptedAt?: string;
  deliveredAt?: string;
  resolvedAt?: string;
  cancelledAt?: string;
  onChainTx?: string;
  ledgerTxId?: string;
  releaseLedgerTxId?: string;
}

export interface EscrowCreateRequest {
  provider: string;
  amount: string;
  asset: string;
  network: string;
  terms: EscrowTerms;
  milestones?: Array<Omit<EscrowMilestone, "milestoneId" | "status" | "revisionCount">>;
  payment?: Record<string, string>;
  signature?: string;
}

export interface EscrowQueryParams {
  client?: string;
  provider?: string;
  status?: EscrowStatus;
  limit?: number;
  offset?: number;
}
