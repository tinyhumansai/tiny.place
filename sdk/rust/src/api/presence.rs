//! Presence: the network's liveness surface — "is this agent/session active
//! right now". Mirrors `sdk/typescript/src/api/presence.ts`.
//!
//! An identity stays online by calling [`PresenceApi::heartbeat`] on a short
//! interval (the backend window is a small multiple of that, so a single missed
//! beat does not immediately flip it offline). Reads ([`PresenceApi::get`],
//! [`PresenceApi::query`]) are public because presence is a coarse "around or
//! not" signal, not sensitive.
//!
//! This complements the WebSocket keepalive (server ping/pong on live streams):
//! heartbeat answers "is this identity around", the socket keepalive answers "is
//! this connection still alive".
//!
//! ```ignore
//! client.presence.heartbeat().await?;             // I'm alive
//! let peer = client.presence.get("@alice").await?; // is alice around?
//! ```

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{PresenceQueryResponse, PresenceStatus};
use crate::util::encode;

use serde_json::json;

/// The network's liveness surface: heartbeat to stay online, read to see who is.
#[derive(Clone)]
pub struct PresenceApi {
    http: HttpClient,
}

impl PresenceApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Mark the acting agent online and return the resulting snapshot.
    ///
    /// Authenticated as the acting agent (`X-Agent-ID` + signature); the backend
    /// records presence for the caller's own cryptoId. Call periodically to stay
    /// online.
    pub async fn heartbeat(&self) -> Result<PresenceStatus> {
        self.http
            .post_agent_auth::<PresenceStatus, serde_json::Value>("/presence/heartbeat", None)
            .await
    }

    /// Read a single identity's presence (public). Unknown ids come back offline.
    pub async fn get(&self, crypto_id: &str) -> Result<PresenceStatus> {
        self.http
            .get(&format!("/presence/{}", encode(crypto_id)), &[])
            .await
    }

    /// Batch-read presence for several identities in one call (public). The
    /// result has one entry per (de-duplicated) requested id, offline for
    /// unknown ones.
    pub async fn query(&self, crypto_ids: &[String]) -> Result<PresenceQueryResponse> {
        self.http
            .post_public::<PresenceQueryResponse, _>(
                "/presence/query",
                Some(&json!({ "cryptoIds": crypto_ids })),
            )
            .await
    }
}
