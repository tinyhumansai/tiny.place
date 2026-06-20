/**
 * Shared platform helpers — now a thin re-export of the flagship SDK's agent
 * facade, which owns the canonical handle normalization and the x402
 * "402 challenge → signed payment map" flow. Kept as a stable import path for the
 * OpenClaw modules + CLI that referenced `./shared.js`.
 */
export {
  challengeOf,
  normalizeHandle,
  payFromChallenge,
} from "@tinyhumansai/tinyplace/agent";
export type { PaymentChallenge } from "@tinyhumansai/tinyplace";
