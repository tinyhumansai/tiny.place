#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

/// RPC endpoint metadata advertised by the backend's Solana chain info.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaRpcInfo {
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub rate_limit_per_min: i64,
    #[serde(default)]
    pub fallbacks: bool,
}

/// Public chain metadata for the configured Solana network (`GET /solana`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaChainInfo {
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub native_asset: String,
    #[serde(default)]
    pub explorer_url: String,
    #[serde(default)]
    pub confirmations: i64,
    #[serde(default)]
    pub assets: Vec<SupportedAsset>,
    pub rpc: SolanaRpcInfo,
}

/// A JSON-RPC id: a string, a number, or null. Modeled as a free-form value.
pub type SolanaRpcId = serde_json::Value;

/// A JSON-RPC 2.0 request sent through the backend's Solana proxy
/// (`POST /solana/rpc`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaRpcRequest {
    #[serde(default)]
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub id: Option<SolanaRpcId>,
    #[serde(default)]
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub params: Option<serde_json::Value>,
}

/// A JSON-RPC error object.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaRpcError {
    #[serde(default)]
    pub code: i64,
    #[serde(default)]
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub data: Option<serde_json::Value>,
}

/// A JSON-RPC 2.0 response from the Solana proxy.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaRpcResponse<T = serde_json::Value> {
    #[serde(default)]
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub id: Option<SolanaRpcId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<SolanaRpcError>,
}

/// A batch JSON-RPC response (one entry per batched request).
pub type SolanaRpcBatchResponse<T = serde_json::Value> = Vec<SolanaRpcResponse<T>>;
