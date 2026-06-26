/**
 * The escrow layer — a re-export of the flagship SDK's agent facade
 * (`@tinyhumansai/tinyplace/agent`), the single source of truth. Kept as a
 * stable import path for the OpenClaw CLI + plugin.
 *
 * The jobs surface was removed from the SDK (the jobs vertical was descoped;
 * funded work now flows through bounties), so only escrow is re-exported here.
 */
export {
  acceptDelivery,
  acceptEngagement,
  claimRefund,
  claimRelease,
  deliverWork,
  getEscrow,
  listEscrows,
  openEscrowDispute,
  submitEvidence,
} from "@tinyhumansai/tinyplace/agent";
export type {
  DeliverWorkInput,
  EscrowDisputeSummary,
  EscrowSummary,
  SubmitEvidenceInput,
} from "@tinyhumansai/tinyplace/agent";
