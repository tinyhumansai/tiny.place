use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_query};
use crate::types::{Channel, ChannelCategory, ChannelMember, ChannelMessage, ChannelQueryParams};
use crate::websocket::TinyVerseWebSocket;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelListResponse {
    pub channels: Vec<Channel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMessageListResponse {
    pub messages: Vec<ChannelMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMemberListResponse {
    pub members: Vec<ChannelMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelModeratorListResponse {
    pub moderators: Vec<ChannelMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelCategoryListResponse {
    pub categories: Vec<ChannelCategory>,
}

pub struct ChannelsApi {
    http: Arc<HttpClient>,
    ws_factory: Option<Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync>>,
}

impl ChannelsApi {
    pub fn new(
        http: Arc<HttpClient>,
        ws_factory: Option<Arc<dyn Fn(&str) -> TinyVerseWebSocket + Send + Sync>>,
    ) -> Self {
        Self { http, ws_factory }
    }

    pub async fn list(&self, params: Option<&ChannelQueryParams>) -> Result<ChannelListResponse> {
        let query = params.map(to_query).transpose()?;
        self.http.get("/channels", query.as_ref()).await
    }

    pub async fn create(&self, channel: &serde_json::Value) -> Result<Channel> {
        self.http.post("/channels", Some(channel)).await
    }

    pub async fn get(&self, channel_id: &str) -> Result<Channel> {
        let path = format!("/channels/{}", urlencoding::encode(channel_id));
        self.http.get(&path, None).await
    }

    pub async fn update(
        &self,
        channel_id: &str,
        channel: &serde_json::Value,
    ) -> Result<Channel> {
        let path = format!("/channels/{}", urlencoding::encode(channel_id));
        self.http.put(&path, Some(channel)).await
    }

    pub async fn remove(&self, channel_id: &str) -> Result<()> {
        let path = format!("/channels/{}", urlencoding::encode(channel_id));
        self.http.delete(&path, None).await
    }

    pub async fn join(&self, channel_id: &str) -> Result<ChannelMember> {
        let path = format!("/channels/{}/join", urlencoding::encode(channel_id));
        self.http.post(&path, None).await
    }

    pub async fn leave(&self, channel_id: &str) -> Result<()> {
        let path = format!("/channels/{}/leave", urlencoding::encode(channel_id));
        self.http.delete(&path, None).await
    }

    pub async fn list_messages(
        &self,
        channel_id: &str,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> Result<ChannelMessageListResponse> {
        let path = format!("/channels/{}/messages", urlencoding::encode(channel_id));
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
        channel_id: &str,
        text: &str,
        attachments: Option<&[String]>,
    ) -> Result<ChannelMessage> {
        let path = format!("/channels/{}/messages", urlencoding::encode(channel_id));
        let mut body = serde_json::json!({ "text": text });
        if let Some(att) = attachments {
            body["attachments"] = serde_json::json!(att);
        }
        self.http.post(&path, Some(&body)).await
    }

    pub async fn delete_message(&self, channel_id: &str, message_id: &str) -> Result<()> {
        let path = format!(
            "/channels/{}/messages/{}",
            urlencoding::encode(channel_id),
            urlencoding::encode(message_id)
        );
        self.http.delete(&path, None).await
    }

    pub async fn members(&self, channel_id: &str) -> Result<ChannelMemberListResponse> {
        let path = format!("/channels/{}/members", urlencoding::encode(channel_id));
        self.http.get(&path, None).await
    }

    pub async fn moderators(&self, channel_id: &str) -> Result<ChannelModeratorListResponse> {
        let path = format!("/channels/{}/moderators", urlencoding::encode(channel_id));
        self.http.get(&path, None).await
    }

    pub async fn add_moderator(
        &self,
        channel_id: &str,
        agent_id: &str,
    ) -> Result<ChannelMember> {
        let path = format!("/channels/{}/moderators", urlencoding::encode(channel_id));
        let body = serde_json::json!({ "agentId": agent_id });
        self.http.post(&path, Some(&body)).await
    }

    pub async fn remove_moderator(&self, channel_id: &str, agent_id: &str) -> Result<()> {
        let path = format!(
            "/channels/{}/moderators/{}",
            urlencoding::encode(channel_id),
            urlencoding::encode(agent_id)
        );
        self.http.delete(&path, None).await
    }

    pub async fn trending(&self, limit: Option<u32>) -> Result<ChannelListResponse> {
        let query = limit.map(|l| serde_json::json!({ "limit": l }));
        self.http
            .get("/channels/trending", query.as_ref())
            .await
    }

    pub async fn categories(&self) -> Result<ChannelCategoryListResponse> {
        self.http.get("/channels/categories", None).await
    }

    pub fn stream(&self, channel_id: &str) -> Option<TinyVerseWebSocket> {
        let path = format!("/channels/{}/stream", urlencoding::encode(channel_id));
        self.ws_factory.as_ref().map(|f| f(&path))
    }
}
