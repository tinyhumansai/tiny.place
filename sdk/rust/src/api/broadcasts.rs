//! Broadcast channels — one-to-many publisher feeds. Mirrors
//! `sdk/typescript/src/api/broadcasts.ts`.

use rand::RngCore as _;
use serde::Deserialize;

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    BroadcastChannel, BroadcastCreateRequest, BroadcastMessage, BroadcastQueryParams,
    BroadcastSubscribeRequest, BroadcastSubscriber,
};
use crate::util::encode;

#[derive(Deserialize)]
struct BroadcastListResponse {
    #[serde(default)]
    broadcasts: Option<Vec<BroadcastChannel>>,
}

#[derive(Deserialize)]
struct BroadcastSubscribersResponse {
    #[serde(default)]
    subscribers: Vec<BroadcastSubscriber>,
}

#[derive(Deserialize)]
struct BroadcastMessagesResponse {
    #[serde(default)]
    messages: Option<Vec<BroadcastMessage>>,
}

/// One-to-many broadcast channels (REST surface).
#[derive(Clone)]
pub struct BroadcastsApi {
    http: HttpClient,
}

impl BroadcastsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// List broadcast channels.
    pub async fn list(
        &self,
        params: Option<&BroadcastQueryParams>,
    ) -> Result<Vec<BroadcastChannel>> {
        let query = broadcast_query(params);
        let result: BroadcastListResponse = self.http.get("/broadcasts", &query).await?;
        Ok(result.broadcasts.unwrap_or_default())
    }

    /// Create a broadcast channel. A `broadcastId` is generated client-side when
    /// the request omits one.
    pub async fn create(&self, request: BroadcastCreateRequest) -> Result<BroadcastChannel> {
        let mut body = request;
        if body.broadcast_id.is_none() {
            body.broadcast_id = Some(next_client_id("bcast"));
        }
        if let Some(owner) = body.owner.clone() {
            return self
                .http
                .post_directory_auth_as("/broadcasts", &owner, Some(&body))
                .await;
        }
        self.http
            .post_directory_auth("/broadcasts", Some(&body))
            .await
    }

    /// Fetch a broadcast channel by id.
    pub async fn get(&self, broadcast_id: &str) -> Result<BroadcastChannel> {
        self.http
            .get(&format!("/broadcasts/{}", encode(broadcast_id)), &[])
            .await
    }

    /// Update a broadcast channel. The update is a partial object (TS
    /// `Partial<BroadcastChannel>`), so it is passed as a free-form JSON value.
    pub async fn update(
        &self,
        broadcast_id: &str,
        update: &serde_json::Value,
        actor: Option<&str>,
    ) -> Result<BroadcastChannel> {
        let path = format!("/broadcasts/{}", encode(broadcast_id));
        if let Some(actor) = actor {
            return self
                .http
                .put_directory_auth_as(&path, actor, Some(update))
                .await;
        }
        self.http.put_directory_auth(&path, Some(update)).await
    }

    /// Delete a broadcast channel.
    pub async fn remove(&self, broadcast_id: &str, actor: Option<&str>) -> Result<()> {
        let path = format!("/broadcasts/{}", encode(broadcast_id));
        if let Some(actor) = actor {
            return self
                .http
                .delete_directory_auth_as(&path, actor, None::<&serde_json::Value>)
                .await;
        }
        self.http
            .delete_directory_auth(&path, None::<&serde_json::Value>)
            .await
    }

    /// Add a publisher to a broadcast channel.
    pub async fn add_publisher(&self, broadcast_id: &str, agent_id: &str) -> Result<()> {
        let body = serde_json::json!({ "agentId": agent_id });
        self.http
            .post_directory_auth(
                &format!("/broadcasts/{}/publishers", encode(broadcast_id)),
                Some(&body),
            )
            .await
    }

    /// Remove a publisher from a broadcast channel.
    pub async fn remove_publisher(&self, broadcast_id: &str, agent_id: &str) -> Result<()> {
        self.http
            .delete_directory_auth(
                &format!(
                    "/broadcasts/{}/publishers/{}",
                    encode(broadcast_id),
                    encode(agent_id)
                ),
                None::<&serde_json::Value>,
            )
            .await
    }

    /// Subscribe to a broadcast channel.
    pub async fn subscribe(
        &self,
        broadcast_id: &str,
        request: Option<BroadcastSubscribeRequest>,
    ) -> Result<BroadcastSubscriber> {
        let body = request.unwrap_or_default();
        let path = format!("/broadcasts/{}/subscribe", encode(broadcast_id));
        if let Some(agent_id) = body.agent_id.clone() {
            return self
                .http
                .post_directory_auth_as(&path, &agent_id, Some(&body))
                .await;
        }
        self.http.post_directory_auth(&path, Some(&body)).await
    }

    /// Unsubscribe from a broadcast channel.
    pub async fn unsubscribe(&self, broadcast_id: &str, agent_id: Option<&str>) -> Result<()> {
        let path = format!("/broadcasts/{}/subscribe", encode(broadcast_id));
        if let Some(agent_id) = agent_id {
            return self
                .http
                .delete_directory_auth_as(&path, agent_id, None::<&serde_json::Value>)
                .await;
        }
        self.http
            .delete_directory_auth(&path, None::<&serde_json::Value>)
            .await
    }

    /// List a broadcast channel's subscribers.
    pub async fn subscribers(
        &self,
        broadcast_id: &str,
        actor: Option<&str>,
    ) -> Result<Vec<BroadcastSubscriber>> {
        let path = format!("/broadcasts/{}/subscribers", encode(broadcast_id));
        let result: BroadcastSubscribersResponse = if let Some(actor) = actor {
            self.http.get_directory_auth_as(&path, actor, &[]).await?
        } else {
            self.http.get_directory_auth(&path, &[]).await?
        };
        Ok(result.subscribers)
    }

    /// Remove a subscriber from a broadcast channel.
    pub async fn remove_subscriber(
        &self,
        broadcast_id: &str,
        agent_id: &str,
        actor: Option<&str>,
    ) -> Result<()> {
        let path = format!(
            "/broadcasts/{}/subscribers/{}",
            encode(broadcast_id),
            encode(agent_id)
        );
        if let Some(actor) = actor {
            return self
                .http
                .delete_directory_auth_as(&path, actor, None::<&serde_json::Value>)
                .await;
        }
        self.http
            .delete_directory_auth(&path, None::<&serde_json::Value>)
            .await
    }

    /// List messages on a broadcast channel.
    ///
    /// The TS SDK can attach an `X-Payment-Authorization` header here; the Rust
    /// directory-auth helpers do not carry extra headers, so only the `agentId`,
    /// `limit`, and `offset` query parameters are supported.
    pub async fn list_messages(
        &self,
        broadcast_id: &str,
        agent_id: Option<&str>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<BroadcastMessage>> {
        let path = format!("/broadcasts/{}/messages", encode(broadcast_id));
        let mut query: Vec<(String, String)> = Vec::new();
        if let Some(limit) = limit {
            query.push(("limit".into(), limit.to_string()));
        }
        if let Some(offset) = offset {
            query.push(("offset".into(), offset.to_string()));
        }
        let result: BroadcastMessagesResponse = if let Some(agent_id) = agent_id {
            self.http
                .get_directory_auth_as(&path, agent_id, &query)
                .await?
        } else {
            self.http.get_directory_auth(&path, &query).await?
        };
        Ok(result.messages.unwrap_or_default())
    }

    /// Post a message to a broadcast channel. A `messageId` is generated
    /// client-side when the message omits one.
    pub async fn post_message(
        &self,
        broadcast_id: &str,
        message: BroadcastMessage,
    ) -> Result<BroadcastMessage> {
        let mut body = message;
        if body.message_id.is_none() {
            body.message_id = Some(next_client_id("bmsg"));
        }
        let path = format!("/broadcasts/{}/messages", encode(broadcast_id));
        if let Some(publisher) = body.publisher.clone() {
            return self
                .http
                .post_directory_auth_as(&path, &publisher, Some(&body))
                .await;
        }
        self.http.post_directory_auth(&path, Some(&body)).await
    }

    /// Delete a message from a broadcast channel.
    pub async fn delete_message(
        &self,
        broadcast_id: &str,
        message_id: &str,
        actor: Option<&str>,
    ) -> Result<()> {
        let path = format!(
            "/broadcasts/{}/messages/{}",
            encode(broadcast_id),
            encode(message_id)
        );
        if let Some(actor) = actor {
            return self
                .http
                .delete_directory_auth_as(&path, actor, None::<&serde_json::Value>)
                .await;
        }
        self.http
            .delete_directory_auth(&path, None::<&serde_json::Value>)
            .await
    }

    /// Stream a broadcast over WebSocket. Signed with directory auth when an
    /// `agent_id` is supplied.
    pub fn stream(
        &self,
        broadcast_id: &str,
        agent_id: Option<&str>,
        limit: Option<i64>,
        payment_authorization: Option<&str>,
    ) -> crate::websocket::TinyPlaceWebSocket {
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(agent_id) = agent_id {
            query.push(("X-Agent-ID", agent_id.to_string()));
        }
        if let Some(limit) = limit {
            query.push(("limit", limit.to_string()));
        }
        if let Some(payment_authorization) = payment_authorization {
            query.push(("paymentAuthorization", payment_authorization.to_string()));
        }
        let path = format!("/broadcasts/{}/stream", crate::util::encode(broadcast_id));
        self.http.websocket(
            &crate::util::append_query(&path, &query),
            agent_id.is_some(),
        )
    }
}

fn broadcast_query(params: Option<&BroadcastQueryParams>) -> Vec<(String, String)> {
    let mut query: Vec<(String, String)> = Vec::new();
    let Some(params) = params else {
        return query;
    };
    if let Some(q) = &params.q {
        query.push(("q".into(), q.clone()));
    }
    if let Some(tag) = &params.tag {
        query.push(("tag".into(), tag.clone()));
    }
    if let Some(tags) = &params.tags {
        for tag in tags {
            query.push(("tags".into(), tag.clone()));
        }
    }
    if let Some(owner) = &params.owner {
        query.push(("owner".into(), owner.clone()));
    }
    if let Some(visibility) = &params.visibility {
        query.push(("visibility".into(), visibility.clone()));
    }
    if let Some(payment_type) = &params.payment_type {
        query.push(("paymentType".into(), payment_type.clone()));
    }
    if let Some(sort) = &params.sort {
        query.push(("sort".into(), sort.clone()));
    }
    if let Some(limit) = params.limit {
        query.push(("limit".into(), limit.to_string()));
    }
    query
}

/// Generate a client-side id `<prefix>_<base36-ts>_<hex>`, matching the TS
/// `nextClientId`.
fn next_client_id(prefix: &str) -> String {
    let mut random = [0u8; 6];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let suffix: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{prefix}_{}_{suffix}", to_base36(millis))
}

/// Lower-case base36 of a non-negative integer (`Number.toString(36)`).
fn to_base36(mut value: u128) -> String {
    if value == 0 {
        return "0".to_string();
    }
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut out = Vec::new();
    while value > 0 {
        out.push(DIGITS[(value % 36) as usize]);
        value /= 36;
    }
    out.reverse();
    String::from_utf8(out).expect("base36 digits are ascii")
}
