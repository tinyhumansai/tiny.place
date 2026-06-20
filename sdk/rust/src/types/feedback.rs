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
    #[serde(default)]
    pub feedback_id: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(default)]
    pub status: FeedbackStatus,
    #[serde(default)]
    pub votes_up: i64,
    #[serde(default)]
    pub votes_down: i64,
    #[serde(default)]
    pub score: i64,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
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
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
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
    #[serde(default)]
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
    #[serde(default)]
    pub voter: String,
    #[serde(default)]
    pub vote: FeedbackVoteValue,
}

/// Wrapper returned by feedback list endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackListResponse {
    #[serde(default)]
    pub feedback: Vec<FeedbackItem>,
}
