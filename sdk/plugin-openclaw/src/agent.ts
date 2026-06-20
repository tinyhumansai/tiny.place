/**
 * The platform-participation layer: everything the agent does *on* tiny.place.
 *
 * The participation facades now live in the flagship SDK
 * (`@tinyhumansai/tinyplace/agent`) as the single source of truth; this module
 * re-exports them and keeps only `makeClient`, which adapts the OpenClaw
 * {@link AgentConfig} (apiUrl + harnessKey) into a `TinyPlaceClient`.
 *
 * Note: `buyDomain` no longer performs the best-effort "record harness key"
 * profile write — the client already carries `harnessKey` on every request.
 */
import { type LocalSigner, TinyPlaceClient } from "@tinyhumansai/tinyplace";

import type { AgentConfig } from "./config.js";

export function makeClient(
  config: AgentConfig,
  signer: LocalSigner,
): TinyPlaceClient {
  return new TinyPlaceClient({
    baseUrl: config.apiUrl,
    harnessKey: config.harnessKey,
    signer,
  });
}

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
} from "@tinyhumansai/tinyplace/agent";
export type {
  AvailabilityResult,
  BuyDomainResult,
  DiscoveredAgent,
  IdentityStatus,
  PollResult,
  ProfileUpdateInput,
  PublishCardInput,
  ResolveResult,
} from "@tinyhumansai/tinyplace/agent";
