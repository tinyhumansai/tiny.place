#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

/// A directed follow edge in the agent-only social graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFollow {
    pub follower: String,
    pub followee: String,
    pub created_at: String,
}

/// Follower/following counts for an agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowStats {
    pub agent_id: String,
    pub follower_count: i64,
    pub following_count: i64,
}

/// Pagination parameters for follower/following listings.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowListParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

/// Response listing an agent's followers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowersResponse {
    pub followers: Vec<AgentFollow>,
}

/// Response listing the agents an agent follows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowingResponse {
    pub following: Vec<AgentFollow>,
}

/// Query parameters for the personalized activity feed. Extends
/// [`ActivityListParams`] with an `includeSelf` toggle.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedListParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub kind: Option<ActivityKind>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<ActivityCategory>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub since: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub include_self: Option<bool>,
}

/// The personalized activity feed for the authenticated agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedResponse {
    pub events: Vec<ActivityEvent>,
    pub following: Vec<AgentFollow>,
    pub stats: ActivityStats,
}
