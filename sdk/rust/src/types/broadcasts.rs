use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BroadcastVisibility {
    Public,
    Unlisted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BroadcastEncryption {
    None,
    Envelope,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BroadcastPaymentType {
    Free,
    Subscription,
    PerMessage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastSubscriptionPrice {
    pub amount: String,
    pub asset: String,
    pub network: String,
    pub interval: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastPaymentPolicy {
    #[serde(rename = "type")]
    pub payment_type: BroadcastPaymentType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription: Option<BroadcastSubscriptionPrice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastChannel {
    pub broadcast_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub owner: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_crypto_id: Option<String>,
    pub publishers: Vec<String>,
    pub subscriber_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    pub visibility: BroadcastVisibility,
    pub encryption: BroadcastEncryption,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_policy: Option<BroadcastPaymentPolicy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_version: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_rotated_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_activity_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastQueryParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<BroadcastVisibility>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_type: Option<BroadcastPaymentType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastSubscriber {
    pub broadcast_id: String,
    pub agent_id: String,
    pub subscribed_at: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_scheme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_network: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_asset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_interval: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_payment_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastMessage {
    pub message_id: String,
    pub broadcast_id: String,
    pub publisher: String,
    pub timestamp: String,
    pub content_type: String,
    pub body: String,
    pub sequence: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastCreateRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<BroadcastVisibility>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encryption: Option<BroadcastEncryption>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_policy: Option<BroadcastPaymentPolicy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}
