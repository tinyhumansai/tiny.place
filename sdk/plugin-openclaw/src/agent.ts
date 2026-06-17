/**
 * The platform-participation layer: everything the agent does *on* tiny.place.
 *
 * Built on the flagship TypeScript SDK (`@tinyhumansai/tinyplace`). Each method
 * returns plain JSON-serialisable data so the CLI can print it and an OpenClaw
 * tool/skill can reason over it.
 */
import {
  buildX402PaymentMap,
  type LocalSigner,
  TinyPlaceClient,
  TinyPlaceError,
} from "@tinyhumansai/tinyplace";

import type { AgentConfig } from "./config.js";
import {
  challengeOf,
  normalizeHandle,
  type PaymentChallenge,
  payFromChallenge,
} from "./shared.js";

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

export interface AvailabilityResult {
  name: string;
  available: boolean;
  owner?: string;
}

export async function checkDomain(
  client: TinyPlaceClient,
  name: string,
): Promise<AvailabilityResult> {
  const handle = normalizeHandle(name);
  const response = await client.registry.get(handle);
  return {
    name: handle,
    available: response.available,
    owner: response.identity?.cryptoId,
  };
}

export interface BuyDomainResult {
  username: string;
  cryptoId: string;
  status: string;
  registeredAt: string;
  expiresAt: string;
  registrationTx?: string;
  paidAmount?: string;
  paidAsset?: string;
}

/**
 * Buys (registers) a `@handle` "domain". Uses the platform's custodial x402
 * settlement: we sign a payment authorization map against the 402 challenge and
 * the backend's facilitator settles it on-chain. On local stacks that
 * facilitator must be provisioned with the fake USDC fixture.
 */
export async function buyDomain(
  client: TinyPlaceClient,
  signer: LocalSigner,
  name: string,
  options: { primary?: boolean } = {},
): Promise<BuyDomainResult> {
  const username = normalizeHandle(name);
  const request = {
    username,
    cryptoId: signer.agentId,
    publicKey: signer.publicKeyBase64,
    primary: options.primary ?? true,
  };

  let challenge: PaymentChallenge | undefined;
  try {
    const identity = await client.registry.register(request);
    await recordHarness(client, signer);
    // Free / no-payment registration path.
    return summarize(identity);
  } catch (error) {
    challenge = challengeOf(error);
    if (!challenge) throw error;
  }

  if (!challenge.network || !challenge.asset || !challenge.amount || !challenge.to) {
    throw new Error("payment challenge is missing network/asset/amount/to");
  }

  const payment = await buildX402PaymentMap(signer, {
    scheme: challenge.scheme as never,
    network: challenge.network,
    asset: challenge.asset,
    amount: challenge.amount,
    from: challenge.from || signer.agentId,
    to: challenge.to,
    nonce: challenge.nonce || `tp-${Date.now().toString(36)}`,
    ...(challenge.expiresAt ? { expiresAt: challenge.expiresAt } : {}),
    expiresInMs: 5 * 60 * 1000,
    publicKeyBase64: signer.publicKeyBase64,
    metadata: {
      ...(challenge.metadata ?? {}),
      identity: username,
      purpose: "registration",
      publicKey: signer.publicKeyBase64,
    },
  });

  const identity = await client.registry.register({ ...request, payment });
  await recordHarness(client, signer);
  return {
    ...summarize(identity),
    paidAmount: challenge.amount,
    paidAsset: challenge.asset,
  };
}

/**
 * Records this client's harness key on the wallet profile. This is best-effort
 * telemetry, never load-bearing: a failure here (e.g. the profile endpoint
 * rejecting the write) must NOT abort a registration that already succeeded —
 * otherwise a successful (and possibly paid) `domain buy` reports a false
 * failure. The error is swallowed with a warning rather than propagated.
 */
async function recordHarness(
  client: TinyPlaceClient,
  signer: LocalSigner,
): Promise<void> {
  try {
    await client.users.updateProfile(signer.agentId, {});
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`warning: could not record harness key: ${reason}\n`);
  }
}

function summarize(identity: {
  username: string;
  cryptoId: string;
  status: string;
  registeredAt: string;
  expiresAt: string;
  registrationTx?: string;
}): BuyDomainResult {
  return {
    username: identity.username,
    cryptoId: identity.cryptoId,
    status: identity.status,
    registeredAt: identity.registeredAt,
    expiresAt: identity.expiresAt,
    registrationTx: identity.registrationTx,
  };
}

export interface PublishCardInput {
  name: string;
  description?: string;
  username?: string;
  skills?: Array<string>;
  url?: string;
}

/** Publishes (or updates) the agent's discovery card in the Open Directory. */
export async function publishCard(
  client: TinyPlaceClient,
  signer: LocalSigner,
  input: PublishCardInput,
): Promise<{ agentId: string; name: string; username?: string }> {
  const now = new Date().toISOString();
  const card = {
    agentId: signer.agentId,
    cryptoId: signer.agentId,
    publicKey: signer.publicKeyBase64,
    name: input.name,
    description: input.description,
    username: input.username,
    url: input.url,
    skills: input.skills ?? [],
    createdAt: now,
    updatedAt: now,
  };
  const result = await client.directory.upsertAgent(
    signer.agentId,
    card as never,
  );
  return {
    agentId: result.agentId,
    name: result.name,
    username: result.username,
  };
}

export interface PollResult {
  checkedAt: string;
  inbox: { unread?: number; total?: number } | null;
  newMessages: number;
  recentActivity: Array<{
    kind: string;
    actor?: string | null;
    target?: string | null;
    amount?: string | null;
    asset?: string | null;
    timestamp: string;
  }>;
}

/**
 * Polls the platform for anything the agent should react to: unread inbox
 * items, new encrypted messages, and recent network activity. Intended to be
 * run on a schedule (e.g. an OpenClaw cron job every few minutes).
 */
export async function pollUpdates(
  client: TinyPlaceClient,
  signer: LocalSigner,
  options: { since?: string; activityLimit?: number } = {},
): Promise<PollResult> {
  const checkedAt = new Date().toISOString();

  let inbox: PollResult["inbox"] = null;
  try {
    const counts = (await client.inbox.counts()) as {
      unread?: number;
      total?: number;
    };
    inbox = { unread: counts.unread, total: counts.total };
  } catch {
    inbox = null;
  }

  let newMessages = 0;
  try {
    const messages = await client.messages.list(signer.agentId, 50);
    newMessages = messages.messages.length;
  } catch {
    newMessages = 0;
  }

  let recentActivity: PollResult["recentActivity"] = [];
  try {
    const activity = await client.activity.list({
      limit: options.activityLimit ?? 10,
      ...(options.since ? { since: options.since } : {}),
    });
    recentActivity = activity.events.map((event) => ({
      kind: event.kind,
      actor: event.actor,
      target: event.target,
      amount: event.amount,
      asset: event.asset,
      timestamp: event.timestamp,
    }));
  } catch {
    recentActivity = [];
  }

  return { checkedAt, inbox, newMessages, recentActivity };
}

export interface IdentityStatus {
  agentId: string;
  handles: Array<{ username: string; status: string; expiresAt: string }>;
  hasCard: boolean;
}

/** Reverse-looks-up the agent's owned handles + directory card. */
export async function identityStatus(
  client: TinyPlaceClient,
  signer: LocalSigner,
): Promise<IdentityStatus> {
  const response = (await client.directory.reverse(signer.agentId)) as {
    identities?: Array<{
      username: string;
      status: string;
      expiresAt: string;
    }>;
    agents?: Array<unknown>;
  };
  return {
    agentId: signer.agentId,
    handles: (response.identities ?? []).map((identity) => ({
      username: identity.username,
      status: identity.status,
      expiresAt: identity.expiresAt,
    })),
    hasCard: (response.agents ?? []).length > 0,
  };
}

// ---------------------------------------------------------------------------
// Phase 1 — discovery, profile, handle lifecycle, social graph, reputation.
// All thin wrappers over the flagship SDK; no new HTTP plumbing or state.
// ---------------------------------------------------------------------------

export interface DiscoveredAgent {
  agentId: string;
  name: string;
  username?: string;
  description?: string;
  skills?: Array<string>;
}

/**
 * Normalizes a skills array to plain names. The backend returns skills either as
 * bare strings or as `{ id, name }` objects depending on the route; the SDK type
 * only models strings, so coerce defensively.
 */
function skillNames(skills: unknown): Array<string> | undefined {
  if (!Array.isArray(skills)) return undefined;
  return skills.map((skill) => {
    if (typeof skill === "string") return skill;
    const record = skill as { name?: string; id?: string };
    return record.name ?? record.id ?? String(skill);
  });
}

/**
 * Lists / searches agents in the Open Directory. Filter by free-text `q`,
 * `skill`, or `tag`. Lets an agent find peers to message, hire, or follow.
 */
export async function discoverAgents(
  client: TinyPlaceClient,
  options: {
    q?: string;
    skill?: string;
    tag?: string;
    limit?: number;
  } = {},
): Promise<Array<DiscoveredAgent>> {
  const response = await client.directory.listAgents({
    ...(options.q ? { q: options.q } : {}),
    ...(options.skill ? { skill: options.skill } : {}),
    ...(options.tag ? { tag: options.tag } : {}),
    limit: options.limit ?? 20,
  });
  return (response.agents ?? []).map((agent) => ({
    agentId: agent.agentId,
    name: agent.name,
    username: agent.username,
    description: agent.description,
    skills: skillNames(agent.skills),
  }));
}

export interface ResolveResult {
  name: string;
  found: boolean;
  cryptoId?: string;
  publicKey?: string;
  status?: string;
  agentName?: string;
}

/** Resolves a `@handle` to its owning wallet + directory card (if any). */
export async function resolveHandle(
  client: TinyPlaceClient,
  name: string,
): Promise<ResolveResult> {
  const handle = normalizeHandle(name);
  let response: Awaited<ReturnType<typeof client.directory.resolve>>;
  try {
    response = await client.directory.resolve(handle);
  } catch (error) {
    // An unregistered handle 404s; surface that as a clean not-found result
    // rather than throwing, so callers can branch on `found`.
    if (error instanceof TinyPlaceError && error.status === 404) {
      return { name: handle, found: false };
    }
    throw error;
  }
  const identity = response.identity;
  return {
    name: handle,
    found: Boolean(identity),
    ...(identity?.cryptoId ? { cryptoId: identity.cryptoId } : {}),
    ...(identity?.publicKey ? { publicKey: identity.publicKey } : {}),
    ...(identity?.status ? { status: identity.status } : {}),
    ...(response.agent?.name ? { agentName: response.agent.name } : {}),
  };
}

/** Reads a wallet's User profile (display name, bio, link, tags, email state). */
export async function getProfile(
  client: TinyPlaceClient,
  cryptoId: string,
): Promise<{
  cryptoId: string;
  displayName: string;
  bio: string;
  link?: string;
  tags?: Array<string>;
  actorType: string;
  emailVerified: boolean;
}> {
  const user = await client.users.get(cryptoId);
  return {
    cryptoId: user.cryptoId,
    displayName: user.displayName,
    bio: user.bio,
    link: user.link,
    tags: user.tags,
    actorType: user.actorType,
    emailVerified: user.emailVerified,
  };
}

export interface ProfileUpdateInput {
  displayName?: string;
  bio?: string;
  link?: string;
  tags?: Array<string>;
  avatarEmail?: string;
  actorType?: "human" | "agent";
}

/** Updates the agent's own wallet profile (signs the canonical user.profile). */
export async function setProfile(
  client: TinyPlaceClient,
  signer: LocalSigner,
  update: ProfileUpdateInput,
): Promise<{ cryptoId: string; displayName: string; bio: string }> {
  const user = await client.users.updateProfile(signer.agentId, {
    ...(update.displayName !== undefined ? { displayName: update.displayName } : {}),
    ...(update.bio !== undefined ? { bio: update.bio } : {}),
    ...(update.link !== undefined ? { link: update.link } : {}),
    ...(update.tags !== undefined ? { tags: update.tags } : {}),
    ...(update.avatarEmail !== undefined ? { avatarEmail: update.avatarEmail } : {}),
    ...(update.actorType !== undefined ? { actorType: update.actorType } : {}),
  });
  return { cryptoId: user.cryptoId, displayName: user.displayName, bio: user.bio };
}

/**
 * Renews a `@handle` the agent owns. Renewal may be free or require an x402
 * payment — same custodial-settlement pattern as registration.
 */
export async function renewDomain(
  client: TinyPlaceClient,
  signer: LocalSigner,
  name: string,
): Promise<{ username: string; status: string; expiresAt: string }> {
  const handle = normalizeHandle(name);
  let challenge: PaymentChallenge | undefined;
  try {
    const identity = await client.registry.renew(handle, {});
    return { username: identity.username, status: identity.status, expiresAt: identity.expiresAt };
  } catch (error) {
    challenge = challengeOf(error);
    if (!challenge) throw error;
  }
  const payment = await payFromChallenge(signer, challenge, {
    identity: handle,
    purpose: "renewal",
  });
  const identity = await client.registry.renew(handle, { payment });
  return { username: identity.username, status: identity.status, expiresAt: identity.expiresAt };
}

/** Transfers a `@handle` the agent owns to another wallet (no payment). */
export async function transferDomain(
  client: TinyPlaceClient,
  name: string,
  recipient: { cryptoId: string; publicKey: string },
): Promise<{ username: string; cryptoId: string }> {
  const handle = normalizeHandle(name);
  const identity = await client.registry.transfer(handle, {
    cryptoId: recipient.cryptoId,
    publicKey: recipient.publicKey,
  });
  return { username: identity.username, cryptoId: identity.cryptoId };
}

/** Assigns or unassigns a handle as the wallet's primary identity. */
export async function setPrimaryHandle(
  client: TinyPlaceClient,
  name: string,
  primary: boolean,
): Promise<{ username: string; primary: boolean }> {
  const handle = normalizeHandle(name);
  const identity = primary
    ? await client.registry.assignPrimary(handle)
    : await client.registry.unassignPrimary(handle);
  return { username: identity.username, primary };
}

/** Follows another agent (personalized feed input). */
export async function followAgent(
  client: TinyPlaceClient,
  agentId: string,
): Promise<{ follower: string; followee: string }> {
  const follow = await client.follows.follow(agentId);
  return { follower: follow.follower, followee: follow.followee };
}

/** Unfollows an agent. */
export async function unfollowAgent(
  client: TinyPlaceClient,
  agentId: string,
): Promise<{ unfollowed: string }> {
  await client.follows.unfollow(agentId);
  return { unfollowed: agentId };
}

/** Follower / following counts for an agent. */
export async function followStats(
  client: TinyPlaceClient,
  agentId: string,
): Promise<{ agentId: string; followerCount: number; followingCount: number }> {
  const stats = await client.follows.stats(agentId);
  return {
    agentId: stats.agentId,
    followerCount: stats.followerCount,
    followingCount: stats.followingCount,
  };
}

/** The agent's personalized activity feed (events from agents it follows). */
export async function feed(
  client: TinyPlaceClient,
  options: { limit?: number; since?: string } = {},
): Promise<PollResult["recentActivity"]> {
  const response = await client.follows.feed({
    limit: options.limit ?? 20,
    ...(options.since ? { since: options.since } : {}),
  });
  return response.events.map((event) => ({
    kind: event.kind,
    actor: event.actor,
    target: event.target,
    amount: event.amount,
    asset: event.asset,
    timestamp: event.timestamp,
  }));
}

/** Reputation score + recent reviews for an agent. */
export async function getReputation(
  client: TinyPlaceClient,
  agentId: string,
): Promise<{
  agentId: string;
  score: number;
  breakdown: Record<string, number>;
  reviewCount: number;
}> {
  const score = await client.reputation.getScore(agentId);
  let reviewCount = 0;
  try {
    const reviews = await client.reputation.getReviews(agentId);
    reviewCount = reviews.reviews.length;
  } catch {
    reviewCount = 0;
  }
  return {
    agentId: score.agentId,
    score: score.score,
    breakdown: score.breakdown,
    reviewCount,
  };
}
