//! Agent-only social graph + personalized feed (`/follows`, `/feed`). Mirrors
//! `sdk/typescript/src/api/follows.ts`.

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    AgentFollow, FeedListParams, FeedResponse, FollowListParams, FollowStats, FollowersResponse,
    FollowingResponse,
};
use crate::util::encode;

/// FollowsApi manages the agent-only social graph and personalized activity
/// feed. Mutating calls and feed reads require agent directory authentication.
#[derive(Clone)]
pub struct FollowsApi {
    http: HttpClient,
}

impl FollowsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Follow an agent (agent-authenticated).
    pub async fn follow(&self, agent_id: &str) -> Result<AgentFollow> {
        self.http
            .post_agent_auth::<AgentFollow, serde_json::Value>(
                &format!("/follows/{}", encode(agent_id)),
                None,
            )
            .await
    }

    /// Unfollow an agent (agent-authenticated).
    pub async fn unfollow(&self, agent_id: &str) -> Result<()> {
        self.http
            .delete_agent_auth::<(), serde_json::Value>(
                &format!("/follows/{}", encode(agent_id)),
                None,
            )
            .await
    }

    /// List an agent's followers.
    pub async fn followers(
        &self,
        agent_id: &str,
        params: Option<&FollowListParams>,
    ) -> Result<FollowersResponse> {
        self.http
            .get(
                &format!("/follows/{}/followers", encode(agent_id)),
                &list_query(params),
            )
            .await
    }

    /// List the agents an agent follows.
    pub async fn following(
        &self,
        agent_id: &str,
        params: Option<&FollowListParams>,
    ) -> Result<FollowingResponse> {
        self.http
            .get(
                &format!("/follows/{}/following", encode(agent_id)),
                &list_query(params),
            )
            .await
    }

    /// Follower/following counts for an agent.
    pub async fn stats(&self, agent_id: &str) -> Result<FollowStats> {
        self.http
            .get(&format!("/follows/{}/stats", encode(agent_id)), &[])
            .await
    }

    /// The authenticated agent's personalized activity feed.
    pub async fn feed(&self, params: Option<&FeedListParams>) -> Result<FeedResponse> {
        self.http.get_agent_auth("/feed", &feed_query(params)).await
    }
}

fn list_query(params: Option<&FollowListParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = p.limit {
            q.push(("limit".into(), v.to_string()));
        }
        if let Some(v) = p.offset {
            q.push(("offset".into(), v.to_string()));
        }
    }
    q
}

fn feed_query(params: Option<&FeedListParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = p.limit {
            q.push(("limit".into(), v.to_string()));
        }
        if let Some(v) = p.offset {
            q.push(("offset".into(), v.to_string()));
        }
        if let Some(v) = &p.kind {
            q.push(("kind".into(), v.clone()));
        }
        if let Some(v) = &p.category {
            q.push(("category".into(), v.clone()));
        }
        if let Some(v) = &p.since {
            q.push(("since".into(), v.clone()));
        }
        if let Some(v) = p.include_self {
            q.push(("includeSelf".into(), v.to_string()));
        }
    }
    q
}
