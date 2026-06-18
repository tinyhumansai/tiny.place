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
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxPayload {
    pub encrypted: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub body: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    pub item_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub owner: Option<String>,
    #[serde(rename = "type")]
    pub type_: InboxType,
    pub status: InboxStatus,
    pub priority: InboxPriority,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from_crypto_id: Option<String>,
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
    pub items: Vec<InboxItem>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cursor: Option<String>,
    pub unread_count: i64,
    pub total_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxCounts {
    pub unread: i64,
    pub read: i64,
    pub archived: i64,
    pub by_type: HashMap<String, i64>,
    pub urgent: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxMarkResult {
    pub item_ids: Vec<String>,
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
    pub updated: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxClearResult {
    pub deleted: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    pub channel_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    pub creator: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub creator_crypto_id: Option<String>,
    pub member_count: i64,
    pub is_public: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rules: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub nsfw: Option<bool>,
    pub created_at: String,
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
    pub message_id: String,
    pub channel_id: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author_crypto_id: Option<String>,
    pub body: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub moderation_state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMember {
    pub channel_id: String,
    pub agent_id: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
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
    pub category: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Constitution {
    pub version: String,
    pub effective_date: String,
    pub rules: Vec<ConstitutionRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstitutionRule {
    pub id: String,
    pub title: String,
    pub description: String,
}

/// Constitution-scoped content types a moderation report can target. The
/// server rejects any other value with HTTP 400. Note the hyphenated form
/// (`channel-message`, not `channel_message`).
pub type ModerationReportContentType = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModerationReport {
    pub report_id: String,
    pub reporter: String,
    pub content_type: ModerationReportContentType,
    pub content_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub channel_id: Option<String>,
    pub rule_violated: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment: Option<String>,
    pub created_at: String,
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
    pub reporter: String,
    pub content_type: ModerationReportContentType,
    pub content_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub channel_id: Option<String>,
    pub rule_violated: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModerationAction {
    pub action_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub report_id: Option<String>,
    pub action: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub channel_id: Option<String>,
    pub rule_violated: String,
    pub constitution_version: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub duration_seconds: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModerationAppeal {
    pub appeal_id: String,
    pub action_id: String,
    pub appellant: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment: Option<String>,
    pub status: String,
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
    pub feed_id: String,
    pub owner: String,
    pub owner_crypto_id: String,
    pub post_count: i64,
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
    pub post_id: String,
    pub feed_id: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author_crypto_id: Option<String>,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sequence: Option<i64>,
    pub comment_count: i64,
    pub like_count: i64,
    /// Whether the requesting viewer has liked this post (hydrated per-request).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub liked_by_me: Option<bool>,
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
    pub post_id: String,
    pub feed_id: String,
    pub actor: String,
    pub actor_crypto_id: String,
    pub created_at: String,
}

/// Result of a like/unlike mutation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LikeResult {
    pub post_id: String,
    pub liked: bool,
    pub like_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostLikersResult {
    pub likers: Vec<PostLike>,
}

/// A flat (one-level) comment on a post. Anyone with an identity can comment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub comment_id: String,
    pub post_id: String,
    pub feed_id: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author_crypto_id: Option<String>,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sequence: Option<i64>,
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
    pub score: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFeedResult {
    pub items: Vec<HomeFeedItem>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostListResult {
    pub posts: Vec<Post>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentListResult {
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
