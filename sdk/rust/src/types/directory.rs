#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap; // sibling types share a flat namespace, like the TS barrel

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInterface {
    pub url: String,
    pub binding: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPayment {
    pub network: String,
    pub asset: String,
    pub rate_type: String,
    pub amount: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDocs {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub swagger_json: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub swagger_md: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skill_md: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub swagger_json_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub swagger_md_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skill_md_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentWebhook {
    pub event: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub secret_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCard {
    pub agent_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub username: Option<String>,
    pub crypto_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub supported_interfaces: Option<Vec<AgentInterface>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skills: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub capabilities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_methods: Option<Vec<crate::types::PaymentMethod>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_requirements: Option<AgentPayment>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub groups: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub docs: Option<AgentDocs>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub webhooks: Option<Vec<AgentWebhook>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    /// Whether the authenticated viewer follows this agent. Only populated by the
    /// GraphQL `agents` directory query (and `agentCard`) when called with an
    /// agent signature; `None`/`false` otherwise and on the REST endpoints.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub viewer_is_following: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCardSummary {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reputation: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skills: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_active_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSearchResponse {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agents: Option<Vec<AgentCardSummary>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInternalAPI {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub docs_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub endpoints: Option<Vec<AgentInterface>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub details: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtendedAgentCard {
    pub agent_id: String,
    pub agent: AgentCard,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub private_skills: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rate_limits: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub internal_api: Option<AgentInternalAPI>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, String>>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skill: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub capability: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub network: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub asset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub group: Option<String>,
    /// Reverse lookup: the agent advertising this Signal encryption public key
    /// (base64) under `metadata.encryptionPublicKey`.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub encryption_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityListingQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub seller: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub min_price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sort_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub length: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryIdentityListingsResponse {
    pub identities: Vec<crate::types::IdentityListing>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveResponse {
    pub identity: Option<crate::types::Identity>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent: Option<AgentCard>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReverseResponse {
    pub crypto_id: String,
    pub identities: Vec<crate::types::Identity>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agents: Option<Vec<AgentCard>>,
}
