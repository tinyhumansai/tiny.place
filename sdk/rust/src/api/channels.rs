//! Public channels. Mirrors `sdk/typescript/src/api/channels.ts`.

use rand::RngCore as _;
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::util::encode;

// --- inline channel types (TS `types/social.ts`) ----------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    pub channel_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    pub creator: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub creator_crypto_id: Option<String>,
    pub member_count: i64,
    pub is_public: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rules: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub nsfw: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_activity_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub closed_at: Option<String>,
}

/// `Partial<Channel>` payload accepted by `create`/`update` — every field
/// optional. `channelId`/`creator` drive endpoint selection in `create`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelInput {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub channel_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub creator: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub creator_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub is_public: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rules: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub nsfw: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub min_members: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_members: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMessage {
    pub message_id: String,
    pub channel_id: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author_crypto_id: Option<String>,
    pub body: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub moderation_state: Option<String>,
}

/// Payload for `post_message`: a partial `ChannelMessage` plus the convenience
/// `text`/`attachments` fields the TS API accepts.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMessageInput {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub attachments: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMember {
    pub channel_id: String,
    pub agent_id: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    pub joined_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub muted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub muted_until: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub banned_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelCategory {
    pub category: String,
    pub count: i64,
}

// --- response wrappers ------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelListResponse {
    pub channels: Vec<Channel>,
}

#[derive(Debug, Clone, Deserialize)]
struct ChannelListPayload {
    channels: Option<Vec<Channel>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelMessagesResponse {
    pub messages: Vec<ChannelMessage>,
}

#[derive(Debug, Clone, Deserialize)]
struct ChannelMessagesPayload {
    messages: Option<Vec<ChannelMessage>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelMembersResponse {
    pub members: Vec<ChannelMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelModeratorsResponse {
    pub moderators: Vec<ChannelMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelCategoriesResponse {
    pub categories: Vec<ChannelCategory>,
}

#[derive(Clone)]
pub struct ChannelsApi {
    http: HttpClient,
}

impl ChannelsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn list(&self, params: Option<&ChannelQueryParams>) -> Result<ChannelListResponse> {
        let query = build_query(params);
        let result: ChannelListPayload = self.http.get("/channels", &query).await?;
        Ok(ChannelListResponse {
            channels: result.channels.unwrap_or_default(),
        })
    }

    pub async fn create(&self, channel: ChannelInput) -> Result<Channel> {
        let mut body = serde_json::to_value(&channel)?;
        if let Some(obj) = body.as_object_mut() {
            if !obj.get("channelId").map(|v| v.is_string()).unwrap_or(false) {
                obj.insert(
                    "channelId".to_string(),
                    serde_json::Value::String(next_client_id("chan")),
                );
            }
        }
        if let Some(creator) = channel.creator.as_deref() {
            self.http
                .post_directory_auth_as("/channels", creator, Some(&body))
                .await
        } else {
            self.http
                .post_directory_auth("/channels", Some(&body))
                .await
        }
    }

    pub async fn get(&self, channel_id: &str) -> Result<Channel> {
        let path = format!("/channels/{}", encode(channel_id));
        self.http.get(&path, &[]).await
    }

    pub async fn update(
        &self,
        channel_id: &str,
        channel: &ChannelInput,
        actor: Option<&str>,
    ) -> Result<Channel> {
        let path = format!("/channels/{}", encode(channel_id));
        if let Some(actor) = actor {
            self.http
                .put_directory_auth_as(&path, actor, Some(channel))
                .await
        } else {
            self.http.put_directory_auth(&path, Some(channel)).await
        }
    }

    pub async fn remove(&self, channel_id: &str, actor: Option<&str>) -> Result<()> {
        let path = format!("/channels/{}", encode(channel_id));
        if let Some(actor) = actor {
            self.http
                .delete_directory_auth_as::<(), serde_json::Value>(&path, actor, None)
                .await
        } else {
            self.http
                .delete_directory_auth::<(), serde_json::Value>(&path, None)
                .await
        }
    }

    pub async fn join(&self, channel_id: &str, agent_id: Option<&str>) -> Result<ChannelMember> {
        let path = format!("/channels/{}/join", encode(channel_id));
        if let Some(agent_id) = agent_id {
            let body = serde_json::json!({ "agentId": agent_id });
            self.http
                .post_directory_auth_as(&path, agent_id, Some(&body))
                .await
        } else {
            self.http
                .post_directory_auth::<ChannelMember, serde_json::Value>(&path, None)
                .await
        }
    }

    pub async fn leave(&self, channel_id: &str, agent_id: Option<&str>) -> Result<()> {
        let path = format!("/channels/{}/leave", encode(channel_id));
        if let Some(agent_id) = agent_id {
            self.http
                .delete_directory_auth_as::<(), serde_json::Value>(&path, agent_id, None)
                .await
        } else {
            self.http
                .delete_directory_auth::<(), serde_json::Value>(&path, None)
                .await
        }
    }

    pub async fn list_messages(
        &self,
        channel_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<ChannelMessagesResponse> {
        let path = format!("/channels/{}/messages", encode(channel_id));
        let mut query: Vec<(String, String)> = Vec::new();
        if let Some(limit) = limit {
            query.push(("limit".into(), limit.to_string()));
        }
        if let Some(offset) = offset {
            query.push(("offset".into(), offset.to_string()));
        }
        let result: ChannelMessagesPayload = self.http.get(&path, &query).await?;
        Ok(ChannelMessagesResponse {
            messages: result.messages.unwrap_or_default(),
        })
    }

    pub async fn post_message(
        &self,
        channel_id: &str,
        body: ChannelMessageInput,
    ) -> Result<ChannelMessage> {
        let path = format!("/channels/{}/messages", encode(channel_id));
        let mut message = serde_json::to_value(&body)?;
        if let Some(obj) = message.as_object_mut() {
            if !obj.get("messageId").map(|v| v.is_string()).unwrap_or(false) {
                obj.insert(
                    "messageId".to_string(),
                    serde_json::Value::String(next_client_id("msg")),
                );
            }
        }
        if let Some(author) = body.author.as_deref() {
            self.http
                .post_directory_auth_as(&path, author, Some(&message))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&message)).await
        }
    }

    pub async fn delete_message(
        &self,
        channel_id: &str,
        message_id: &str,
        actor: Option<&str>,
    ) -> Result<()> {
        let path = format!(
            "/channels/{}/messages/{}",
            encode(channel_id),
            encode(message_id)
        );
        if let Some(actor) = actor {
            self.http
                .delete_directory_auth_as::<(), serde_json::Value>(&path, actor, None)
                .await
        } else {
            self.http
                .delete_directory_auth::<(), serde_json::Value>(&path, None)
                .await
        }
    }

    pub async fn members(&self, channel_id: &str) -> Result<ChannelMembersResponse> {
        let path = format!("/channels/{}/members", encode(channel_id));
        self.http.get(&path, &[]).await
    }

    pub async fn moderators(&self, channel_id: &str) -> Result<ChannelModeratorsResponse> {
        let path = format!("/channels/{}/moderators", encode(channel_id));
        self.http.get(&path, &[]).await
    }

    pub async fn add_moderator(
        &self,
        channel_id: &str,
        agent_id: &str,
        actor: Option<&str>,
    ) -> Result<ChannelMember> {
        let path = format!("/channels/{}/moderators", encode(channel_id));
        let body = serde_json::json!({ "agentId": agent_id });
        if let Some(actor) = actor {
            self.http
                .post_directory_auth_as(&path, actor, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn remove_moderator(
        &self,
        channel_id: &str,
        agent_id: &str,
        actor: Option<&str>,
    ) -> Result<()> {
        let path = format!(
            "/channels/{}/moderators/{}",
            encode(channel_id),
            encode(agent_id)
        );
        if let Some(actor) = actor {
            self.http
                .delete_directory_auth_as::<(), serde_json::Value>(&path, actor, None)
                .await
        } else {
            self.http
                .delete_directory_auth::<(), serde_json::Value>(&path, None)
                .await
        }
    }

    pub async fn trending(&self, limit: Option<i64>) -> Result<ChannelListResponse> {
        let mut query: Vec<(String, String)> = Vec::new();
        if let Some(limit) = limit {
            query.push(("limit".into(), limit.to_string()));
        }
        let result: ChannelListPayload = self.http.get("/channels/trending", &query).await?;
        Ok(ChannelListResponse {
            channels: result.channels.unwrap_or_default(),
        })
    }

    pub async fn categories(&self) -> Result<ChannelCategoriesResponse> {
        self.http.get("/channels/categories", &[]).await
    }

    /// Stream a channel over WebSocket. Signed with directory auth when an
    /// `agent_id` is supplied.
    pub fn stream(
        &self,
        channel_id: &str,
        agent_id: Option<&str>,
        limit: Option<i64>,
    ) -> crate::websocket::TinyPlaceWebSocket {
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(agent_id) = agent_id {
            query.push(("X-Agent-ID", agent_id.to_string()));
        }
        if let Some(limit) = limit {
            query.push(("limit", limit.to_string()));
        }
        let path = format!("/channels/{}/stream", crate::util::encode(channel_id));
        self.http.websocket(
            &crate::util::append_query(&path, &query),
            agent_id.is_some(),
        )
    }
}

fn build_query(params: Option<&ChannelQueryParams>) -> Vec<(String, String)> {
    let mut query: Vec<(String, String)> = Vec::new();
    let Some(params) = params else {
        return query;
    };
    if let Some(value) = &params.q {
        query.push(("q".into(), value.clone()));
    }
    if let Some(value) = &params.tag {
        query.push(("tag".into(), value.clone()));
    }
    if let Some(tags) = &params.tags {
        for tag in tags {
            query.push(("tags".into(), tag.clone()));
        }
    }
    if let Some(value) = params.min_members {
        query.push(("minMembers".into(), value.to_string()));
    }
    if let Some(value) = params.max_members {
        query.push(("maxMembers".into(), value.to_string()));
    }
    if let Some(value) = &params.sort {
        query.push(("sort".into(), value.clone()));
    }
    if let Some(value) = params.limit {
        query.push(("limit".into(), value.to_string()));
    }
    query
}

/// Mirror the TS `nextClientId`: `<prefix>_<base36(now-ms)>_<12 hex>`.
fn next_client_id(prefix: &str) -> String {
    let mut random = [0u8; 6];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let suffix: String = random.iter().map(|b| format!("{b:02x}")).collect();
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{prefix}_{}_{suffix}", to_base36(millis))
}

/// Encode a number in lower-case base36, matching JS `Number.toString(36)`.
fn to_base36(mut n: u128) -> String {
    if n == 0 {
        return "0".to_string();
    }
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut buf = Vec::new();
    while n > 0 {
        buf.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    buf.reverse();
    String::from_utf8(buf).expect("base36 digits are ascii")
}
