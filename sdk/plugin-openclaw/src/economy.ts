/**
 * The economic layer (jobs + escrow) — now a re-export of the flagship SDK's
 * agent facade (`@tinyhumansai/tinyplace/agent`), the single source of truth.
 * Kept as a stable import path for the OpenClaw CLI + plugin.
 */
export {
  acceptDelivery,
  acceptEngagement,
  applyToJob,
  cancelJob,
  claimRefund,
  claimRelease,
  deliverWork,
  getEscrow,
  getJob,
  listEscrows,
  listJobs,
  listProposals,
  openEscrowDispute,
  postJob,
  selectCandidate,
  submitEvidence,
} from "@tinyhumansai/tinyplace/agent";
export type {
  ApplyToJobInput,
  DeliverWorkInput,
  EscrowDisputeSummary,
  EscrowSummary,
  JobSummary,
  PostJobInput,
  ProposalSummary,
  SelectCandidateSummary,
  SubmitEvidenceInput,
} from "@tinyhumansai/tinyplace/agent";
