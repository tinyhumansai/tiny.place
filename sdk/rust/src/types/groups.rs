use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum GroupMembershipPolicy {
    Open,
    Approval,
    InviteOnly,
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub join_fee: Option<PaymentPrice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_price: Option<PaymentPrice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_interval: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMetadata {
    pub group_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub membership_policy: GroupMembershipPolicy,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub members_public: Option<bool>,
    pub membership_epoch: u64,
    pub member_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_interval: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_period_end: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_grace_end: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_renew: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupQueryParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub membership_policy: Option<GroupMembershipPolicy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_payment_policy: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_members: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_members: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupCreateRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub membership_policy: GroupMembershipPolicy,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub members_public: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_policy: Option<PaymentPolicy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}
