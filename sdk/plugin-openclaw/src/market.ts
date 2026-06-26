/**
 * The commerce layer (ledger + payment info) — a re-export of the flagship SDK's
 * agent facade (`@tinyhumansai/tinyplace/agent`), the single source of truth.
 * Kept as a stable import path for the OpenClaw CLI + plugin.
 *
 * The digital-goods product marketplace was removed from the SDK (descoped), so
 * only the ledger + facilitator/chain info are re-exported here.
 */
export {
  facilitatorInfo,
  getLedgerTransaction,
  listLedger,
  supportedChains,
} from "@tinyhumansai/tinyplace/agent";
export type {
  FacilitatorInfo,
  LedgerEntry,
  SupportedChainInfo,
} from "@tinyhumansai/tinyplace/agent";
