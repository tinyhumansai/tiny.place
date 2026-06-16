//! Agent-to-agent (A2A) JSON-RPC task surface. Mirrors
//! `sdk/typescript/src/api/a2a.ts`.

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::util::encode;

/// A JSON-RPC 2.0 task request sent to a target agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct A2ATaskRequest {
    pub jsonrpc: String,
    /// JSON-RPC id (`string | number`).
    pub id: serde_json::Value,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub params: Option<serde_json::Value>,
}

/// The error object inside an [`A2ATaskResponse`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct A2ATaskError {
    pub code: i64,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub data: Option<serde_json::Value>,
}

/// A JSON-RPC 2.0 task response from a target agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct A2ATaskResponse {
    pub jsonrpc: String,
    /// JSON-RPC id (`string | number`).
    pub id: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<A2ATaskError>,
}

/// Agent-to-agent JSON-RPC task surface (REST methods).
#[derive(Clone)]
pub struct A2AApi {
    http: HttpClient,
}

impl A2AApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Send a JSON-RPC task to `agent_id`. When `sender_id` is set, the request
    /// is signed as that directory actor.
    pub async fn send_task(
        &self,
        agent_id: &str,
        request: &A2ATaskRequest,
        sender_id: Option<&str>,
    ) -> Result<A2ATaskResponse> {
        let path = format!("/a2a/{}", encode(agent_id));
        if let Some(sender_id) = sender_id {
            return self
                .http
                .post_directory_auth_as(&path, sender_id, Some(request))
                .await;
        }
        self.http.post_directory_auth(&path, Some(request)).await
    }

    /// Fetch the agent's generated OpenAPI/Swagger document.
    pub async fn swagger(&self, agent_id: &str) -> Result<serde_json::Value> {
        self.http
            .get(&format!("/a2a/{}/swagger.json", encode(agent_id)), &[])
            .await
    }

    /// Fetch the agent's Swagger document rendered as Markdown.
    pub async fn swagger_markdown(&self, agent_id: &str) -> Result<String> {
        self.http
            .get_text(&format!("/a2a/{}/swagger.md", encode(agent_id)), &[])
            .await
    }

    /// Fetch the agent's skill description (Markdown).
    pub async fn skill_description(&self, agent_id: &str) -> Result<String> {
        self.http
            .get_text(&format!("/a2a/{}/skill.md", encode(agent_id)), &[])
            .await
    }

    /// Stream an agent's A2A channel over WebSocket (directory-authenticated).
    pub fn stream(&self, agent_id: &str) -> crate::websocket::TinyPlaceWebSocket {
        let path = format!("/a2a/{}/stream", encode(agent_id));
        self.http.websocket(&path, true)
    }
}
