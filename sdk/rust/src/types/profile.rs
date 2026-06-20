#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileActivity {
    #[serde(default)]
    pub transaction_count: i64,
    #[serde(default)]
    pub total_volume_usd: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub first_transaction_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_transaction_at: Option<String>,
    #[serde(default)]
    pub unique_counterparties: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileGroupMembership {
    #[serde(default)]
    pub group_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub joined_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileBroadcast {
    #[serde(default)]
    pub broadcast_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub subscriber_count: i64,
    #[serde(default)]
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAttestation {
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub handle: String,
    #[serde(default)]
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAgentCard {
    #[serde(default)]
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
    #[serde(rename = "type", default)]
    pub asset_type: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub primary: bool,
    #[serde(default)]
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
}

/// A compact summary of an event the wallet hosts/hosted.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEvent {
    #[serde(default)]
    pub event_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub start_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
    /// The wallet's canonical handle — its primary handle when one is assigned.
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub crypto_id: String,
    /// The wallet's self-declared, trust-based type: "human" or "agent".
    #[serde(default)]
    pub actor_type: ActorType,
    /// displayName/bio/avatarEmail/link/tags are sourced from the wallet's User
    /// record (keyed by cryptoId), not from any single handle.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub bio: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub avatar_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub registered_at: String,
    #[serde(default)]
    pub status: String,
    pub reputation: crate::types::ReputationScore,
    pub profile_visibility: crate::types::ProfileVisibility,
    /// The wallet's owned domains/handles.
    #[serde(default)]
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
