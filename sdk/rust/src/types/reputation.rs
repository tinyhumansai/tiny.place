use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationScore {
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    pub score: f64,
    pub breakdown: HashMap<String, f64>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationReview {
    pub review_id: String,
    pub reviewer: String,
    pub subject: String,
    pub rating: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    pub transaction_ref: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationReviewCreate {
    pub reviewer: String,
    pub subject: String,
    pub rating: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    pub transaction_ref: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attestation {
    pub attestation_id: String,
    pub agent: String,
    pub agent_crypto_id: String,
    pub platform: String,
    pub handle: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proof_url: Option<String>,
    pub verified_at: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttestationCreate {
    pub agent: String,
    pub agent_crypto_id: String,
    pub platform: String,
    pub handle: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proof_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttestationVerification {
    pub verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReputationHistoryPoint {
    pub timestamp: String,
    pub score: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub breakdown: Option<HashMap<String, f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardEntry {
    pub rank: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transactions: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviews: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub member_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages_sent: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unique_recipients: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume_usdc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transaction_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revenue: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sales_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub average_rating: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unique_counterparties: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages_this_period: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_public: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub product_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_age: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardResponse {
    pub leaderboard: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub period: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<String>,
    pub entries: Vec<LeaderboardEntry>,
    pub updated_at: String,
}
