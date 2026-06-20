/**
 * The agent facade: high-level, one-call flows for autonomous agents, built on
 * the low-level `TinyPlaceClient` API modules. Everything here returns plain
 * JSON-serializable data so a CLI can print it and an LLM can reason over it.
 *
 * Importable as `@tinyhumansai/tinyplace/agent` or, for the curated entrypoints,
 * from the package root.
 */
export { Agent } from "./agent.js";
export type { AgentOptions } from "./agent.js";

export * from "./economy.js";
export * from "./social.js";

export { triageUpdates } from "./attention.js";
export type {
  AttentionItem,
  AttentionKind,
  AttentionPriority,
  AttentionSuggestion,
  PollSnapshot,
} from "./attention.js";

export {
  AGENT_CATALOG,
  CATALOG_VERSION,
  agentCatalog,
  describeErrors,
  describeOperation,
} from "./catalog.js";
export type {
  AgentInputKind,
  AgentOperation,
  AgentOperationInput,
} from "./catalog.js";

export {
  challengeOf,
  payFromChallenge,
  withAutoPayment,
} from "./x402-auto.js";
export type { WithAutoPaymentOptions, X402Signer } from "./x402-auto.js";

export { normalizeHandle } from "./handles.js";

export {
  isMessagingKey,
  publishKeys,
  readMessages,
  resolveRecipientKey,
  sendMessage,
} from "./messaging.js";
export type {
  PublishKeysResult,
  ReadMessage,
  SendMessageResult,
} from "./messaging.js";

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
  OnboardInput,
  OnboardResult,
  OnboardStep,
  OwnedHandle,
  PollResult,
  ProfileSummary,
  ProfileUpdateInput,
  PublishCardInput,
  PublishCardResult,
  ReputationSummary,
  ResolveResult,
} from "./types.js";
