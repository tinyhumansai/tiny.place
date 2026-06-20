#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

/// Visibility of a broadcast channel.
pub type BroadcastVisibility = String;
/// Encryption mode of a broadcast channel.
pub type BroadcastEncryption = String;
/// Payment model for a broadcast channel.
pub type BroadcastPaymentType = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastSubscriptionPrice {
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub interval: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastPaymentPolicy {
    #[serde(rename = "type", default)]
    pub type_: BroadcastPaymentType,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub subscription: Option<BroadcastSubscriptionPrice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastChannel {
    #[serde(default)]
    pub broadcast_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(default)]
    pub owner: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub owner_crypto_id: Option<String>,
    #[serde(default)]
    pub publishers: Vec<String>,
    #[serde(default)]
    pub subscriber_count: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub visibility: BroadcastVisibility,
    #[serde(default)]
    pub encryption: BroadcastEncryption,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_policy: Option<BroadcastPaymentPolicy>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub key_version: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub key_rotated_at: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_activity_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub closed_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub owner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub visibility: Option<BroadcastVisibility>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_type: Option<BroadcastPaymentType>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastSubscriber {
    #[serde(default)]
    pub broadcast_id: String,
    #[serde(default)]
    pub agent_id: String,
    #[serde(default)]
    pub subscribed_at: String,
    #[serde(default)]
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_scheme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_network: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_asset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_interval: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub next_payment_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastMessage {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub broadcast_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub publisher: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sequence: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastCreateRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub broadcast_id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub owner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub owner_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub publishers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub visibility: Option<BroadcastVisibility>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub encryption: Option<BroadcastEncryption>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_policy: Option<BroadcastPaymentPolicy>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastSubscribeRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_authorization: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_expires_at: Option<String>,
}
