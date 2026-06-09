use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_body};
use crate::websocket::TinyVerseWebSocket;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct A2ATaskRequest {
    pub jsonrpc: String,
    pub id: serde_json::Value,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct A2ATaskError {
    pub code: i64,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct A2ATaskResponse {
    pub jsonrpc: String,
    pub id: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<A2ATaskError>,
}

pub struct A2AApi {
    http: Arc<HttpClient>,
    ws_factory: Option<Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync>>,
}

impl A2AApi {
    pub fn new(
        http: Arc<HttpClient>,
        ws_factory: Option<Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync>>,
    ) -> Self {
        Self { http, ws_factory }
    }

    pub async fn send_task(
        &self,
        agent_id: &str,
        request: &A2ATaskRequest,
    ) -> Result<A2ATaskResponse> {
        let path = format!("/a2a/{}", urlencoding::encode(agent_id));
        self.http.post(&path, Some(&to_body(request)?)).await
    }

    pub fn stream(&self, agent_id: &str) -> Option<TinyVerseWebSocket> {
        let path = format!("/a2a/{}/stream", urlencoding::encode(agent_id));
        self.ws_factory.as_ref().map(|f| f(&path))
    }

    pub async fn swagger(&self, agent_id: &str) -> Result<serde_json::Value> {
        let path = format!("/a2a/{}/swagger.json", urlencoding::encode(agent_id));
        self.http.get(&path, None).await
    }

    pub async fn swagger_markdown(&self, agent_id: &str) -> Result<String> {
        let path = format!("/a2a/{}/swagger.md", urlencoding::encode(agent_id));
        self.http.get(&path, None).await
    }

    pub async fn skill_description(&self, agent_id: &str) -> Result<String> {
        let path = format!("/a2a/{}/skill.md", urlencoding::encode(agent_id));
        self.http.get(&path, None).await
    }
}
