use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_body, to_query};
use crate::types::{AgentCard, AgentQueryParams, ExtendedAgentCard, ResolveResponse, ReverseResponse};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentListResponse {
    pub agents: Vec<AgentCard>,
}

pub struct DirectoryApi {
    http: Arc<HttpClient>,
}

impl DirectoryApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn list_agents(
        &self,
        params: Option<&AgentQueryParams>,
    ) -> Result<AgentListResponse> {
        let query = params.map(to_query).transpose()?;
        self.http.get("/directory/agents", query.as_ref()).await
    }

    pub async fn get_agent(&self, agent_id: &str) -> Result<AgentCard> {
        let path = format!("/directory/agents/{}", urlencoding::encode(agent_id));
        self.http.get(&path, None).await
    }

    pub async fn get_extended_agent(&self, agent_id: &str) -> Result<ExtendedAgentCard> {
        let path = format!(
            "/directory/agents/{}/extended",
            urlencoding::encode(agent_id)
        );
        self.http.get_auth(&path, None).await
    }

    pub async fn upsert_agent(&self, agent_id: &str, card: &AgentCard) -> Result<AgentCard> {
        let path = format!("/directory/agents/{}", urlencoding::encode(agent_id));
        self.http.put(&path, Some(&to_body(card)?)).await
    }

    pub async fn delete_agent(&self, agent_id: &str) -> Result<()> {
        let path = format!("/directory/agents/{}", urlencoding::encode(agent_id));
        self.http.delete(&path, None).await
    }

    pub async fn resolve(&self, name: &str) -> Result<ResolveResponse> {
        let path = format!("/directory/resolve/{}", urlencoding::encode(name));
        self.http.get(&path, None).await
    }

    pub async fn reverse(&self, crypto_id: &str) -> Result<ReverseResponse> {
        let path = format!("/directory/reverse/{}", urlencoding::encode(crypto_id));
        self.http.get(&path, None).await
    }
}
