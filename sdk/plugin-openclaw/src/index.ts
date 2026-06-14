/**
 * @tinyhumansai/tinyplace-openclaw
 *
 * Programmatic surface behind the `tinyplace-agent` CLI and the OpenClaw
 * plugin/skill. Lets any host embed self-custodied wallet management, MoonPay
 * on/off-ramp link generation, and tiny.place platform participation.
 */
export { loadConfig } from "./config.js";
export type { AgentConfig } from "./config.js";

export {
  createWallet,
  unlockWallet,
  readWalletInfo,
  walletExists,
  exportSeedHex,
} from "./wallet.js";
export type { WalletInfo } from "./wallet.js";

export { getBalances, airdrop } from "./solana-local.js";
export type { BalanceSummary } from "./solana-local.js";

export { buildOnRampUrl, buildOffRampUrl } from "./moonpay.js";
export type { RampLink } from "./moonpay.js";

export {
  makeClient,
  checkDomain,
  buyDomain,
  publishCard,
  pollUpdates,
  identityStatus,
} from "./agent.js";
export type {
  AvailabilityResult,
  BuyDomainResult,
  PublishCardInput,
  PollResult,
  IdentityStatus,
} from "./agent.js";
