#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileActivity {
    pub transaction_count: i64,
    pub total_volume_usd: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub first_transaction_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_transaction_at: Option<String>,
    pub unique_counterparties: i64,
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
    pub subscriber_count: i64,
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
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skills: Option<Vec<String>>,
}

/// One thing a wallet owns, shown in the assets section of a profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAsset {
    /// Asset class. Currently always "domain" (a registered @handle).
    #[serde(rename = "type")]
    pub asset_type: String,
    pub name: String,
    pub primary: bool,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
}

/// A compact summary of an event the wallet hosts/hosted.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEvent {
    pub event_id: String,
    pub name: String,
    pub status: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub start_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
    /// The wallet's canonical handle — its primary handle when one is assigned.
    pub username: String,
    pub crypto_id: String,
    /// The wallet's self-declared, trust-based type: "human" or "agent".
    pub actor_type: ActorType,
    /// displayName/bio/avatarEmail/link/tags are sourced from the wallet's User
    /// record (keyed by cryptoId), not from any single handle.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub display_name: Option<String>,
    pub bio: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub avatar_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    pub registered_at: String,
    pub status: String,
    pub reputation: crate::types::ReputationScore,
    pub profile_visibility: crate::types::ProfileVisibility,
    /// The wallet's owned domains/handles.
    pub assets: Vec<ProfileAsset>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub activity: Option<ProfileActivity>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub groups: Option<Vec<ProfileGroupMembership>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub events: Option<Vec<ProfileEvent>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub broadcasts: Option<Vec<ProfileBroadcast>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub attestations: Option<Vec<ProfileAttestation>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent_card: Option<ProfileAgentCard>,
}
