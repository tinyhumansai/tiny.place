use std::collections::HashMap;

#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationScore {
    #[serde(default)]
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub username: Option<String>,
    #[serde(default)]
    pub score: f64,
    #[serde(default)]
    pub breakdown: HashMap<String, f64>,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationReview {
    #[serde(default)]
    pub review_id: String,
    #[serde(default)]
    pub reviewer: String,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub rating: f64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub context: Option<String>,
    #[serde(default)]
    pub transaction_ref: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationReviewCreate {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub review_id: Option<String>,
    #[serde(default)]
    pub reviewer: String,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub rating: f64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub context: Option<String>,
    #[serde(default)]
    pub transaction_ref: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    /// The base64 Ed25519 key that signed this request, i.e. the reviewer's
    /// registered key.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signer_public_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationVouch {
    #[serde(default)]
    pub vouch_id: String,
    #[serde(default)]
    pub voucher: String,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub weight: f64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub context: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment: Option<String>,
    #[serde(default)]
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub revoked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationVouchCreate {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub vouch_id: Option<String>,
    #[serde(default)]
    pub voucher: String,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub weight: f64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub context: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    /// Base64 Ed25519 signer key for the voucher.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signer_public_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attestation {
    #[serde(default)]
    pub attestation_id: String,
    #[serde(default)]
    pub agent: String,
    #[serde(default)]
    pub agent_crypto_id: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub handle: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub proof_url: Option<String>,
    #[serde(default)]
    pub verified_at: String,
    #[serde(default)]
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttestationCreate {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub attestation_id: Option<String>,
    #[serde(default)]
    pub agent: String,
    #[serde(default)]
    pub agent_crypto_id: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub handle: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub proof_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    /// Base64 Ed25519 signer key for the agent.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signer_public_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttestationVerification {
    #[serde(default)]
    pub verified: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub verified_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationHistoryPoint {
    #[serde(default)]
    pub timestamp: String,
    #[serde(default)]
    pub score: f64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub breakdown: Option<HashMap<String, f64>>,
}

/// One agent whose vouch contributes to a subject's recursive trust score.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustContributor {
    #[serde(default)]
    pub agent_id: String,
    #[serde(default)]
    pub weight: f64,
    #[serde(default)]
    pub contribution: f64,
}

/// The recursive-trust view returned for a single agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustScore {
    #[serde(default)]
    pub agent_id: String,
    #[serde(default)]
    pub trust: f64,
    #[serde(default)]
    pub contributors: Vec<TrustContributor>,
    #[serde(default)]
    pub updated_at: String,
}

/// A node in the vouch/trust graph: one agent with its reputation and trust.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustGraphNode {
    #[serde(default)]
    pub agent_id: String,
    #[serde(default)]
    pub score: f64,
    #[serde(default)]
    pub trust: f64,
}

/// A directed, weighted vouch edge (voucher → subject) in the trust graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustGraphEdge {
    #[serde(default)]
    pub vouch_id: String,
    #[serde(default)]
    pub from: String,
    #[serde(default)]
    pub to: String,
    #[serde(default)]
    pub weight: f64,
}

/// A visualization-friendly snapshot of the active vouch (referral) graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustGraph {
    #[serde(default)]
    pub nodes: Vec<TrustGraphNode>,
    #[serde(default)]
    pub edges: Vec<TrustGraphEdge>,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustGraphQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardEntry {
    #[serde(default)]
    pub rank: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub transactions: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reviews: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub member_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub messages_sent: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub unique_recipients: Option<i64>,
    #[serde(
        rename = "volumeUSDC",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub volume_usdc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub transaction_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub revenue: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sales_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub average_rating: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub current_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub previous_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub delta: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub unique_counterparties: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub messages_this_period: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub is_public: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub product_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub account_age: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub winnings: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub win_rate: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub roi: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub hands_played: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardResponse {
    #[serde(default)]
    pub leaderboard: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub period: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sort: Option<String>,
    #[serde(default)]
    pub entries: Vec<LeaderboardEntry>,
    #[serde(default)]
    pub updated_at: String,
}

pub type LeaderboardPeriod = String;
pub type LeaderboardCategory = String;
pub type GroupLeaderboardSort = String;
pub type SellerLeaderboardSort = String;
pub type GameLeaderboardSort = String;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub period: Option<LeaderboardPeriod>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationLeaderboardQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub period: Option<LeaderboardPeriod>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupLeaderboardQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub period: Option<LeaderboardPeriod>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sort: Option<GroupLeaderboardSort>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SellerLeaderboardQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub period: Option<LeaderboardPeriod>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sort: Option<SellerLeaderboardSort>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLeaderboardQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub period: Option<LeaderboardPeriod>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sort: Option<GameLeaderboardSort>,
}
