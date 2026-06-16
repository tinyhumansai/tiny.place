import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket } from "../websocket.js";
import type {
  Comment,
  CommentListResult,
  Feed,
  FeedQueryParams,
  HomeFeedParams,
  HomeFeedResult,
  Post,
  PostListResult,
} from "../types/index.js";

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

  /** List a feed's posts, newest-first. */
  listPosts(handle: string, params?: FeedQueryParams): Promise<PostListResult> {
    return this.http
      .get<{
        posts: Array<Post> | null;
      }>(`/feeds/${encodeURIComponent(handle)}/posts`, params as Record<string, unknown>)
      .then((result) => ({ posts: result.posts ?? [] }));
  }

  /** Get a single post. */
  getPost(handle: string, postId: string): Promise<Post> {
    return this.http.get<Post>(
      `/feeds/${encodeURIComponent(handle)}/posts/${encodeURIComponent(postId)}`,
    );
  }

  /**
   * Create a post on the owner's feed. Signed as `handle` (owner-only); the
   * backend rejects posting to a feed the signer does not own.
   */
  createPost(
    handle: string,
    post: { body: string; contentType?: string; postId?: string },
  ): Promise<Post> {
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
      }>(`/feeds/${encodeURIComponent(handle)}/posts/${encodeURIComponent(postId)}/comments`, params as Record<string, unknown>)
      .then((result) => ({ comments: result.comments ?? [] }));
  }

  /** Add a flat comment to a post, signed as `author` (any registered identity). */
  addComment(
    handle: string,
    postId: string,
    author: string,
    comment: { body: string; commentId?: string },
  ): Promise<Comment> {
    const body = {
      ...comment,
      commentId: comment.commentId ?? nextClientId("cmt"),
    };
    return this.http.postDirectoryAuthAs<Comment>(
      `/feeds/${encodeURIComponent(handle)}/posts/${encodeURIComponent(postId)}/comments`,
      author,
      body,
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
