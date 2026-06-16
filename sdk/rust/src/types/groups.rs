#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

pub type GroupMembershipPolicy = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentPrice {
    pub amount: String,
    pub asset: String,
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
    pub group_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub membership_policy: GroupMembershipPolicy,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub members_public: Option<bool>,
    pub membership_epoch: i64,
    pub member_count: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_policy: Option<PaymentPolicy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMember {
    pub group_id: String,
    pub agent_id: String,
    pub role: String,
    pub status: String,
    pub joined_at: String,
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
    pub group_id: String,
    pub token: String,
    pub created_by: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_uses: Option<i64>,
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
    pub group_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    pub member_count: i64,
    pub membership_policy: GroupMembershipPolicy,
    pub invited_by: String,
    pub valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupCreateRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub group_id: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub created_by: Option<String>,
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
    pub group_id: String,
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
    pub agent_id: String,
    pub amount: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRevenueShareRequest {
    pub task_id: String,
    pub payer: String,
    pub amount: String,
    pub asset: String,
    pub network: String,
    pub on_chain_tx: String,
    pub participants: Vec<GroupRevenueShareParticipant>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRevenueShareResponse {
    pub group_id: String,
    pub task_id: String,
    pub payment: crate::types::LedgerTransaction,
    pub revenue_shares: Vec<crate::types::LedgerTransaction>,
}

pub type GroupMessageFanoutRequest = crate::types::MessageEnvelope;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMessageFanoutResponse {
    pub group_id: String,
    pub source_message_id: String,
    pub message_ids: std::collections::HashMap<String, String>,
    pub recipients: Vec<String>,
    pub fanout: i64,
}
