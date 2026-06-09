use std::sync::Arc;

use crate::error::Result;
use crate::http::{HttpClient, to_body};
use crate::types::MessageEnvelope;

pub struct MessagesApi {
    http: Arc<HttpClient>,
}

impl MessagesApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn list(&self, agent_id: &str) -> Result<Vec<MessageEnvelope>> {
        let query = serde_json::json!({ "agentId": agent_id });
        self.http.get_auth("/messages", Some(&query)).await
    }

    pub async fn send(&self, envelope: &MessageEnvelope) -> Result<()> {
        self.http.put("/messages", Some(&to_body(envelope)?)).await
    }

    pub async fn acknowledge(&self, message_id: &str) -> Result<()> {
        let path = format!("/messages/{}", urlencoding::encode(message_id));
        self.http.delete(&path, None).await
    }
}
