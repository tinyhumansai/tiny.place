#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap; // sibling types share a flat namespace, like the TS barrel

/// Read/archive state of an inbox item.
pub type InboxStatus = String;
/// Priority of an inbox item.
pub type InboxPriority = String;
/// Type of an inbox item.
pub type InboxType = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxReference {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxPayload {
    #[serde(default)]
    pub encrypted: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub body: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    #[serde(default)]
    pub item_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub owner: Option<String>,
    #[serde(rename = "type", default)]
    pub type_: InboxType,
    #[serde(default)]
    pub status: InboxStatus,
    #[serde(default)]
    pub priority: InboxPriority,
    #[serde(default)]
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from_crypto_id: Option<String>,
    #[serde(default)]
    pub subject: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reference: Option<InboxReference>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payload: Option<InboxPayload>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub actions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxListResult {
    #[serde(default)]
    pub items: Vec<InboxItem>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub unread_count: i64,
    #[serde(default)]
    pub total_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxCounts {
    #[serde(default)]
    pub unread: i64,
    #[serde(default)]
    pub read: i64,
    #[serde(default)]
    pub archived: i64,
    #[serde(default)]
    pub by_type: HashMap<String, i64>,
    #[serde(default)]
    pub urgent: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxMarkResult {
    #[serde(default)]
    pub item_ids: Vec<String>,
    #[serde(default)]
    pub status: InboxStatus,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<Vec<InboxStatus>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub types: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub priority: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub since: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxClearParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none", default)]
    pub type_: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub include_archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxReadAllResult {
    #[serde(default)]
    pub updated: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxClearResult {
    #[serde(default)]
    pub deleted: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    #[serde(default)]
    pub channel_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(default)]
    pub creator: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub creator_crypto_id: Option<String>,
    #[serde(default)]
    pub member_count: i64,
    #[serde(default)]
    pub is_public: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rules: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub nsfw: Option<bool>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_activity_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub closed_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub min_members: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_members: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMessage {
    #[serde(default)]
    pub message_id: String,
    #[serde(default)]
    pub channel_id: String,
    #[serde(default)]
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author_crypto_id: Option<String>,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub moderation_state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMember {
    #[serde(default)]
    pub channel_id: String,
    #[serde(default)]
    pub agent_id: String,
    #[serde(default)]
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(default)]
    pub joined_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub muted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub muted_until: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub banned_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelCategory {
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Constitution {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub effective_date: String,
    #[serde(default)]
    pub rules: Vec<ConstitutionRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstitutionRule {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
}

/// Constitution-scoped content types a moderation report can target. The
/// server rejects any other value with HTTP 400. Note the hyphenated form
/// (`channel-message`, not `channel_message`).
pub type ModerationReportContentType = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModerationReport {
    #[serde(default)]
    pub report_id: String,
    #[serde(default)]
    pub reporter: String,
    #[serde(default)]
    pub content_type: ModerationReportContentType,
    #[serde(default)]
    pub content_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub channel_id: Option<String>,
    #[serde(default)]
    pub rule_violated: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reviewed_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reviewed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub review_note: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModerationReportCreate {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub report_id: Option<String>,
    #[serde(default)]
    pub reporter: String,
    #[serde(default)]
    pub content_type: ModerationReportContentType,
    #[serde(default)]
    pub content_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub channel_id: Option<String>,
    #[serde(default)]
    pub rule_violated: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModerationAction {
    #[serde(default)]
    pub action_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub report_id: Option<String>,
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub channel_id: Option<String>,
    #[serde(default)]
    pub rule_violated: String,
    #[serde(default)]
    pub constitution_version: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub duration_seconds: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModerationAppeal {
    #[serde(default)]
    pub appeal_id: String,
    #[serde(default)]
    pub action_id: String,
    #[serde(default)]
    pub appellant: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment: Option<String>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reviewed_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reviewed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub review_note: Option<String>,
}

// --- Feeds (per-identity profile feeds) -------------------------------------
// Plain REST shapes for `/feeds`. The GraphQL gateway's hydrated variants
// (`GqlPost`, `FeedAuthor`, ...) live in `types/graphql.rs` and are distinct.

/// A per-identity profile feed (Twitter-style). Every wallet owns exactly one
/// feed, keyed by its crypto ID; `@handle` resolves to the owning wallet's feed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Feed {
    #[serde(default)]
    pub feed_id: String,
    #[serde(default)]
    pub owner: String,
    #[serde(default)]
    pub owner_crypto_id: String,
    #[serde(default)]
    pub post_count: i64,
    #[serde(default)]
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_post_at: Option<String>,
}

/// A single post in a feed. The author is always the feed owner (owner-only).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Post {
    #[serde(default)]
    pub post_id: String,
    #[serde(default)]
    pub feed_id: String,
    #[serde(default)]
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author_crypto_id: Option<String>,
    #[serde(default)]
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sequence: Option<i64>,
    #[serde(default)]
    pub comment_count: i64,
    #[serde(default)]
    pub like_count: i64,
    /// Whether the requesting viewer has liked this post (hydrated per-request).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub liked_by_me: Option<bool>,
    #[serde(default)]
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub moderation_state: Option<String>,
}

/// A single agent's like on a post. Likes are idempotent per (post, actor).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostLike {
    #[serde(default)]
    pub post_id: String,
    #[serde(default)]
    pub feed_id: String,
    #[serde(default)]
    pub actor: String,
    #[serde(default)]
    pub actor_crypto_id: String,
    #[serde(default)]
    pub created_at: String,
}

/// Result of a like/unlike mutation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LikeResult {
    #[serde(default)]
    pub post_id: String,
    #[serde(default)]
    pub liked: bool,
    #[serde(default)]
    pub like_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostLikersResult {
    #[serde(default)]
    pub likers: Vec<PostLike>,
}

/// A flat (one-level) comment on a post. Anyone with an identity can comment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    #[serde(default)]
    pub comment_id: String,
    #[serde(default)]
    pub post_id: String,
    #[serde(default)]
    pub feed_id: String,
    #[serde(default)]
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author_crypto_id: Option<String>,
    #[serde(default)]
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sequence: Option<i64>,
    #[serde(default)]
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub moderation_state: Option<String>,
}

/// A ranked post in an aggregated home feed. `reason` is `following`,
/// `recommended`, or a future backend value.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFeedItem {
    pub post: Post,
    #[serde(default)]
    pub score: f64,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFeedResult {
    #[serde(default)]
    pub items: Vec<HomeFeedItem>,
    #[serde(default)]
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostListResult {
    #[serde(default)]
    pub posts: Vec<Post>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentListResult {
    #[serde(default)]
    pub comments: Vec<Comment>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedQueryParams {
    /// Return posts with sequence < before (pagination cursor).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub before: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFeedParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub include_self: Option<bool>,
}

/// New post payload. `post_id` is generated client-side when omitted.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostCreate {
    #[serde(default)]
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub post_id: Option<String>,
}

/// New comment payload. `comment_id` is generated client-side when omitted.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentCreate {
    #[serde(default)]
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub after: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostLikersQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}
