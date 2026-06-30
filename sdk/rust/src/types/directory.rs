#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap; // sibling types share a flat namespace, like the TS barrel

// The backend normalizes an agent card's `skills` and `capabilities` to richer
// shapes on read: `skills` comes back as `[{"id":..,"name":..}]` (not a bare
// string array) and `capabilities` as `{"additional":[..]}`. The SDK exposes
// both as plain string lists (matching the write form and the TypeScript SDK),
// so these tolerant deserializers accept either shape and flatten to Vec<String>.

#[derive(Deserialize)]
#[serde(untagged)]
enum SkillEntry {
    Str(String),
    Named {
        #[serde(default)]
        name: Option<String>,
        #[serde(default)]
        id: Option<String>,
    },
}

fn deserialize_skill_list<'de, D>(deserializer: D) -> Result<Option<Vec<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    let entries: Option<Vec<SkillEntry>> = Option::deserialize(deserializer)?;
    Ok(entries.map(|list| {
        list.into_iter()
            .filter_map(|entry| match entry {
                SkillEntry::Str(s) => Some(s),
                SkillEntry::Named { name, id } => name.or(id),
            })
            .collect()
    }))
}

#[derive(Deserialize)]
#[serde(untagged)]
enum CapabilitiesField {
    List(Vec<String>),
    Object {
        #[serde(default)]
        additional: Vec<String>,
    },
}

fn deserialize_capabilities<'de, D>(deserializer: D) -> Result<Option<Vec<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    let value: Option<CapabilitiesField> = Option::deserialize(deserializer)?;
    Ok(value.map(|c| match c {
        CapabilitiesField::List(v) => v,
        CapabilitiesField::Object { additional } => additional,
    }))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInterface {
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub binding: String,
    #[serde(default)]
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPayment {
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub rate_type: String,
    #[serde(default)]
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
    #[serde(default)]
    pub event: String,
    #[serde(default)]
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
    #[serde(default)]
    pub agent_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub username: Option<String>,
    #[serde(default)]
    pub crypto_id: String,
    /// Human/agent discriminator, unified from the wallet's User profile.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub actor_type: Option<ActorType>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub supported_interfaces: Option<Vec<AgentInterface>>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        default,
        deserialize_with = "deserialize_skill_list"
    )]
    pub skills: Option<Vec<String>>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        default,
        deserialize_with = "deserialize_capabilities"
    )]
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
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
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
    #[serde(
        skip_serializing_if = "Option::is_none",
        default,
        deserialize_with = "deserialize_skill_list"
    )]
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
    #[serde(default)]
    pub agent_id: String,
    pub agent: AgentCard,
    #[serde(
        skip_serializing_if = "Option::is_none",
        default,
        deserialize_with = "deserialize_skill_list"
    )]
    pub private_skills: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rate_limits: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub internal_api: Option<AgentInternalAPI>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, String>>,
    #[serde(default)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveResponse {
    #[serde(default)]
    pub identity: Option<crate::types::Identity>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent: Option<AgentCard>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReverseResponse {
    #[serde(default)]
    pub crypto_id: String,
    #[serde(default)]
    pub identities: Vec<crate::types::Identity>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agents: Option<Vec<AgentCard>>,
}

#[cfg(test)]
mod skill_deser_tests {
    use super::*;

    // The v2 backend returns skills as [{id,name}] and capabilities as
    // {additional:[..]}; both must flatten to the SDK's Vec<String>.
    #[test]
    fn agent_card_accepts_object_skills_and_capabilities() {
        let json = r#"{
            "agentId":"a1","name":"n","cryptoId":"c1",
            "skills":[{"id":"summarize","name":"Summarize"},{"id":"code","name":"Code"}],
            "capabilities":{"additional":["fast","cheap"]},
            "createdAt":"t","updatedAt":"t"
        }"#;
        let card: AgentCard = serde_json::from_str(json).expect("object shape");
        assert_eq!(
            card.skills,
            Some(vec!["Summarize".to_string(), "Code".to_string()])
        );
        assert_eq!(
            card.capabilities,
            Some(vec!["fast".to_string(), "cheap".to_string()])
        );
    }

    // The legacy/write shape (plain string arrays) still deserializes.
    #[test]
    fn agent_card_accepts_string_skills_and_capabilities() {
        let json = r#"{
            "agentId":"a1","name":"n","cryptoId":"c1",
            "skills":["a","b"],"capabilities":["x"],
            "createdAt":"t","updatedAt":"t"
        }"#;
        let card: AgentCard = serde_json::from_str(json).expect("string shape");
        assert_eq!(card.skills, Some(vec!["a".to_string(), "b".to_string()]));
        assert_eq!(card.capabilities, Some(vec!["x".to_string()]));
    }
}
