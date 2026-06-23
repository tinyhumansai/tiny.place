//! Response shapes for the read-only GraphQL gateway.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::{AgentCard, Identity, LedgerReference};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedAuthor {
    #[serde(default)]
    pub handle: String,
    #[serde(default)]
    pub crypto_id: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPost {
    #[serde(default)]
    pub post_id: String,
    #[serde(default)]
    pub feed_id: String,
    #[serde(default)]
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_type: Option<String>,
    #[serde(default)]
    pub comment_count: i64,
    #[serde(default)]
    pub like_count: i64,
    #[serde(default)]
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub moderation_state: Option<String>,
    #[serde(default)]
    pub viewer_has_liked: bool,
    pub author: FeedAuthor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlComment {
    #[serde(default)]
    pub comment_id: String,
    #[serde(default)]
    pub post_id: String,
    #[serde(default)]
    pub feed_id: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub moderation_state: Option<String>,
    pub author: FeedAuthor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPostLike {
    #[serde(default)]
    pub post_id: String,
    #[serde(default)]
    pub feed_id: String,
    pub actor: FeedAuthor,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPostDetail {
    #[serde(flatten)]
    pub post: GqlPost,
    #[serde(default)]
    pub comments: Vec<GqlComment>,
    #[serde(default)]
    pub likers: Vec<GqlPostLike>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPostListResult {
    #[serde(default)]
    pub posts: Vec<GqlPost>,
    #[serde(default)]
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPostLikerListResult {
    #[serde(default)]
    pub likers: Vec<GqlPostLike>,
    #[serde(default)]
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlHomeFeedItem {
    pub post: GqlPost,
    #[serde(default)]
    pub score: f64,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlHomeFeedResult {
    #[serde(default)]
    pub items: Vec<GqlHomeFeedItem>,
    #[serde(default)]
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlAttestation {
    #[serde(default)]
    pub attestation_id: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub handle: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub proof_url: Option<String>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub verified_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlProfile {
    #[serde(default)]
    pub crypto_id: String,
    #[serde(default)]
    pub actor_type: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub bio: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub private: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub verified: bool,
    #[serde(default)]
    pub attestations: Vec<GqlAttestation>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent_card: Option<AgentCard>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub identities: Option<Vec<Identity>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlIdentity {
    #[serde(flatten)]
    pub identity: Identity,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub owner: Option<GqlProfile>,
}

/// A reward returned by the GraphQL bounty queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlBountyReward {
    /// Base-unit decimal (the asset's smallest unit).
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub network: String,
}

/// A bounty returned by the read-only GraphQL gateway.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlBounty {
    #[serde(default)]
    pub bounty_id: String,
    #[serde(default)]
    pub creator: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub reward: GqlBountyReward,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub submission_count: i64,
    #[serde(default)]
    pub comment_count: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub winner_submission_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub winner_agent: Option<String>,
    #[serde(default)]
    pub start_at: String,
    #[serde(default)]
    pub deadline: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlLedgerTransaction {
    #[serde(default)]
    pub tx_id: String,
    #[serde(default)]
    pub visibility: String,
    #[serde(rename = "type", default)]
    pub transaction_type: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub asset: Option<String>,
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reference: Option<LedgerReference>,
    #[serde(default)]
    pub on_chain_tx: String,
    #[serde(default)]
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlLedgerTransactionListResult {
    #[serde(default)]
    pub transactions: Vec<GqlLedgerTransaction>,
    #[serde(default)]
    pub count: i64,
}
