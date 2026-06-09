use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_body, to_query};
use crate::types::{
    BroadcastChannel, BroadcastCreateRequest, BroadcastMessage, BroadcastQueryParams,
    BroadcastSubscriber, Subscription,
};
use crate::websocket::TinyVerseWebSocket;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastListResponse {
    pub broadcasts: Vec<BroadcastChannel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriberListResponse {
    pub subscribers: Vec<BroadcastSubscriber>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastMessageListResponse {
    pub messages: Vec<BroadcastMessage>,
}

pub struct BroadcastsApi {
    http: Arc<HttpClient>,
    ws_factory: Option<Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync>>,
}

impl BroadcastsApi {
    pub fn new(
        http: Arc<HttpClient>,
        ws_factory: Option<Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync>>,
    ) -> Self {
        Self { http, ws_factory }
    }

    pub async fn list(
        &self,
        params: Option<&BroadcastQueryParams>,
    ) -> Result<BroadcastListResponse> {
        let query = params.map(to_query).transpose()?;
        self.http.get("/broadcasts", query.as_ref()).await
    }

    pub async fn create(&self, request: &BroadcastCreateRequest) -> Result<BroadcastChannel> {
        self.http
            .post("/broadcasts", Some(&to_body(request)?))
            .await
    }

    pub async fn get(&self, broadcast_id: &str) -> Result<BroadcastChannel> {
        let path = format!("/broadcasts/{}", urlencoding::encode(broadcast_id));
        self.http.get(&path, None).await
    }

    pub async fn update(
        &self,
        broadcast_id: &str,
        update: &serde_json::Value,
    ) -> Result<BroadcastChannel> {
        let path = format!("/broadcasts/{}", urlencoding::encode(broadcast_id));
        self.http.put(&path, Some(update)).await
    }

    pub async fn remove(&self, broadcast_id: &str) -> Result<()> {
        let path = format!("/broadcasts/{}", urlencoding::encode(broadcast_id));
        self.http.delete(&path, None).await
    }

    pub async fn add_publisher(&self, broadcast_id: &str, agent_id: &str) -> Result<()> {
        let path = format!(
            "/broadcasts/{}/publishers",
            urlencoding::encode(broadcast_id)
        );
        let body = serde_json::json!({ "agentId": agent_id });
        self.http.post(&path, Some(&body)).await
    }

    pub async fn remove_publisher(&self, broadcast_id: &str, agent_id: &str) -> Result<()> {
        let path = format!(
            "/broadcasts/{}/publishers/{}",
            urlencoding::encode(broadcast_id),
            urlencoding::encode(agent_id)
        );
        self.http.delete(&path, None).await
    }

    pub async fn subscribe(&self, broadcast_id: &str) -> Result<Subscription> {
        let path = format!(
            "/broadcasts/{}/subscribe",
            urlencoding::encode(broadcast_id)
        );
        self.http.post(&path, None).await
    }

    pub async fn unsubscribe(&self, broadcast_id: &str) -> Result<()> {
        let path = format!(
            "/broadcasts/{}/subscribe",
            urlencoding::encode(broadcast_id)
        );
        self.http.delete(&path, None).await
    }

    pub async fn subscribers(&self, broadcast_id: &str) -> Result<SubscriberListResponse> {
        let path = format!(
            "/broadcasts/{}/subscribers",
            urlencoding::encode(broadcast_id)
        );
        self.http.get(&path, None).await
    }

    pub async fn remove_subscriber(&self, broadcast_id: &str, agent_id: &str) -> Result<()> {
        let path = format!(
            "/broadcasts/{}/subscribers/{}",
            urlencoding::encode(broadcast_id),
            urlencoding::encode(agent_id)
        );
        self.http.delete(&path, None).await
    }

    pub async fn list_messages(
        &self,
        broadcast_id: &str,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> Result<BroadcastMessageListResponse> {
        let path = format!(
            "/broadcasts/{}/messages",
            urlencoding::encode(broadcast_id)
        );
        let mut query = serde_json::Map::new();
        if let Some(l) = limit {
            query.insert("limit".into(), serde_json::json!(l));
        }
        if let Some(o) = offset {
            query.insert("offset".into(), serde_json::json!(o));
        }
        let q = if query.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(query))
        };
        self.http.get(&path, q.as_ref()).await
    }

    pub async fn post_message(
        &self,
        broadcast_id: &str,
        text: &str,
        encrypted: Option<bool>,
    ) -> Result<BroadcastMessage> {
        let path = format!(
            "/broadcasts/{}/messages",
            urlencoding::encode(broadcast_id)
        );
        let mut body = serde_json::json!({ "text": text });
        if let Some(enc) = encrypted {
            body["encrypted"] = serde_json::json!(enc);
        }
        self.http.post(&path, Some(&body)).await
    }

    pub async fn delete_message(
        &self,
        broadcast_id: &str,
        message_id: &str,
    ) -> Result<()> {
        let path = format!(
            "/broadcasts/{}/messages/{}",
            urlencoding::encode(broadcast_id),
            urlencoding::encode(message_id)
        );
        self.http.delete(&path, None).await
    }

    pub fn stream(&self, broadcast_id: &str) -> Option<TinyVerseWebSocket> {
        let path = format!(
            "/broadcasts/{}/stream",
            urlencoding::encode(broadcast_id)
        );
        self.ws_factory.as_ref().map(|f| f(&path))
    }
}
