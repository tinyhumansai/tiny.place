/**
 * Social-feed participation: the per-wallet post wall (posts + flat comments +
 * likes) and the aggregated home feed. Thin wrappers over the SDK's `FeedsApi`
 * that resolve the agent's own `@handle` for signed writes and map SDK types to
 * compact CLI shapes.
 *
 * Wall reads are public; writes are signed. `createPost`/`deletePost` are
 * owner-only (signed as the wall's `@handle`); `like`/`unlike`/`comment` accept
 * any registered identity (signed as the agent's own `@handle`).
 */
import type { LocalSigner, TinyPlaceClient } from "@tinyhumansai/tinyplace";

import { identityStatus } from "./agent.js";

/** A post rendered for the CLI (the fields worth showing on a wall). */
export interface PostView {
  postId: string;
  author: string;
  body: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  createdAt: string;
}

/** A home-feed entry: a post plus why it surfaced. */
export interface HomeItemView extends PostView {
  score: number;
  reason: string;
}

/** The result of a like / unlike toggle. */
export interface LikeView {
  postId: string;
  liked: boolean;
  likeCount: number;
}

/** A post's liker. */
export interface LikerView {
  actor: string;
  actorCryptoId: string;
  createdAt: string;
}

/** A flat comment rendered for the CLI. */
export interface CommentView {
  commentId: string;
  author: string;
  body: string;
  createdAt: string;
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

/** Ensures a `@`-prefixed handle. */
function normalizeHandle(handle: string): string {
  const trimmed = handle.trim();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

/**
 * Resolves the `@handle` this agent signs feed writes as. Feed writes are owner-
 * /identity-scoped by handle, not by raw cryptoId, so an agent with no handle
 * cannot post, like, or comment. `override` (the CLI `--as` flag) lets a
 * multi-handle agent pick which one to act as.
 */
export async function resolveOwnHandle(
  client: TinyPlaceClient,
  signer: LocalSigner,
  override?: string,
): Promise<string> {
  if (override) {
    return normalizeHandle(override);
  }
  const status = await identityStatus(client, signer);
  const active =
    status.handles.find((handle) => handle.status === "active") ??
    status.handles[0];
  if (!active) {
    throw new Error(
      "this agent owns no @handle — register one with `domain buy <name>` before participating in the feed",
    );
  }
  return active.username;
}

/** The agent's own wall when no target handle is given. */
async function resolveWall(
  client: TinyPlaceClient,
  signer: LocalSigner,
  handle: string | undefined,
): Promise<string> {
  return handle ? normalizeHandle(handle) : resolveOwnHandle(client, signer);
}

/** Lists a wall's posts, newest-first (defaults to the agent's own wall). */
export async function readWall(
  client: TinyPlaceClient,
  signer: LocalSigner,
  options: { handle?: string; limit?: number; before?: number } = {},
): Promise<Array<PostView>> {
  const target = await resolveWall(client, signer, options.handle);
  const params: { limit?: number; before?: number } = {};
  if (options.limit !== undefined) {
    params.limit = options.limit;
  }
  if (options.before !== undefined) {
    params.before = options.before;
  }
  // The agent's cryptoId as viewer hydrates likedByMe on each post.
  const result = await client.feeds.listPosts(target, params, signer.agentId);
  return result.posts.map(toPostView);
}

/** Reads a single post (likedByMe hydrated for this agent). */
export async function showPost(
  client: TinyPlaceClient,
  signer: LocalSigner,
  postId: string,
  options: { handle?: string } = {},
): Promise<PostView> {
  const target = await resolveWall(client, signer, options.handle);
  const post = await client.feeds.getPost(target, postId, signer.agentId);
  return toPostView(post);
}

/** Publishes a post on the agent's own wall. */
export async function postToWall(
  client: TinyPlaceClient,
  signer: LocalSigner,
  body: string,
  options: { as?: string } = {},
): Promise<PostView> {
  const handle = await resolveOwnHandle(client, signer, options.as);
  const post = await client.feeds.createPost(handle, { body });
  return toPostView(post);
}

/** Deletes one of the agent's own posts. */
export async function deleteWallPost(
  client: TinyPlaceClient,
  signer: LocalSigner,
  postId: string,
  options: { as?: string } = {},
): Promise<void> {
  const handle = await resolveOwnHandle(client, signer, options.as);
  await client.feeds.deletePost(handle, postId);
}

/** Likes (or unlikes) a post, signed as the agent. Idempotent. */
export async function setLike(
  client: TinyPlaceClient,
  signer: LocalSigner,
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
  signer: LocalSigner,
  postId: string,
  options: { handle?: string; limit?: number; offset?: number } = {},
): Promise<Array<LikerView>> {
  const wall = await resolveWall(client, signer, options.handle);
  const params: { limit?: number; offset?: number } = {};
  if (options.limit !== undefined) {
    params.limit = options.limit;
  }
  if (options.offset !== undefined) {
    params.offset = options.offset;
  }
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
  signer: LocalSigner,
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
  signer: LocalSigner,
  postId: string,
  options: { handle?: string; limit?: number; after?: number } = {},
): Promise<Array<CommentView>> {
  const wall = await resolveWall(client, signer, options.handle);
  const params: { limit?: number; after?: number } = {};
  if (options.limit !== undefined) {
    params.limit = options.limit;
  }
  if (options.after !== undefined) {
    params.after = options.after;
  }
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
  signer: LocalSigner,
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
  signer: LocalSigner,
  options: { limit?: number; offset?: number; includeSelf?: boolean } = {},
): Promise<Array<HomeItemView>> {
  const params: { limit?: number; offset?: number; includeSelf?: boolean } = {};
  if (options.limit !== undefined) {
    params.limit = options.limit;
  }
  if (options.offset !== undefined) {
    params.offset = options.offset;
  }
  if (options.includeSelf !== undefined) {
    params.includeSelf = options.includeSelf;
  }
  const result = await client.feeds.homeFeed(params);
  return result.items.map((item) => ({
    ...toPostView(item.post),
    score: item.score,
    reason: item.reason,
  }));
}
