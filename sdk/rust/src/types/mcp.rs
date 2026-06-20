#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap; // sibling types share a flat namespace, like the TS barrel

/// A JSON-RPC id: a string, a number, or null. Modeled as a free-form value.
pub type McpJsonRpcId = serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpJsonRpcRequest {
    #[serde(default)]
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub id: Option<McpJsonRpcId>,
    #[serde(default)]
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub params: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpJsonRpcError {
    #[serde(default)]
    pub code: i64,
    #[serde(default)]
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpJsonRpcResponse<R = serde_json::Value> {
    #[serde(default)]
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub id: Option<McpJsonRpcId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<R>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<McpJsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpResponse<R = serde_json::Value> {
    pub body: McpJsonRpcResponse<R>,
    #[serde(default)]
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpRequestOptions {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStreamOptions {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub resource: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInfo {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpInitializeResult {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub protocol_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub capabilities: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub server_info: Option<McpServerInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTerminateResponse {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
}
