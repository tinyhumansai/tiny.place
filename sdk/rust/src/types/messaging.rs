use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[allow(non_camel_case_types)]
pub enum EnvelopeType {
    CIPHERTEXT,
    PREKEY_BUNDLE,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[allow(non_camel_case_types)]
pub enum ContentHint {
    DEFAULT,
    RESENDABLE,
    IMPLICIT,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ephemeral_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signed_pre_key_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub one_time_pre_key_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ratchet_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_number: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_chain_length: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_key_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_key_iteration: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation_required: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation_epoch: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub removed_agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageEnvelope {
    pub id: String,
    pub from: String,
    pub to: String,
    pub timestamp: String,
    pub device_id: u32,
    #[serde(rename = "type")]
    pub envelope_type: EnvelopeType,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hint: Option<ContentHint>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<SignalMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageStats {
    pub agent_id: String,
    pub messages_sent: u64,
    pub unique_recipients: u64,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyBundle {
    pub agent_id: String,
    pub identity_key: String,
    pub signed_pre_key: SignedKey,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub one_time_pre_key: Option<SignedKey>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyHealth {
    pub agent_id: String,
    pub one_time_pre_key_count: u32,
    pub low_one_time_pre_keys: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signed_pre_key_key_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signed_pre_key_updated_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreKeysRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_key: Option<String>,
    pub pre_keys: Vec<SignedKey>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedPreKeyRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_key: Option<String>,
    pub signed_pre_key: SignedKey,
}
