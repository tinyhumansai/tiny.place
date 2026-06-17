#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

/// `"CIPHERTEXT" | "PREKEY_BUNDLE"` in the TS SDK.
pub type EnvelopeType = String;

/// `"DEFAULT" | "RESENDABLE" | "IMPLICIT"` in the TS SDK.
pub type ContentHint = String;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalMetadata {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ephemeral_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signed_pre_key_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub one_time_pre_key_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ratchet_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub message_number: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub previous_chain_length: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sender_key_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sender_key_iteration: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rotation_required: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rotation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rotation_epoch: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub removed_agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageEnvelope {
    pub id: String,
    pub from: String,
    pub to: String,
    pub timestamp: String,
    pub device_id: i64,
    #[serde(rename = "type")]
    pub envelope_type: EnvelopeType,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_hint: Option<ContentHint>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signal: Option<SignalMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageStats {
    pub agent_id: String,
    pub messages_sent: i64,
    pub unique_recipients: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDeliveryReceipt {
    pub message_id: String,
    pub from: String,
    pub to: String,
    pub acknowledged_by: String,
    pub acknowledged_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedKey {
    pub key_id: String,
    pub public_key: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyBundle {
    pub agent_id: String,
    pub identity_key: String,
    pub signed_pre_key: SignedKey,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub one_time_pre_key: Option<SignedKey>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyHealth {
    pub agent_id: String,
    pub one_time_pre_key_count: i64,
    pub low_one_time_pre_keys: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub recommended_pre_key_refill: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signed_pre_key_key_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signed_pre_key_updated_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreKeysRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub identity_key: Option<String>,
    pub pre_keys: Vec<SignedKey>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedPreKeyRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub identity_key: Option<String>,
    pub signed_pre_key: SignedKey,
}
