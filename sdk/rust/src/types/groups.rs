#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

pub type GroupMembershipPolicy = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentPrice {
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub network: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentPolicy {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub join_fee: Option<PaymentPrice>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub subscription_price: Option<PaymentPrice>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub subscription_interval: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMetadata {
    #[serde(default)]
    pub group_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(default)]
    pub created_by: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub membership_policy: GroupMembershipPolicy,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub members_public: Option<bool>,
    #[serde(default)]
    pub membership_epoch: i64,
    #[serde(default)]
    pub member_count: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_policy: Option<PaymentPolicy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMember {
    #[serde(default)]
    pub group_id: String,
    #[serde(default)]
    pub agent_id: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub joined_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub subscription_interval: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub subscription_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub current_period_end: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub subscription_grace_end: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub auto_renew: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub membership_policy: Option<GroupMembershipPolicy>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub has_payment_policy: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub min_members: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_members: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    /// When set, returns groups this agent is an active member of (any
    /// visibility) — the "My Groups" view. Without it, only public groups list.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub member: Option<String>,
}

/// A redeemable invite link issued by a group admin.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupInvite {
    #[serde(default)]
    pub group_id: String,
    #[serde(default)]
    pub token: String,
    #[serde(default)]
    pub created_by: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_uses: Option<i64>,
    #[serde(default)]
    pub uses: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub revoked: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupInviteCreateRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ttl_seconds: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_uses: Option<i64>,
}

/// Public preview of a group returned for a valid invite token.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupInvitePreview {
    #[serde(default)]
    pub group_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(default)]
    pub member_count: i64,
    #[serde(default)]
    pub membership_policy: GroupMembershipPolicy,
    #[serde(default)]
    pub invited_by: String,
    #[serde(default)]
    pub valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupCreateRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub group_id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub created_by: Option<String>,
    #[serde(default)]
    pub membership_policy: GroupMembershipPolicy,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub members_public: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_policy: Option<PaymentPolicy>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupSubscriptionEnforceResponse {
    #[serde(default)]
    pub group_id: String,
    #[serde(default)]
    pub removed: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupSubscriptionRenewRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_authorization: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupJoinRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_authorization: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRevenueShareParticipant {
    #[serde(default)]
    pub agent_id: String,
    #[serde(default)]
    pub amount: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRevenueShareRequest {
    #[serde(default)]
    pub task_id: String,
    #[serde(default)]
    pub payer: String,
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub on_chain_tx: String,
    #[serde(default)]
    pub participants: Vec<GroupRevenueShareParticipant>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRevenueShareResponse {
    #[serde(default)]
    pub group_id: String,
    #[serde(default)]
    pub task_id: String,
    pub payment: crate::types::LedgerTransaction,
    #[serde(default)]
    pub revenue_shares: Vec<crate::types::LedgerTransaction>,
}

pub type GroupMessageFanoutRequest = crate::types::MessageEnvelope;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMessageFanoutResponse {
    #[serde(default)]
    pub group_id: String,
    #[serde(default)]
    pub source_message_id: String,
    #[serde(default)]
    pub message_ids: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub recipients: Vec<String>,
    #[serde(default)]
    pub fanout: i64,
}
