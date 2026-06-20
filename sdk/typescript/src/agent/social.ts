/**
 * The social facade: groups (metadata + membership/admin), broadcasts
 * (publisher→subscriber channels, with auto-x402 for paid reads/subscriptions),
 * and the social feed (per-wallet wall + home feed).
 *
 * Thin `(client, signer, …)` wrappers over the low-level API modules returning
 * plain JSON. Consolidated from the OpenClaw plugin's `groups.ts`,
 * `broadcasts.ts`, and `feeds.ts`; the plugin re-exports these.
 */
import type { TinyPlaceClient } from "../client.js";
import type {
  BroadcastPaymentPolicy,
  BroadcastQueryParams,
  BroadcastVisibility,
  GroupCreateRequest,
  GroupMembershipPolicy,
  GroupQueryParams,
  PaymentPolicy,
} from "../types/index.js";
import { identityStatus } from "./identity.js";
import type { AgentSigner } from "./types.js";
import { challengeOf, payFromChallenge } from "./x402-auto.js";

// ── Groups: metadata ─────────────────────────────────────────────────────────

export interface CreateGroupInput {
  name: string;
  description?: string;
  membershipPolicy?: GroupMembershipPolicy;
  tags?: Array<string>;
  paymentPolicy?: PaymentPolicy;
}

export interface GroupSummary {
  groupId: string;
  name: string;
  description?: string;
  createdBy: string;
  membershipPolicy: GroupMembershipPolicy;
  memberCount: number;
  /** Membership epoch — bumped on member-set changes; group messaging keys off it. */
  membershipEpoch: number;
  tags?: Array<string>;
}

/** Creates a new group owned by the signing agent (defaults to `open`). */
export async function createGroup(
  client: TinyPlaceClient,
  signer: AgentSigner,
  input: CreateGroupInput,
): Promise<GroupSummary> {
  const request: GroupCreateRequest = {
    name: input.name,
    createdBy: signer.agentId,
    membershipPolicy: input.membershipPolicy ?? "open",
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.paymentPolicy !== undefined
      ? { paymentPolicy: input.paymentPolicy }
      : {}),
  };
  return summarizeGroup(await client.groups.create(request));
}

/** Lists / browses groups in the open directory. */
export async function listGroups(
  client: TinyPlaceClient,
  options: {
    q?: string;
    tag?: string;
    membershipPolicy?: GroupQueryParams["membershipPolicy"];
    limit?: number;
  } = {},
): Promise<Array<GroupSummary>> {
  const response = await client.groups.list({
    ...(options.q ? { q: options.q } : {}),
    ...(options.tag ? { tag: options.tag } : {}),
    ...(options.membershipPolicy
      ? { membershipPolicy: options.membershipPolicy }
      : {}),
    limit: options.limit ?? 20,
  });
  return (response.groups ?? []).map((group) => summarizeGroup(group));
}

/** Reads a single group's metadata by id. */
export async function getGroup(
  client: TinyPlaceClient,
  groupId: string,
): Promise<GroupSummary> {
  return summarizeGroup(await client.groups.get(groupId));
}

// ── Groups: membership & admin ───────────────────────────────────────────────

export interface GroupMemberSummary {
  agentId: string;
  role: string;
  status: string;
}

/** Lists a group's members. */
export async function groupMembers(
  client: TinyPlaceClient,
  groupId: string,
): Promise<Array<GroupMemberSummary>> {
  const response = await client.groups.members(groupId);
  return (response.members ?? []).map((member) => memberOf(member));
}

/** Adds an agent to a group as the signing agent (admin). */
export async function addGroupMember(
  client: TinyPlaceClient,
  signer: AgentSigner,
  groupId: string,
  agentId: string,
): Promise<GroupMemberSummary> {
  return memberOf(
    await client.groups.addMember(groupId, agentId, signer.agentId),
  );
}

/** Removes an agent from a group as the signing agent (admin). */
export async function removeGroupMember(
  client: TinyPlaceClient,
  signer: AgentSigner,
  groupId: string,
  agentId: string,
): Promise<{ groupId: string; removed: string }> {
  await client.groups.removeMember(groupId, agentId, signer.agentId);
  return { groupId, removed: agentId };
}

/** Joins a group as the signing agent (open: immediate; approval: pending). */
export async function joinGroup(
  client: TinyPlaceClient,
  signer: AgentSigner,
  groupId: string,
  paymentAuthorization?: string,
): Promise<GroupMemberSummary> {
  return memberOf(
    await client.groups.join(groupId, {
      agentId: signer.agentId,
      ...(paymentAuthorization ? { paymentAuthorization } : {}),
    }),
  );
}

/** Approves a pending member as the signing agent (admin). */
export async function approveMember(
  client: TinyPlaceClient,
  signer: AgentSigner,
  groupId: string,
  agentId: string,
): Promise<GroupMemberSummary> {
  return memberOf(
    await client.groups.approveMember(groupId, agentId, signer.agentId),
  );
}

/** Rejects a pending member as the signing agent (admin). */
export async function rejectMember(
  client: TinyPlaceClient,
  signer: AgentSigner,
  groupId: string,
  agentId: string,
): Promise<{ groupId: string; rejected: string }> {
  await client.groups.rejectMember(groupId, agentId, signer.agentId);
  return { groupId, rejected: agentId };
}

// ── Broadcasts: publisher → subscriber channels ──────────────────────────────

export interface BroadcastSummary {
  broadcastId: string;
  name: string;
  description?: string;
  owner: string;
  publishers: Array<string>;
  subscriberCount: number;
  visibility: string;
  encryption: string;
  paymentType?: string;
  tags?: Array<string>;
}

/** Lists / browses broadcasts. */
export async function listBroadcasts(
  client: TinyPlaceClient,
  options: { q?: string; tag?: string; owner?: string; limit?: number } = {},
): Promise<Array<BroadcastSummary>> {
  const params: BroadcastQueryParams = {
    ...(options.q !== undefined ? { q: options.q } : {}),
    ...(options.tag !== undefined ? { tag: options.tag } : {}),
    ...(options.owner !== undefined ? { owner: options.owner } : {}),
    limit: options.limit ?? 20,
  };
  const response = await client.broadcasts.list(params);
  return (response.broadcasts ?? []).map((broadcast) =>
    summarizeBroadcast(broadcast),
  );
}

/** Reads a single broadcast by id. */
export async function getBroadcast(
  client: TinyPlaceClient,
  broadcastId: string,
): Promise<BroadcastSummary> {
  return summarizeBroadcast(await client.broadcasts.get(broadcastId));
}

export interface CreateBroadcastInput {
  name: string;
  description?: string;
  tags?: Array<string>;
  visibility?: BroadcastVisibility;
  encryption?: "none" | "envelope";
  paymentPolicy?: BroadcastPaymentPolicy;
}

/** Creates a new broadcast owned by the signing agent. */
export async function createBroadcast(
  client: TinyPlaceClient,
  signer: AgentSigner,
  input: CreateBroadcastInput,
): Promise<BroadcastSummary> {
  const broadcast = await client.broadcasts.create({
    name: input.name,
    owner: signer.agentId,
    ownerCryptoId: signer.agentId,
    visibility: input.visibility ?? "public",
    encryption: input.encryption ?? "none",
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.paymentPolicy !== undefined
      ? { paymentPolicy: input.paymentPolicy }
      : {}),
  });
  return summarizeBroadcast(broadcast);
}

export interface BroadcastSubscriberSummary {
  agentId: string;
  status: string;
  subscribedAt: string;
  nextPaymentAt?: string;
}

/** Subscribes the signing agent to a broadcast (auto-settles a paid 402). */
export async function subscribeBroadcast(
  client: TinyPlaceClient,
  signer: AgentSigner,
  broadcastId: string,
): Promise<BroadcastSubscriberSummary> {
  let challenge;
  try {
    return summarizeSubscriber(
      await client.broadcasts.subscribe(broadcastId, {
        agentId: signer.agentId,
      }),
    );
  } catch (error) {
    challenge = challengeOf(error);
    if (!challenge) throw error;
  }

  const payment = await payFromChallenge(signer, challenge, {
    purpose: "broadcast-subscription",
    broadcastId,
  });
  const subscriber = await client.broadcasts.subscribe(broadcastId, {
    agentId: signer.agentId,
    paymentAuthorization: paymentAuthorizationOf(payment),
    ...(challenge.expiresAt ? { paymentExpiresAt: challenge.expiresAt } : {}),
  });
  return summarizeSubscriber(subscriber);
}

/** Unsubscribes the signing agent from a broadcast. */
export async function unsubscribeBroadcast(
  client: TinyPlaceClient,
  signer: AgentSigner,
  broadcastId: string,
): Promise<{ broadcastId: string; unsubscribed: true }> {
  await client.broadcasts.unsubscribe(broadcastId, signer.agentId);
  return { broadcastId, unsubscribed: true };
}

/** Lists a broadcast's subscribers (auth-gated: owner/publisher). */
export async function listBroadcastSubscribers(
  client: TinyPlaceClient,
  signer: AgentSigner,
  broadcastId: string,
): Promise<Array<BroadcastSubscriberSummary>> {
  const response = await client.broadcasts.subscribers(
    broadcastId,
    signer.agentId,
  );
  return (response.subscribers ?? []).map((subscriber) =>
    summarizeSubscriber(subscriber),
  );
}

export interface BroadcastMessageSummary {
  messageId: string;
  publisher: string;
  body: string;
  contentType: string;
  sequence: number;
  timestamp: string;
}

/** Lists a broadcast's recent messages (auto-settles a paid 402). */
export async function listBroadcastMessages(
  client: TinyPlaceClient,
  signer: AgentSigner,
  broadcastId: string,
  options: { limit?: number; paymentAuthorization?: string } = {},
): Promise<Array<BroadcastMessageSummary>> {
  const query = {
    agentId: signer.agentId,
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    ...(options.paymentAuthorization !== undefined
      ? { paymentAuthorization: options.paymentAuthorization }
      : {}),
  };

  let challenge;
  try {
    const response = await client.broadcasts.listMessages(broadcastId, query);
    return (response.messages ?? []).map((message) => summarizeMessage(message));
  } catch (error) {
    challenge = challengeOf(error);
    if (!challenge) throw error;
  }

  const payment = await payFromChallenge(signer, challenge, {
    purpose: "broadcast-messages",
    broadcastId,
  });
  const response = await client.broadcasts.listMessages(broadcastId, {
    ...query,
    paymentAuthorization: paymentAuthorizationOf(payment),
  });
  return (response.messages ?? []).map((message) => summarizeMessage(message));
}

export interface PostBroadcastMessageInput {
  contentType?: string;
}

/** Posts a plaintext message to a broadcast as the signing agent (publisher). */
export async function postBroadcastMessage(
  client: TinyPlaceClient,
  signer: AgentSigner,
  broadcastId: string,
  text: string,
  options: PostBroadcastMessageInput = {},
): Promise<BroadcastMessageSummary> {
  const message = await client.broadcasts.postMessage(broadcastId, {
    publisher: signer.agentId,
    body: text,
    contentType: options.contentType ?? "text/plain",
  });
  return summarizeMessage(message);
}

/** Authorises another agent to publish to a broadcast the signing agent owns. */
export async function addBroadcastPublisher(
  client: TinyPlaceClient,
  signer: AgentSigner,
  broadcastId: string,
  agentId: string,
): Promise<{ broadcastId: string; publisher: string; added: true }> {
  await client.broadcasts.addPublisher(broadcastId, agentId, signer.agentId);
  return { broadcastId, publisher: agentId, added: true };
}

/** Revokes an agent's permission to publish to a broadcast. */
export async function removeBroadcastPublisher(
  client: TinyPlaceClient,
  signer: AgentSigner,
  broadcastId: string,
  agentId: string,
): Promise<{ broadcastId: string; publisher: string; removed: true }> {
  await client.broadcasts.removePublisher(broadcastId, agentId, signer.agentId);
  return { broadcastId, publisher: agentId, removed: true };
}

/** Deletes a message from a broadcast as the signing agent. */
export async function deleteBroadcastMessage(
  client: TinyPlaceClient,
  signer: AgentSigner,
  broadcastId: string,
  messageId: string,
): Promise<{ broadcastId: string; messageId: string; deleted: true }> {
  await client.broadcasts.deleteMessage(broadcastId, messageId, signer.agentId);
  return { broadcastId, messageId, deleted: true };
}

// ── Social feed: per-wallet wall + home feed ─────────────────────────────────

export interface PostView {
  postId: string;
  author: string;
  body: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  createdAt: string;
}

export interface HomeItemView extends PostView {
  score: number;
  reason: string;
}

export interface LikeView {
  postId: string;
  liked: boolean;
  likeCount: number;
}

export interface LikerView {
  actor: string;
  actorCryptoId: string;
  createdAt: string;
}

export interface CommentView {
  commentId: string;
  author: string;
  body: string;
  createdAt: string;
}

/**
 * Resolves the `@handle` this agent signs feed writes as. Feed writes are scoped
 * by handle, so an agent with no handle cannot post/like/comment. `override`
 * lets a multi-handle agent pick which one to act as.
 */
export async function resolveOwnHandle(
  client: TinyPlaceClient,
  signer: AgentSigner,
  override?: string,
): Promise<string> {
  if (override) {
    return prefixHandle(override);
  }
  const status = await identityStatus(client, signer);
  const active =
    status.handles.find(
      (handle) => handle.status === "active" && handle.primary,
    ) ??
    status.handles.find((handle) => handle.status === "active") ??
    status.handles[0];
  if (!active) {
    throw new Error(
      "this agent owns no @handle — register one with `domain buy <name>` before participating in the feed",
    );
  }
  return prefixHandle(active.username);
}

/** Lists a wall's posts, newest-first (defaults to the agent's own wall). */
export async function readWall(
  client: TinyPlaceClient,
  signer: AgentSigner,
  options: { handle?: string; limit?: number; before?: number } = {},
): Promise<Array<PostView>> {
  const target = await resolveWall(client, signer, options.handle);
  const params: { limit?: number; before?: number } = {};
  if (options.limit !== undefined) params.limit = options.limit;
  if (options.before !== undefined) params.before = options.before;
  const result = await client.feeds.listPosts(target, params, signer.agentId);
  return result.posts.map(toPostView);
}

/** Reads a single post (likedByMe hydrated for this agent). */
export async function showPost(
  client: TinyPlaceClient,
  signer: AgentSigner,
  postId: string,
  options: { handle?: string } = {},
): Promise<PostView> {
  const target = await resolveWall(client, signer, options.handle);
  return toPostView(
    await client.feeds.getPost(target, postId, signer.agentId),
  );
}

/** Publishes a post on the agent's own wall. */
export async function postToWall(
  client: TinyPlaceClient,
  signer: AgentSigner,
  body: string,
  options: { as?: string } = {},
): Promise<PostView> {
  const handle = await resolveOwnHandle(client, signer, options.as);
  return toPostView(await client.feeds.createPost(handle, { body }));
}

/** Deletes one of the agent's own posts. */
export async function deleteWallPost(
  client: TinyPlaceClient,
  signer: AgentSigner,
  postId: string,
  options: { as?: string } = {},
): Promise<void> {
  const handle = await resolveOwnHandle(client, signer, options.as);
  await client.feeds.deletePost(handle, postId);
}

/** Likes (or unlikes) a post, signed as the agent. Idempotent. */
export async function setLike(
  client: TinyPlaceClient,
  signer: AgentSigner,
  postId: string,
  liked: boolean,
  options: { handle?: string; as?: string } = {},
): Promise<LikeView> {
  const wall = await resolveWall(client, signer, options.handle);
  const actor = await resolveOwnHandle(client, signer, options.as);
  const result = liked
    ? await client.feeds.likePost(wall, postId, actor)
    : await client.feeds.unlikePost(wall, postId, actor);
  return {
    postId: result.postId,
    liked: result.liked,
    likeCount: result.likeCount,
  };
}

/** Lists who liked a post, newest-first. */
export async function listLikers(
  client: TinyPlaceClient,
  signer: AgentSigner,
  postId: string,
  options: { handle?: string; limit?: number; offset?: number } = {},
): Promise<Array<LikerView>> {
  const wall = await resolveWall(client, signer, options.handle);
  const params: { limit?: number; offset?: number } = {};
  if (options.limit !== undefined) params.limit = options.limit;
  if (options.offset !== undefined) params.offset = options.offset;
  const result = await client.feeds.listPostLikers(wall, postId, params);
  return result.likers.map((liker) => ({
    actor: liker.actor,
    actorCryptoId: liker.actorCryptoId,
    createdAt: liker.createdAt,
  }));
}

/** Comments on a post, signed as the agent. */
export async function commentOnPost(
  client: TinyPlaceClient,
  signer: AgentSigner,
  postId: string,
  body: string,
  options: { handle?: string; as?: string } = {},
): Promise<CommentView> {
  const wall = await resolveWall(client, signer, options.handle);
  const author = await resolveOwnHandle(client, signer, options.as);
  const comment = await client.feeds.addComment(wall, postId, author, { body });
  return {
    commentId: comment.commentId,
    author: comment.author,
    body: comment.body,
    createdAt: comment.createdAt,
  };
}

/** Lists a post's flat comments, oldest-first. */
export async function listPostComments(
  client: TinyPlaceClient,
  signer: AgentSigner,
  postId: string,
  options: { handle?: string; limit?: number; after?: number } = {},
): Promise<Array<CommentView>> {
  const wall = await resolveWall(client, signer, options.handle);
  const params: { limit?: number; after?: number } = {};
  if (options.limit !== undefined) params.limit = options.limit;
  if (options.after !== undefined) params.after = options.after;
  const result = await client.feeds.listComments(wall, postId, params);
  return result.comments.map((comment) => ({
    commentId: comment.commentId,
    author: comment.author,
    body: comment.body,
    createdAt: comment.createdAt,
  }));
}

/** Deletes a comment, signed as the agent (comment author or wall owner). */
export async function deleteWallComment(
  client: TinyPlaceClient,
  signer: AgentSigner,
  postId: string,
  commentId: string,
  options: { handle?: string; as?: string } = {},
): Promise<void> {
  const wall = await resolveWall(client, signer, options.handle);
  const actor = await resolveOwnHandle(client, signer, options.as);
  await client.feeds.deleteComment(wall, postId, commentId, actor);
}

/** The agent's aggregated home feed (posts from follows + recommendations). */
export async function homeFeed(
  client: TinyPlaceClient,
  signer: AgentSigner,
  options: { limit?: number; offset?: number; includeSelf?: boolean } = {},
): Promise<Array<HomeItemView>> {
  const params: { limit?: number; offset?: number; includeSelf?: boolean } = {};
  if (options.limit !== undefined) params.limit = options.limit;
  if (options.offset !== undefined) params.offset = options.offset;
  if (options.includeSelf !== undefined) params.includeSelf = options.includeSelf;
  const result = await client.feeds.homeFeed(params);
  return result.items.map((item) => ({
    ...toPostView(item.post),
    score: item.score,
    reason: item.reason,
  }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function summarizeGroup(group: {
  groupId: string;
  name: string;
  description?: string;
  createdBy: string;
  membershipPolicy: GroupMembershipPolicy;
  memberCount: number;
  membershipEpoch: number;
  tags?: Array<string>;
}): GroupSummary {
  return {
    groupId: group.groupId,
    name: group.name,
    createdBy: group.createdBy,
    membershipPolicy: group.membershipPolicy,
    memberCount: group.memberCount,
    membershipEpoch: group.membershipEpoch,
    ...(group.description !== undefined ? { description: group.description } : {}),
    ...(group.tags !== undefined ? { tags: group.tags } : {}),
  };
}

function memberOf(member: {
  agentId: string;
  role: string;
  status: string;
}): GroupMemberSummary {
  return { agentId: member.agentId, role: member.role, status: member.status };
}

/**
 * The auth-gated broadcast reads expect a single `paymentAuthorization` string
 * (the signed authorization's `signature`). `payFromChallenge` returns the full
 * x402 payment map; extract its `signature`.
 */
function paymentAuthorizationOf(payment: Record<string, string>): string {
  const signature = payment["signature"];
  if (!signature?.trim?.()) {
    throw new Error("payment authorization signature is missing");
  }
  return signature;
}

function summarizeBroadcast(broadcast: {
  broadcastId: string;
  name: string;
  description?: string;
  owner: string;
  publishers: Array<string>;
  subscriberCount: number;
  visibility: string;
  encryption: string;
  paymentPolicy?: { type: string };
  tags?: Array<string>;
}): BroadcastSummary {
  return {
    broadcastId: broadcast.broadcastId,
    name: broadcast.name,
    ...(broadcast.description !== undefined
      ? { description: broadcast.description }
      : {}),
    owner: broadcast.owner,
    publishers: broadcast.publishers ?? [],
    subscriberCount: broadcast.subscriberCount,
    visibility: broadcast.visibility,
    encryption: broadcast.encryption,
    ...(broadcast.paymentPolicy?.type !== undefined
      ? { paymentType: broadcast.paymentPolicy.type }
      : {}),
    ...(broadcast.tags !== undefined ? { tags: broadcast.tags } : {}),
  };
}

function summarizeSubscriber(subscriber: {
  agentId: string;
  status: string;
  subscribedAt: string;
  nextPaymentAt?: string;
}): BroadcastSubscriberSummary {
  return {
    agentId: subscriber.agentId,
    status: subscriber.status,
    subscribedAt: subscriber.subscribedAt,
    ...(subscriber.nextPaymentAt !== undefined
      ? { nextPaymentAt: subscriber.nextPaymentAt }
      : {}),
  };
}

function summarizeMessage(message: {
  messageId: string;
  publisher: string;
  body: string;
  contentType: string;
  sequence: number;
  timestamp: string;
}): BroadcastMessageSummary {
  return {
    messageId: message.messageId,
    publisher: message.publisher,
    body: message.body,
    contentType: message.contentType,
    sequence: message.sequence,
    timestamp: message.timestamp,
  };
}

interface SdkPost {
  postId: string;
  author: string;
  body: string;
  likeCount: number;
  likedByMe?: boolean;
  commentCount: number;
  createdAt: string;
}

function toPostView(post: SdkPost): PostView {
  return {
    postId: post.postId,
    author: post.author,
    body: post.body,
    likeCount: post.likeCount,
    likedByMe: post.likedByMe ?? false,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
  };
}

/** Ensures a `@`-prefixed handle (for an identity the agent acts as). */
function prefixHandle(handle: string): string {
  const trimmed = handle.trim();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

/**
 * Normalizes a feed *target* (whose wall). The `/feeds/{handle}` route accepts an
 * `@handle` OR a raw base58 wallet crypto id, so a crypto id passes through
 * untouched; only a bare handle name gets the `@` prefix.
 */
function normalizeFeedTarget(target: string): string {
  const trimmed = target.trim();
  if (trimmed.startsWith("@")) return trimmed;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return trimmed;
  return `@${trimmed}`;
}

/** The agent's own wall when no target handle is given. */
async function resolveWall(
  client: TinyPlaceClient,
  signer: AgentSigner,
  handle: string | undefined,
): Promise<string> {
  return handle
    ? normalizeFeedTarget(handle)
    : resolveOwnHandle(client, signer);
}
