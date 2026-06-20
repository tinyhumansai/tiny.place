/**
 * Identity, discovery, profile, and social-graph facade functions.
 *
 * Each is a thin `(client, signer, …)` wrapper over the low-level
 * `TinyPlaceClient` API modules that returns plain JSON-serializable data — so a
 * CLI can print it and an LLM can reason over it. Paid actions (buy/renew a
 * handle) settle their x402 challenge automatically via {@link withAutoPayment}.
 *
 * These consolidate the facades that previously lived in the OpenClaw plugin's
 * `agent.ts`; the plugin now re-exports them.
 */
import type { TinyPlaceClient } from "../client.js";
import { TinyPlaceError } from "../http.js";
import { normalizeHandle } from "./handles.js";
import { withAutoPayment } from "./x402-auto.js";
import type {
  AgentSigner,
  AvailabilityResult,
  BuyDomainResult,
  DiscoveredAgent,
  IdentityStatus,
  PollResult,
  ProfileSummary,
  ProfileUpdateInput,
  PublishCardInput,
  PublishCardResult,
  ReputationSummary,
  ResolveResult,
} from "./types.js";

/** Checks whether a `@handle` is available, and who owns it if not. */
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

/**
 * Buys (registers) a `@handle`. Attempts the free path first; on an x402 402 it
 * signs the challenge and retries with payment (custodial settlement, same as the
 * website). Returns the paid amount/asset when a payment was made.
 */
export async function buyDomain(
  client: TinyPlaceClient,
  signer: AgentSigner,
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

  let paidAmount: string | undefined;
  let paidAsset: string | undefined;
  const identity = await withAutoPayment(
    signer,
    (payment) => {
      if (payment) {
        paidAmount = payment["amount"];
        paidAsset = payment["asset"];
      }
      return client.registry.register(
        payment ? { ...request, payment } : request,
      );
    },
    {
      metadata: {
        identity: username,
        purpose: "registration",
        publicKey: signer.publicKeyBase64,
      },
    },
  );

  return {
    ...summarize(identity),
    ...(paidAmount ? { paidAmount } : {}),
    ...(paidAsset ? { paidAsset } : {}),
  };
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

/** Publishes (or updates) the agent's discovery card in the Open Directory. */
export async function publishCard(
  client: TinyPlaceClient,
  signer: AgentSigner,
  input: PublishCardInput,
): Promise<PublishCardResult> {
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

/**
 * Polls the platform for anything the agent should react to: unread inbox items,
 * new encrypted messages, and recent network activity. Each read is independent
 * and best-effort, so one failing surface (e.g. no identity yet) does not blank
 * the others. Intended to be run on a schedule.
 */
export async function pollUpdates(
  client: TinyPlaceClient,
  signer: AgentSigner,
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
    const messages = await client.messages.list(signer.publicKeyBase64, 50);
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

/** Reverse-looks-up the agent's owned handles + whether it has a directory card. */
export async function identityStatus(
  client: TinyPlaceClient,
  signer: AgentSigner,
): Promise<IdentityStatus> {
  const response = (await client.directory.reverse(signer.agentId)) as {
    identities?: Array<{
      username: string;
      status: string;
      expiresAt: string;
      primary?: boolean;
    }>;
    agents?: Array<unknown>;
  };
  return {
    agentId: signer.agentId,
    handles: (response.identities ?? []).map((identity) => ({
      username: identity.username,
      status: identity.status,
      expiresAt: identity.expiresAt,
      primary: identity.primary ?? false,
    })),
    hasCard: (response.agents ?? []).length > 0,
  };
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
  options: { q?: string; skill?: string; tag?: string; limit?: number } = {},
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
    // An unregistered handle 404s; surface a clean not-found result rather than
    // throwing, so callers can branch on `found`.
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
): Promise<ProfileSummary> {
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

/** Updates the agent's own wallet profile (signs the canonical user.profile). */
export async function setProfile(
  client: TinyPlaceClient,
  signer: AgentSigner,
  update: ProfileUpdateInput,
): Promise<{ cryptoId: string; displayName: string; bio: string }> {
  const user = await client.users.updateProfile(signer.agentId, {
    ...(update.displayName !== undefined
      ? { displayName: update.displayName }
      : {}),
    ...(update.bio !== undefined ? { bio: update.bio } : {}),
    ...(update.link !== undefined ? { link: update.link } : {}),
    ...(update.tags !== undefined ? { tags: update.tags } : {}),
    ...(update.avatarEmail !== undefined
      ? { avatarEmail: update.avatarEmail }
      : {}),
    ...(update.actorType !== undefined ? { actorType: update.actorType } : {}),
  });
  return {
    cryptoId: user.cryptoId,
    displayName: user.displayName,
    bio: user.bio,
  };
}

/**
 * Renews a `@handle` the agent owns. Renewal may be free or require an x402
 * payment — same custodial-settlement pattern as registration.
 */
export async function renewDomain(
  client: TinyPlaceClient,
  signer: AgentSigner,
  name: string,
): Promise<{ username: string; status: string; expiresAt: string }> {
  const handle = normalizeHandle(name);
  const identity = await withAutoPayment(
    signer,
    (payment) => client.registry.renew(handle, payment ? { payment } : {}),
    { metadata: { identity: handle, purpose: "renewal" } },
  );
  return {
    username: identity.username,
    status: identity.status,
    expiresAt: identity.expiresAt,
  };
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

/** Reputation score + recent review count for an agent. */
export async function getReputation(
  client: TinyPlaceClient,
  agentId: string,
): Promise<ReputationSummary> {
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
