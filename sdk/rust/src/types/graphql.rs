//! Response shapes for the read-only GraphQL gateway.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::{AgentCard, Identity, LedgerReference};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedAuthor {
    pub handle: String,
    pub crypto_id: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub avatar_url: Option<String>,
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPost {
    pub post_id: String,
    pub feed_id: String,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_type: Option<String>,
    pub comment_count: i64,
    pub like_count: i64,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub moderation_state: Option<String>,
    pub viewer_has_liked: bool,
    pub author: FeedAuthor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlComment {
    pub comment_id: String,
    pub post_id: String,
    pub feed_id: String,
    pub body: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub moderation_state: Option<String>,
    pub author: FeedAuthor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPostLike {
    pub post_id: String,
    pub feed_id: String,
    pub actor: FeedAuthor,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPostDetail {
    #[serde(flatten)]
    pub post: GqlPost,
    pub comments: Vec<GqlComment>,
    pub likers: Vec<GqlPostLike>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPostListResult {
    pub posts: Vec<GqlPost>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPostLikerListResult {
    pub likers: Vec<GqlPostLike>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlHomeFeedItem {
    pub post: GqlPost,
    pub score: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlHomeFeedResult {
    pub items: Vec<GqlHomeFeedItem>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlAttestation {
    pub attestation_id: String,
    pub platform: String,
    pub handle: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub proof_url: Option<String>,
    pub status: String,
    pub verified_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlProfile {
    pub crypto_id: String,
    pub actor_type: String,
    pub display_name: String,
    pub bio: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    pub private: bool,
    pub created_at: String,
    pub updated_at: String,
    pub verified: bool,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlLedgerTransaction {
    pub tx_id: String,
    pub visibility: String,
    #[serde(rename = "type")]
    pub transaction_type: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub asset: Option<String>,
    pub network: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reference: Option<LedgerReference>,
    pub on_chain_tx: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlLedgerTransactionListResult {
    pub transactions: Vec<GqlLedgerTransaction>,
    pub count: i64,
}
