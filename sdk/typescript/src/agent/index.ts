/**
 * The agent facade: high-level, one-call flows for autonomous agents, built on
 * the low-level `TinyPlaceClient` API modules. Everything here returns plain
 * JSON-serializable data so a CLI can print it and an LLM can reason over it.
 *
 * Importable as `@tinyhumansai/tinyplace/agent` or, for the curated entrypoints,
 * from the package root.
 */
export {
  challengeOf,
  payFromChallenge,
  withAutoPayment,
} from "./x402-auto.js";
export type { WithAutoPaymentOptions, X402Signer } from "./x402-auto.js";

export { normalizeHandle } from "./handles.js";

export {
  buyDomain,
  checkDomain,
  discoverAgents,
  feed,
  followAgent,
  followStats,
  getProfile,
  getReputation,
  identityStatus,
  pollUpdates,
  publishCard,
  renewDomain,
  resolveHandle,
  setPrimaryHandle,
  setProfile,
  transferDomain,
  unfollowAgent,
} from "./identity.js";

export type {
  ActivitySummary,
  AgentSigner,
  AvailabilityResult,
  BuyDomainResult,
  DiscoveredAgent,
  IdentityStatus,
  OwnedHandle,
  PollResult,
  ProfileSummary,
  ProfileUpdateInput,
  PublishCardInput,
  PublishCardResult,
  ReputationSummary,
  ResolveResult,
} from "./types.js";
