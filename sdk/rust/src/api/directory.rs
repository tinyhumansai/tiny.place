//! DirectoryApi — the open directory of A2A Agent Cards plus name resolution.

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    AgentCard, AgentQueryParams, AgentSearchResponse, ExtendedAgentCard, ResolveResponse,
    ReverseResponse,
};
use crate::util::encode;
use crate::validation::{
    validate_agent_card, validate_agent_query_params, validate_extended_agent_card,
};

/// Response wrapper for [`DirectoryApi::list_agents`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAgentsResponse {
    pub agents: Vec<AgentCard>,
}

/// Query parameters for [`DirectoryApi::skills`].
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySkillsParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cursor: Option<String>,
}

#[derive(Clone)]
pub struct DirectoryApi {
    http: HttpClient,
}

impl DirectoryApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn list_agents(
        &self,
        params: Option<&AgentQueryParams>,
    ) -> Result<ListAgentsResponse> {
        validate_agent_query_params(params)?;
        let query = params.map(agent_query_to_query).unwrap_or_default();
        self.http.get("/directory/agents", &query).await
    }

    pub async fn get_agent(&self, agent_id: &str) -> Result<AgentCard> {
        self.http
            .get(&format!("/directory/agents/{}", encode(agent_id)), &[])
            .await
    }

    /// Reverse-resolves the agent advertising a given Signal encryption public
    /// key (base64). Returns `None` when no agent advertises it. The match is
    /// re-verified client-side, so this stays correct even against a backend
    /// that does not support the `encryptionKey` filter.
    pub async fn find_agent_by_encryption_key(
        &self,
        encryption_key: &str,
    ) -> Result<Option<AgentCard>> {
        let params = AgentQueryParams {
            encryption_key: Some(encryption_key.to_string()),
            limit: Some(1),
            ..Default::default()
        };
        let response = self.list_agents(Some(&params)).await?;
        Ok(response.agents.into_iter().find(|agent| {
            agent
                .metadata
                .as_ref()
                .and_then(|m| m.get("encryptionPublicKey"))
                .map(|k| k == encryption_key)
                .unwrap_or(false)
                || agent.public_key.as_deref() == Some(encryption_key)
        }))
    }

    pub async fn get_extended_agent(&self, agent_id: &str) -> Result<ExtendedAgentCard> {
        self.http
            .get_directory_auth(
                &format!("/directory/agents/{}/extended", encode(agent_id)),
                &[],
            )
            .await
    }

    pub async fn upsert_extended_agent(
        &self,
        agent_id: &str,
        card: &ExtendedAgentCard,
    ) -> Result<ExtendedAgentCard> {
        validate_extended_agent_card(card)?;
        self.http
            .put_directory_auth(
                &format!("/directory/agents/{}/extended", encode(agent_id)),
                Some(card),
            )
            .await
    }

    pub async fn upsert_agent(&self, agent_id: &str, card: &AgentCard) -> Result<AgentCard> {
        validate_agent_card(card)?;
        self.http
            .put_directory_auth(
                &format!("/directory/agents/{}", encode(agent_id)),
                Some(card),
            )
            .await
    }

    pub async fn delete_agent(&self, agent_id: &str) -> Result<()> {
        let _: serde_json::Value = self
            .http
            .delete_directory_auth(
                &format!("/directory/agents/{}", encode(agent_id)),
                None::<&serde_json::Value>,
            )
            .await?;
        Ok(())
    }

    pub async fn resolve(&self, name: &str) -> Result<ResolveResponse> {
        self.http
            .get(&format!("/directory/resolve/{}", encode(name)), &[])
            .await
    }

    pub async fn reverse(&self, crypto_id: &str) -> Result<ReverseResponse> {
        self.http
            .get(&format!("/directory/reverse/{}", encode(crypto_id)), &[])
            .await
    }

    pub async fn skills(
        &self,
        params: Option<&DirectorySkillsParams>,
    ) -> Result<AgentSearchResponse> {
        let mut query: Vec<(String, String)> = Vec::new();
        if let Some(p) = params {
            if let Some(q) = &p.q {
                query.push(("q".into(), q.clone()));
            }
            if let Some(limit) = p.limit {
                query.push(("limit".into(), limit.to_string()));
            }
            if let Some(cursor) = &p.cursor {
                query.push(("cursor".into(), cursor.clone()));
            }
        }
        self.http.get("/directory/skills", &query).await
    }
}

fn agent_query_to_query(params: &AgentQueryParams) -> Vec<(String, String)> {
    let mut query: Vec<(String, String)> = Vec::new();
    if let Some(v) = &params.q {
        query.push(("q".into(), v.clone()));
    }
    if let Some(v) = &params.skill {
        query.push(("skill".into(), v.clone()));
    }
    if let Some(v) = &params.capability {
        query.push(("capability".into(), v.clone()));
    }
    if let Some(v) = &params.tag {
        query.push(("tag".into(), v.clone()));
    }
    if let Some(tags) = &params.tags {
        for tag in tags {
            query.push(("tags".into(), tag.clone()));
        }
    }
    if let Some(v) = &params.username {
        query.push(("username".into(), v.clone()));
    }
    if let Some(v) = &params.crypto_id {
        query.push(("cryptoId".into(), v.clone()));
    }
    if let Some(v) = &params.network {
        query.push(("network".into(), v.clone()));
    }
    if let Some(v) = &params.asset {
        query.push(("asset".into(), v.clone()));
    }
    if let Some(v) = &params.max_amount {
        query.push(("maxAmount".into(), v.clone()));
    }
    if let Some(v) = &params.group {
        query.push(("group".into(), v.clone()));
    }
    if let Some(v) = &params.encryption_key {
        query.push(("encryptionKey".into(), v.clone()));
    }
    if let Some(v) = params.limit {
        query.push(("limit".into(), v.to_string()));
    }
    if let Some(v) = params.offset {
        query.push(("offset".into(), v.to_string()));
    }
    query
}
