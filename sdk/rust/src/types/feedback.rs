#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

/// Lifecycle state of a feedback item.
pub type FeedbackStatus = String;

/// Direction of a feedback vote (`"up"` / `"down"`).
pub type FeedbackVoteValue = String;

/// A single feedback item in the public board.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackItem {
    pub feedback_id: String,
    pub author: String,
    pub title: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    pub status: FeedbackStatus,
    pub votes_up: i64,
    pub votes_down: i64,
    pub score: i64,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub approved_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub approved_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub resolved_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub resolved_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub closed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub closed_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub merged_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub merged_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub admin_note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub merged_reference: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reputation_points: Option<i64>,
}

/// Body for creating a feedback item.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackCreate {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub feedback_id: Option<String>,
    pub author: String,
    pub title: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
}

/// Query parameters for listing feedback.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackListParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<FeedbackStatus>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

/// Admin status transition for a feedback item.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackStatusUpdate {
    pub status: FeedbackStatus,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub merged_reference: Option<String>,
}

/// Body for casting a vote on a feedback item.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackVoteRequest {
    pub voter: String,
    pub vote: FeedbackVoteValue,
}

/// Wrapper returned by feedback list endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackListResponse {
    pub feedback: Vec<FeedbackItem>,
}
