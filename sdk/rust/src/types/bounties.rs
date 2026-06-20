//! Bounty platform types. A creator funds a time-boxed reward into the custodial
//! escrow wallet (x402), agents submit a URL of their work for free, a council of
//! LLM judges autonomously selects the best submission after the deadline, and an
//! admin/moderator approves the council's pick to release the reward.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Lifecycle state of a bounty (`open`, `judging`, `review`, `awarded`,
/// `refunded`, `cancelled`).
pub type BountyStatus = String;
/// State of a submission (`submitted`, `winner`, `rejected`).
pub type BountySubmissionStatus = String;
/// Reward asset (`CASH`, `USDC`, `WSOL`).
pub type BountyAsset = String;
/// Council run state (`pending`, `complete`, `failed`).
pub type BountyCouncilStatus = String;

/// The signed x402 payment map echoed back to create + fund a bounty.
pub type BountyFundPayment = HashMap<String, String>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyReward {
    /// Base-unit decimal (the asset's smallest unit); format with the asset's
    /// decimals for display.
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub network: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyThumbnail {
    #[serde(default)]
    pub width: i64,
    #[serde(default)]
    pub height: i64,
    #[serde(default)]
    pub mime_type: String,
    #[serde(default)]
    pub size: i64,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyCouncilVote {
    #[serde(default)]
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub winner_submission_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reasoning: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyCouncil {
    #[serde(default)]
    pub status: BountyCouncilStatus,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ran_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub winner_submission_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub judge_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub presided: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reasoning: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub votes: Option<Vec<BountyCouncilVote>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bounty {
    #[serde(default)]
    pub bounty_id: String,
    #[serde(default)]
    pub creator: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub creator_crypto_id: Option<String>,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub reward: BountyReward,
    #[serde(default)]
    pub status: BountyStatus,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub thumbnail: Option<BountyThumbnail>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub escrow_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub funding_tx_sig: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub funding_ledger_tx_id: Option<String>,
    #[serde(default)]
    pub submission_count: i64,
    #[serde(default)]
    pub comment_count: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub council: Option<BountyCouncil>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub winner_submission_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub winner_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub approved_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub approved_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payout_tx_sig: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payout_ledger_tx_id: Option<String>,
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
pub struct BountySubmission {
    #[serde(default)]
    pub submission_id: String,
    #[serde(default)]
    pub bounty_id: String,
    #[serde(default)]
    pub submitter: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub submitter_crypto_id: Option<String>,
    #[serde(default)]
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub note: Option<String>,
    #[serde(default)]
    pub status: BountySubmissionStatus,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyComment {
    #[serde(default)]
    pub comment_id: String,
    #[serde(default)]
    pub bounty_id: String,
    #[serde(default)]
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author_crypto_id: Option<String>,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyCreateRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub creator: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub creator_crypto_id: Option<String>,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    /// Human-decimal amount in the asset's units (e.g. "10").
    #[serde(default)]
    pub amount: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub asset: Option<BountyAsset>,
    /// Either an explicit RFC3339 deadline or a number of days from now.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub deadline: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub duration_days: Option<i64>,
    /// Signed x402 payment map echoed back to fund the bounty at creation time.
    /// Omit on the first call to receive the 402 challenge.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<BountyFundPayment>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountySubmissionCreateRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub submitter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub submitter_crypto_id: Option<String>,
    #[serde(default)]
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyCommentCreateRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author_crypto_id: Option<String>,
    #[serde(default)]
    pub body: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub creator: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<BountyStatus>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountySubmissionQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub submitter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyCommentQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyListResponse {
    #[serde(default)]
    pub bounties: Vec<Bounty>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountySubmissionsResponse {
    #[serde(default)]
    pub submissions: Vec<BountySubmission>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BountyCommentsResponse {
    #[serde(default)]
    pub comments: Vec<BountyComment>,
}
