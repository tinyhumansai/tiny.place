//! Conversations (chats / groups / broadcasts). Mirrors
//! `sdk/typescript/src/api/conversations.ts`.

use rand::RngCore as _;
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    Conversation, ConversationCreateRequest, ConversationMember, ConversationMessage,
    ConversationMessageCreateRequest, ConversationQueryParams, ConversationRoleChange,
    ConversationUpdateRequest,
};
use crate::util::encode;

/// `{ conversations: [...] }`. The TS normalizes `null` to `[]`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationListResponse {
    pub conversations: Vec<Conversation>,
}

#[derive(Debug, Clone, Deserialize)]
struct ConversationListPayload {
    conversations: Option<Vec<Conversation>>,
}

/// `{ members: [...] }`. The TS normalizes `null` to `[]`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMembersResponse {
    pub members: Vec<ConversationMember>,
}

#[derive(Debug, Clone, Deserialize)]
struct ConversationMembersPayload {
    members: Option<Vec<ConversationMember>>,
}

/// `{ messages: [...] }`. The TS normalizes `null` to `[]`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessagesResponse {
    pub messages: Vec<ConversationMessage>,
}

#[derive(Debug, Clone, Deserialize)]
struct ConversationMessagesPayload {
    messages: Option<Vec<ConversationMessage>>,
}

#[derive(Clone)]
pub struct ConversationsApi {
    http: HttpClient,
}

impl ConversationsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn list(
        &self,
        params: Option<&ConversationQueryParams>,
    ) -> Result<ConversationListResponse> {
        let query = build_query(params)?;
        let result: ConversationListPayload = self.http.get("/conversations", &query).await?;
        Ok(ConversationListResponse {
            conversations: result.conversations.unwrap_or_default(),
        })
    }

    pub async fn create(&self, request: ConversationCreateRequest) -> Result<Conversation> {
        let mut body = serde_json::to_value(&request)?;
        if let Some(obj) = body.as_object_mut() {
            if !obj
                .get("conversationId")
                .map(|v| v.is_string())
                .unwrap_or(false)
            {
                obj.insert(
                    "conversationId".to_string(),
                    serde_json::Value::String(next_client_id("conv")),
                );
            }
        }
        if let Some(creator) = request.creator.as_deref() {
            self.http
                .post_directory_auth_as("/conversations", creator, Some(&body))
                .await
        } else {
            self.http
                .post_directory_auth("/conversations", Some(&body))
                .await
        }
    }

    pub async fn get(&self, conversation_id: &str) -> Result<Conversation> {
        let path = format!("/conversations/{}", encode(conversation_id));
        self.http.get(&path, &[]).await
    }

    pub async fn update(
        &self,
        conversation_id: &str,
        update: &ConversationUpdateRequest,
        actor_id: Option<&str>,
    ) -> Result<Conversation> {
        let path = format!("/conversations/{}", encode(conversation_id));
        if let Some(actor) = actor_id {
            self.http
                .put_directory_auth_as(&path, actor, Some(update))
                .await
        } else {
            self.http.put_directory_auth(&path, Some(update)).await
        }
    }

    pub async fn remove(&self, conversation_id: &str, actor_id: Option<&str>) -> Result<()> {
        let path = format!("/conversations/{}", encode(conversation_id));
        if let Some(actor) = actor_id {
            self.http
                .delete_directory_auth_as::<(), serde_json::Value>(&path, actor, None)
                .await
        } else {
            self.http
                .delete_directory_auth::<(), serde_json::Value>(&path, None)
                .await
        }
    }

    pub async fn join(
        &self,
        conversation_id: &str,
        agent_id: Option<&str>,
    ) -> Result<ConversationMember> {
        let path = format!("/conversations/{}/join", encode(conversation_id));
        if let Some(agent_id) = agent_id {
            let body = serde_json::json!({ "agentId": agent_id });
            self.http
                .post_directory_auth_as(&path, agent_id, Some(&body))
                .await
        } else {
            self.http
                .post_directory_auth::<ConversationMember, serde_json::Value>(&path, None)
                .await
        }
    }

    pub async fn leave(&self, conversation_id: &str, agent_id: Option<&str>) -> Result<()> {
        let query = match agent_id {
            Some(agent_id) => format!("?agentId={}", encode(agent_id)),
            None => String::new(),
        };
        let path = format!("/conversations/{}/leave{}", encode(conversation_id), query);
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

    pub async fn members(&self, conversation_id: &str) -> Result<ConversationMembersResponse> {
        let path = format!("/conversations/{}/members", encode(conversation_id));
        let result: ConversationMembersPayload = self.http.get(&path, &[]).await?;
        Ok(ConversationMembersResponse {
            members: result.members.unwrap_or_default(),
        })
    }

    pub async fn add_member(
        &self,
        conversation_id: &str,
        agent_id: &str,
        manager_id: Option<&str>,
    ) -> Result<ConversationMember> {
        let path = format!("/conversations/{}/members", encode(conversation_id));
        let body = serde_json::json!({ "agentId": agent_id });
        if let Some(manager) = manager_id {
            self.http
                .post_directory_auth_as(&path, manager, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn remove_member(
        &self,
        conversation_id: &str,
        agent_id: &str,
        manager_id: Option<&str>,
    ) -> Result<()> {
        let path = format!(
            "/conversations/{}/members/{}",
            encode(conversation_id),
            encode(agent_id)
        );
        // The TS code signs as `managerId` when present, else as `agentId`.
        let actor = manager_id.unwrap_or(agent_id);
        self.http
            .delete_directory_auth_as::<(), serde_json::Value>(&path, actor, None)
            .await
    }

    pub async fn approve_member(
        &self,
        conversation_id: &str,
        agent_id: &str,
        manager_id: Option<&str>,
    ) -> Result<ConversationMember> {
        let path = format!("/conversations/{}/approve", encode(conversation_id));
        let body = serde_json::json!({ "agentId": agent_id });
        if let Some(manager) = manager_id {
            self.http
                .post_directory_auth_as(&path, manager, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn reject_member(
        &self,
        conversation_id: &str,
        agent_id: &str,
        manager_id: Option<&str>,
    ) -> Result<()> {
        let path = format!("/conversations/{}/reject", encode(conversation_id));
        let body = serde_json::json!({ "agentId": agent_id });
        if let Some(manager) = manager_id {
            self.http
                .post_directory_auth_as(&path, manager, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn list_messages(
        &self,
        conversation_id: &str,
        limit: Option<i64>,
    ) -> Result<ConversationMessagesResponse> {
        let path = format!("/conversations/{}/messages", encode(conversation_id));
        let mut query: Vec<(String, String)> = Vec::new();
        if let Some(limit) = limit {
            query.push(("limit".into(), limit.to_string()));
        }
        let result: ConversationMessagesPayload = self.http.get(&path, &query).await?;
        Ok(ConversationMessagesResponse {
            messages: result.messages.unwrap_or_default(),
        })
    }

    pub async fn post_message(
        &self,
        conversation_id: &str,
        message: ConversationMessageCreateRequest,
    ) -> Result<ConversationMessage> {
        let path = format!("/conversations/{}/messages", encode(conversation_id));
        let mut body = serde_json::to_value(&message)?;
        if let Some(obj) = body.as_object_mut() {
            if !obj.get("messageId").map(|v| v.is_string()).unwrap_or(false) {
                obj.insert(
                    "messageId".to_string(),
                    serde_json::Value::String(next_client_id("msg")),
                );
            }
        }
        if let Some(author) = message.author.as_deref() {
            self.http
                .post_directory_auth_as(&path, author, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn delete_message(
        &self,
        conversation_id: &str,
        message_id: &str,
        actor_id: Option<&str>,
    ) -> Result<()> {
        let path = format!(
            "/conversations/{}/messages/{}",
            encode(conversation_id),
            encode(message_id)
        );
        if let Some(actor) = actor_id {
            self.http
                .delete_directory_auth_as::<(), serde_json::Value>(&path, actor, None)
                .await
        } else {
            self.http
                .delete_directory_auth::<(), serde_json::Value>(&path, None)
                .await
        }
    }

    pub async fn add_moderator(
        &self,
        conversation_id: &str,
        agent_id: &str,
        owner_id: Option<&str>,
    ) -> Result<ConversationRoleChange> {
        let path = format!("/conversations/{}/moderators", encode(conversation_id));
        let body = serde_json::json!({ "agentId": agent_id });
        if let Some(owner) = owner_id {
            self.http
                .post_directory_auth_as(&path, owner, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn remove_moderator(
        &self,
        conversation_id: &str,
        agent_id: &str,
        owner_id: Option<&str>,
    ) -> Result<()> {
        let path = format!(
            "/conversations/{}/moderators/{}",
            encode(conversation_id),
            encode(agent_id)
        );
        if let Some(owner) = owner_id {
            self.http
                .delete_directory_auth_as::<(), serde_json::Value>(&path, owner, None)
                .await
        } else {
            self.http
                .delete_directory_auth::<(), serde_json::Value>(&path, None)
                .await
        }
    }

    pub async fn add_publisher(
        &self,
        conversation_id: &str,
        agent_id: &str,
        owner_id: Option<&str>,
    ) -> Result<ConversationRoleChange> {
        let path = format!("/conversations/{}/publishers", encode(conversation_id));
        let body = serde_json::json!({ "agentId": agent_id });
        if let Some(owner) = owner_id {
            self.http
                .post_directory_auth_as(&path, owner, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn remove_publisher(
        &self,
        conversation_id: &str,
        agent_id: &str,
        owner_id: Option<&str>,
    ) -> Result<()> {
        let path = format!(
            "/conversations/{}/publishers/{}",
            encode(conversation_id),
            encode(agent_id)
        );
        if let Some(owner) = owner_id {
            self.http
                .delete_directory_auth_as::<(), serde_json::Value>(&path, owner, None)
                .await
        } else {
            self.http
                .delete_directory_auth::<(), serde_json::Value>(&path, None)
                .await
        }
    }

    /// Stream a conversation over WebSocket. Signed with directory auth when an
    /// `agent_id` is supplied.
    pub fn stream(
        &self,
        conversation_id: &str,
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
        let path = format!(
            "/conversations/{}/stream",
            crate::util::encode(conversation_id)
        );
        self.http.websocket(
            &crate::util::append_query(&path, &query),
            agent_id.is_some(),
        )
    }
}

fn build_query(params: Option<&ConversationQueryParams>) -> Result<Vec<(String, String)>> {
    let mut query: Vec<(String, String)> = Vec::new();
    let Some(params) = params else {
        return Ok(query);
    };
    if let Some(value) = &params.r#type {
        query.push(("type".into(), value.clone()));
    }
    if let Some(value) = &params.q {
        query.push(("q".into(), value.clone()));
    }
    if let Some(value) = &params.tag {
        query.push(("tag".into(), value.clone()));
    }
    if let Some(value) = &params.category {
        query.push(("category".into(), value.clone()));
    }
    if let Some(value) = &params.creator {
        query.push(("creator".into(), value.clone()));
    }
    if let Some(value) = &params.sort {
        query.push(("sort".into(), value.clone()));
    }
    if let Some(value) = params.limit {
        query.push(("limit".into(), value.to_string()));
    }
    Ok(query)
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
