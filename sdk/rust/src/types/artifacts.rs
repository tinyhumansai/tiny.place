use std::collections::HashMap;

#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    #[serde(default)]
    pub artifact_id: String,
    #[serde(default)]
    pub owner: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub owner_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub size_bytes: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sha256: Option<String>,
    /// `"none" | "envelope"` or any other server-defined string.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub encryption: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub recipients: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub recipient_crypto_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_downloads: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub download_count: Option<i64>,
    /// `"active" | "expired" | "revoked"` or any other server-defined string.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub references: Option<ArtifactReference>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub updated_at: Option<String>,
    /// Index signature (`[key: string]: unknown`) — any extra fields.
    #[serde(flatten, default)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactReference {
    /// `"task" | "escrow" | "product" | "message"` or any other string.
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactListResult {
    #[serde(default)]
    pub artifacts: Vec<Artifact>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactQueryParams {
    /// `"owner" | "recipient"`.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub role: Option<String>,
    /// `"active" | "expired" | "revoked" | "all"`.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reference_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reference_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactCreateRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub size_bytes: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ttl: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_downloads: Option<i64>,
    /// `"none" | "envelope"` or any other server-defined string.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub encryption: Option<String>,
    /// `"task" | "escrow" | "product" | "message"` or any other string.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reference_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reference_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub recipients: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
    /// Index signature (`[key: string]: unknown`) — any extra fields.
    #[serde(flatten, default)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactRecipientUpdate {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub add: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub remove: Option<Vec<String>>,
    /// Index signature (`[key: string]: unknown`) — any extra fields.
    #[serde(flatten, default)]
    pub extra: HashMap<String, serde_json::Value>,
}
