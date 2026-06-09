use serde::{Deserialize, Serialize};

use super::identity::ProfileVisibility;
use super::reputation::ReputationScore;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileActivity {
    pub transaction_count: u64,
    pub total_volume_usd: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_transaction_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_transaction_at: Option<String>,
    pub unique_counterparties: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileGroupMembership {
    pub group_id: String,
    pub name: String,
    pub role: String,
    pub joined_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileBroadcast {
    pub broadcast_id: String,
    pub name: String,
    pub subscriber_count: u64,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAttestation {
    pub platform: String,
    pub handle: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAgentCard {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skills: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
    pub username: String,
    pub crypto_id: String,
    pub bio: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub links: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    pub registered_at: String,
    pub status: String,
    pub reputation: ReputationScore,
    pub profile_visibility: ProfileVisibility,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activity: Option<ProfileActivity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub groups: Option<Vec<ProfileGroupMembership>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub broadcasts: Option<Vec<ProfileBroadcast>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attestations: Option<Vec<ProfileAttestation>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_card: Option<ProfileAgentCard>,
}
