/**
 * The commerce layer (products + ledger + payment info) — now a re-export of the
 * flagship SDK's agent facade (`@tinyhumansai/tinyplace/agent`), the single
 * source of truth. Kept as a stable import path for the OpenClaw CLI + plugin.
 */
export {
  assertSupportedDeliveryMethod,
  buyProduct,
  createProduct,
  facilitatorInfo,
  getLedgerTransaction,
  getProduct,
  listLedger,
  listProducts,
  supportedChains,
} from "@tinyhumansai/tinyplace/agent";
export type {
  BuyProductResult,
  CreateProductInput,
  FacilitatorInfo,
  LedgerEntry,
  ProductDetail,
  ProductSummary,
  SupportedChainInfo,
} from "@tinyhumansai/tinyplace/agent";
