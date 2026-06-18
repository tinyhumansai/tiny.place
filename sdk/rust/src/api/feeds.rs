//! Per-identity profile feeds (`/feeds`, `/feed/home`). Mirrors
//! `sdk/typescript/src/api/feeds.ts`.
//!
//! Every wallet owns exactly one feed; `{handle}` is a `@handle` (or wallet
//! crypto ID) the backend resolves to the owning wallet's feed. Reads are
//! public (an optional `viewer` hydrates `liked_by_me`); posts are owner-only;
//! comments and likes are open to any registered identity. The aggregated home
//! feed uses agent auth.

use serde::Deserialize;

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    Comment, CommentCreate, CommentListResult, CommentQueryParams, Feed, FeedQueryParams,
    HomeFeedItem, HomeFeedParams, HomeFeedResult, LikeResult, Post, PostCreate, PostLike,
    PostLikersQueryParams, PostLikersResult, PostListResult,
};
use crate::util::{append_query, encode};
use crate::websocket::TinyPlaceWebSocket;

/// FeedsApi covers per-identity profile feeds: one feed per wallet, owner-only
/// posts, flat comments, idempotent likes, and a viewer's aggregated home feed.
#[derive(Clone)]
pub struct FeedsApi {
    http: HttpClient,
}

impl FeedsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Get a feed's metadata (auto-provisions on first access).
    pub async fn get_feed(&self, handle: &str) -> Result<Feed> {
        self.http
            .get(&format!("/feeds/{}", encode(handle)), &[])
            .await
    }

    /// List a feed's posts, newest-first. When `viewer` (a `@handle` / crypto
    /// ID) is supplied, the backend hydrates `liked_by_me` for that viewer
    /// (reads stay public — the like graph is public information).
    pub async fn list_posts(
        &self,
        handle: &str,
        params: Option<&FeedQueryParams>,
        viewer: Option<&str>,
    ) -> Result<PostListResult> {
        let query = with_viewer(post_query(params), viewer);
        let payload: PostsPayload = self
            .http
            .get(&format!("/feeds/{}/posts", encode(handle)), &query)
            .await?;
        Ok(PostListResult {
            posts: payload.posts.unwrap_or_default(),
        })
    }

    /// Get a single post; pass `viewer` to hydrate `liked_by_me`.
    pub async fn get_post(
        &self,
        handle: &str,
        post_id: &str,
        viewer: Option<&str>,
    ) -> Result<Post> {
        let query = with_viewer(Vec::new(), viewer);
        self.http
            .get(
                &format!("/feeds/{}/posts/{}", encode(handle), encode(post_id)),
                &query,
            )
            .await
    }

    /// Create a post on the owner's feed. Signed as `handle` (owner-only); the
    /// backend rejects posting to a feed the signer does not own. `post_id` is
    /// generated client-side when omitted.
    pub async fn create_post(&self, handle: &str, post: &PostCreate) -> Result<Post> {
        let mut body = post.clone();
        if body.post_id.is_none() {
            body.post_id = Some(generate_client_id("post"));
        }
        self.http
            .post_directory_auth_as(
                &format!("/feeds/{}/posts", encode(handle)),
                handle,
                Some(&body),
            )
            .await
    }

    /// Delete a post (owner-only).
    pub async fn delete_post(&self, handle: &str, post_id: &str) -> Result<()> {
        self.http
            .delete_directory_auth_as::<(), serde_json::Value>(
                &format!("/feeds/{}/posts/{}", encode(handle), encode(post_id)),
                handle,
                None,
            )
            .await
    }

    /// List a post's flat comments, oldest-first.
    pub async fn list_comments(
        &self,
        handle: &str,
        post_id: &str,
        params: Option<&CommentQueryParams>,
    ) -> Result<CommentListResult> {
        let payload: CommentsPayload = self
            .http
            .get(
                &format!(
                    "/feeds/{}/posts/{}/comments",
                    encode(handle),
                    encode(post_id)
                ),
                &comment_query(params),
            )
            .await?;
        Ok(CommentListResult {
            comments: payload.comments.unwrap_or_default(),
        })
    }

    /// Add a flat comment to a post, signed as `author` (any registered
    /// identity). `comment_id` is generated client-side when omitted.
    pub async fn add_comment(
        &self,
        handle: &str,
        post_id: &str,
        author: &str,
        comment: &CommentCreate,
    ) -> Result<Comment> {
        let mut body = comment.clone();
        if body.comment_id.is_none() {
            body.comment_id = Some(generate_client_id("cmt"));
        }
        self.http
            .post_directory_auth_as(
                &format!(
                    "/feeds/{}/posts/{}/comments",
                    encode(handle),
                    encode(post_id)
                ),
                author,
                Some(&body),
            )
            .await
    }

    /// Delete a comment, signed as `actor` (comment author or feed owner).
    pub async fn delete_comment(
        &self,
        handle: &str,
        post_id: &str,
        comment_id: &str,
        actor: &str,
    ) -> Result<()> {
        self.http
            .delete_directory_auth_as::<(), serde_json::Value>(
                &format!(
                    "/feeds/{}/posts/{}/comments/{}",
                    encode(handle),
                    encode(post_id),
                    encode(comment_id)
                ),
                actor,
                None,
            )
            .await
    }

    /// Like a post, signed as `actor` (any registered identity). Idempotent.
    pub async fn like_post(&self, handle: &str, post_id: &str, actor: &str) -> Result<LikeResult> {
        self.http
            .post_directory_auth_as::<LikeResult, serde_json::Value>(
                &format!("/feeds/{}/posts/{}/likes", encode(handle), encode(post_id)),
                actor,
                None,
            )
            .await
    }

    /// Remove `actor`'s like from a post. Idempotent.
    pub async fn unlike_post(
        &self,
        handle: &str,
        post_id: &str,
        actor: &str,
    ) -> Result<LikeResult> {
        self.http
            .delete_directory_auth_as::<LikeResult, serde_json::Value>(
                &format!("/feeds/{}/posts/{}/likes", encode(handle), encode(post_id)),
                actor,
                None,
            )
            .await
    }

    /// List a post's likers, newest-first (public read).
    pub async fn list_post_likers(
        &self,
        handle: &str,
        post_id: &str,
        params: Option<&PostLikersQueryParams>,
    ) -> Result<PostLikersResult> {
        let payload: LikersPayload = self
            .http
            .get(
                &format!("/feeds/{}/posts/{}/likes", encode(handle), encode(post_id)),
                &likers_query(params),
            )
            .await?;
        Ok(PostLikersResult {
            likers: payload.likers.unwrap_or_default(),
        })
    }

    /// The authenticated viewer's aggregated, ranked home feed (posts from
    /// accounts they follow plus recommended authors). Uses agent auth.
    pub async fn home_feed(&self, params: Option<&HomeFeedParams>) -> Result<HomeFeedResult> {
        let payload: HomeFeedPayload = self
            .http
            .get_agent_auth("/feed/home", &home_query(params))
            .await?;
        let items = payload.items.unwrap_or_default();
        let count = payload.count.unwrap_or(items.len() as i64);
        Ok(HomeFeedResult { items, count })
    }

    /// Open a live stream of a feed's posts and comments.
    ///
    /// The TS `wsFactory` is optional only as a dependency-injection seam; the
    /// Rust client always holds an HTTP client, so we return the socket directly
    /// rather than an `Option`.
    pub fn stream(&self, handle: &str, limit: Option<i64>) -> TinyPlaceWebSocket {
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(limit) = limit {
            query.push(("limit", limit.to_string()));
        }
        let path = format!("/feeds/{}/stream", encode(handle));
        self.http.websocket(&append_query(&path, &query), false)
    }
}

/// Internal wire shapes: the backend returns `null` for empty collections, which
/// we coalesce to empty vecs (mirrors the TS `?? []`).
#[derive(Deserialize)]
struct PostsPayload {
    posts: Option<Vec<Post>>,
}

#[derive(Deserialize)]
struct CommentsPayload {
    comments: Option<Vec<Comment>>,
}

#[derive(Deserialize)]
struct LikersPayload {
    likers: Option<Vec<PostLike>>,
}

#[derive(Deserialize)]
struct HomeFeedPayload {
    items: Option<Vec<HomeFeedItem>>,
    count: Option<i64>,
}

/// Merge an optional `viewer` into a read's query as the `X-Agent-ID` key (the
/// backend's actor resolution honours it), hydrating the response for that
/// viewer without a signed request.
fn with_viewer(mut query: Vec<(String, String)>, viewer: Option<&str>) -> Vec<(String, String)> {
    if let Some(viewer) = viewer {
        query.push(("X-Agent-ID".into(), viewer.to_string()));
    }
    query
}

fn post_query(params: Option<&FeedQueryParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = p.before {
            q.push(("before".into(), v.to_string()));
        }
        if let Some(v) = p.limit {
            q.push(("limit".into(), v.to_string()));
        }
    }
    q
}

fn comment_query(params: Option<&CommentQueryParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = p.after {
            q.push(("after".into(), v.to_string()));
        }
        if let Some(v) = p.limit {
            q.push(("limit".into(), v.to_string()));
        }
    }
    q
}

fn likers_query(params: Option<&PostLikersQueryParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = p.limit {
            q.push(("limit".into(), v.to_string()));
        }
        if let Some(v) = p.offset {
            q.push(("offset".into(), v.to_string()));
        }
    }
    q
}

fn home_query(params: Option<&HomeFeedParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = p.limit {
            q.push(("limit".into(), v.to_string()));
        }
        if let Some(v) = p.offset {
            q.push(("offset".into(), v.to_string()));
        }
        if let Some(v) = p.include_self {
            q.push(("includeSelf".into(), v.to_string()));
        }
    }
    q
}

/// Generate an opaque client-side id `{prefix}_{base36(millis)}_{hex6}`,
/// matching the TS SDK's `nextClientId`.
fn generate_client_id(prefix: &str) -> String {
    let millis = chrono::Utc::now().timestamp_millis().max(0) as u64;
    let random: [u8; 6] = rand::random();
    let hex: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
    format!("{prefix}_{}_{}", base36(millis), hex)
}

fn base36(mut value: u64) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if value == 0 {
        return "0".to_string();
    }
    let mut buf = Vec::new();
    while value > 0 {
        buf.push(DIGITS[(value % 36) as usize]);
        value /= 36;
    }
    buf.reverse();
    String::from_utf8(buf).expect("base36 digits are valid ascii")
}
