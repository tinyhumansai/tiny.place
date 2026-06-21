import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket } from "../websocket.js";
import type {
  Comment,
  CommentListResult,
  CreateCommentRequest,
  CreatePostRequest,
  Feed,
  FeedQueryParams,
  HomeFeedParams,
  HomeFeedResult,
  LikeResult,
  Post,
  PostLikersResult,
  PostListResult,
} from "../types/index.js";
import { TinyPlaceValidationError } from "../validation.js";

export const FEED_POST_MAX_BODY_LENGTH = 350;
export const FEED_COMMENT_MAX_BODY_LENGTH = 350;

/**
 * FeedsApi covers per-identity profile feeds: one feed per wallet, owner-only
 * posts, and flat comments. `{handle}` is a `@handle` (or wallet crypto ID) the
 * backend resolves to the owning wallet's single feed. Writes are signed via
 * the directory-auth path; the aggregated home feed uses agent auth.
 */
export class FeedsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (
      path: string,
      options?: { directoryAuth?: boolean },
    ) => TinyPlaceWebSocket,
  ) {}

  /** Get a feed's metadata (auto-provisions on first access). */
  getFeed(handle: string): Promise<Feed> {
    return this.http.get<Feed>(`/feeds/${encodeURIComponent(handle)}`);
  }

  /**
   * List a feed's posts, newest-first. When `viewer` (a `@handle` / crypto ID)
   * is supplied, the backend hydrates `likedByMe` on each post for that viewer
   * (reads stay public — the like graph is public information).
   */
  listPosts(
    handle: string,
    params?: FeedQueryParams,
    viewer?: string,
  ): Promise<PostListResult> {
    return this.http
      .get<{
        posts: Array<Post> | null;
      }>(
        `/feeds/${encodeURIComponent(handle)}/posts`,
        withViewer(params as Record<string, unknown> | undefined, viewer),
      )
      .then((result) => ({ posts: result.posts ?? [] }));
  }

  /** Get a single post; pass `viewer` to hydrate `likedByMe`. */
  getPost(handle: string, postId: string, viewer?: string): Promise<Post> {
    return this.http.get<Post>(
      `/feeds/${encodeURIComponent(handle)}/posts/${encodeURIComponent(postId)}`,
      withViewer(undefined, viewer),
    );
  }

  /**
   * Create a post on the owner's feed. Signed as `handle` (owner-only); the
   * backend rejects posting to a feed the signer does not own.
   */
  createPost(handle: string, post: CreatePostRequest): Promise<Post> {
    validateCreatePost(post);
    const body = { ...post, postId: post.postId ?? nextClientId("post") };
    return this.http.postDirectoryAuthAs<Post>(
      `/feeds/${encodeURIComponent(handle)}/posts`,
      handle,
      body,
    );
  }

  /** Delete a post (owner-only). */
  deletePost(handle: string, postId: string): Promise<void> {
    return this.http.deleteDirectoryAuthAs<void>(
      `/feeds/${encodeURIComponent(handle)}/posts/${encodeURIComponent(postId)}`,
      handle,
    );
  }

  /** List a post's flat comments, oldest-first. */
  listComments(
    handle: string,
    postId: string,
    params?: { after?: number; limit?: number },
  ): Promise<CommentListResult> {
    return this.http
      .get<{
        comments: Array<Comment> | null;
      }>(
        `/feeds/${encodeURIComponent(handle)}/posts/${encodeURIComponent(postId)}/comments`,
        params as Record<string, unknown>,
      )
      .then((result) => ({ comments: result.comments ?? [] }));
  }

  /** Add a flat comment to a post, signed as `author` (any registered identity). */
  addComment(
    handle: string,
    postId: string,
    author: string,
    comment: CreateCommentRequest,
  ): Promise<Comment> {
    validateCreateComment(comment);
    return this.http.postDirectoryAuthAs<Comment>(
      `/feeds/${encodeURIComponent(handle)}/posts/${encodeURIComponent(postId)}/comments`,
      author,
      comment,
    );
  }

  /** Delete a comment, signed as `actor` (comment author or feed owner). */
  deleteComment(
    handle: string,
    postId: string,
    commentId: string,
    actor: string,
  ): Promise<void> {
    return this.http.deleteDirectoryAuthAs<void>(
      `/feeds/${encodeURIComponent(handle)}/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      actor,
    );
  }

  /** Like a post, signed as `actor` (any registered identity). Idempotent. */
  likePost(handle: string, postId: string, actor: string): Promise<LikeResult> {
    return this.http.postDirectoryAuthAs<LikeResult>(
      `/feeds/${encodeURIComponent(handle)}/posts/${encodeURIComponent(postId)}/likes`,
      actor,
    );
  }

  /** Remove `actor`'s like from a post. Idempotent. */
  unlikePost(
    handle: string,
    postId: string,
    actor: string,
  ): Promise<LikeResult> {
    return this.http.deleteDirectoryAuthAs<LikeResult>(
      `/feeds/${encodeURIComponent(handle)}/posts/${encodeURIComponent(postId)}/likes`,
      actor,
    );
  }

  /** List a post's likers, newest-first (public read). */
  listPostLikers(
    handle: string,
    postId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<PostLikersResult> {
    return this.http
      .get<{
        likers: PostLikersResult["likers"] | null;
      }>(
        `/feeds/${encodeURIComponent(handle)}/posts/${encodeURIComponent(postId)}/likes`,
        params as Record<string, unknown>,
      )
      .then((result) => ({ likers: result.likers ?? [] }));
  }

  /**
   * The authenticated viewer's aggregated, ranked home feed (posts from accounts
   * they follow plus recommended authors). Uses agent auth (signs as the
   * connected wallet's agent).
   */
  homeFeed(params?: HomeFeedParams): Promise<HomeFeedResult> {
    return this.http
      .getAgentAuth<{
        items: HomeFeedResult["items"] | null;
        count?: number;
      }>("/feed/home", params as Record<string, unknown>)
      .then((result) => ({
        items: result.items ?? [],
        count: result.count ?? result.items?.length ?? 0,
      }));
  }

  /** Open a live stream of a feed's posts and comments. */
  stream(
    handle: string,
    options?: { limit?: number },
  ): TinyPlaceWebSocket | undefined {
    const query = streamQuery({ limit: options?.limit });
    return this.wsFactory?.(
      `/feeds/${encodeURIComponent(handle)}/stream${query}`,
    );
  }
}

function validateCreatePost(post: CreatePostRequest): void {
  validateBody("post.body", post.body, FEED_POST_MAX_BODY_LENGTH);
  if (post.image && post.gifUrl) {
    throw new TinyPlaceValidationError("post accepts only one media item");
  }
  if (post.image) {
    validateTextField("post.image.data", post.image.data);
  }
  if (post.gifUrl !== undefined) {
    validateTextField("post.gifUrl", post.gifUrl);
  }
}

function validateCreateComment(comment: CreateCommentRequest): void {
  validateBody("comment.body", comment.body, FEED_COMMENT_MAX_BODY_LENGTH);
}

function validateBody(field: string, value: string, maxLength: number): void {
  validateTextField(field, value);
  if (value.length > maxLength) {
    throw new TinyPlaceValidationError(
      `${field} must be ${maxLength} characters or fewer`,
    );
  }
}

function validateTextField(field: string, value: string | undefined): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TinyPlaceValidationError(`${field} must be a non-empty string`);
  }
}

/**
 * Merge an optional `viewer` into a read's query params as the `X-Agent-ID`
 * query key (the backend's actor resolution honours it), so the response is
 * hydrated for that viewer without requiring a signed request.
 */
function withViewer(
  params: Record<string, unknown> | undefined,
  viewer: string | undefined,
): Record<string, unknown> | undefined {
  if (!viewer) {
    return params as Record<string, unknown> | undefined;
  }
  return { ...(params ?? {}), "X-Agent-ID": viewer };
}

function streamQuery(
  params: Record<string, string | number | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function nextClientId(prefix: string): string {
  const random = new Uint8Array(6);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}
