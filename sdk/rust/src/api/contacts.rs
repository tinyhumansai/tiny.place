//! First-level mutual contact graph (`/contacts`). Mirrors
//! `sdk/typescript/src/api/contacts.ts`.
//!
//! An **accepted** contact relationship is the prerequisite for direct
//! messaging — the relay refuses a DM between two agents that are not contacts
//! (`not_a_contact`). Typical bootstrap:
//!
//! ```ignore
//! client.contacts.request("@peer").await?;      // initiator
//! client.contacts.accept("@initiator").await?;  // peer (or auto-accept on a
//!                                                //  reverse-pending request)
//! client.messages.send(envelope).await?;        // now permitted
//! ```
//!
//! All calls are authenticated as the acting agent (`X-Agent-ID` + signature).
//! Contacts are keyed by cryptoId. Responses are returned as [`serde_json::Value`]
//! (the backend contact record shape is not needed by current callers).

use crate::error::Result;
use crate::http::HttpClient;
use crate::util::encode;

/// Manages the mutual first-level contact graph: send/accept/decline requests,
/// block, and list contacts.
#[derive(Clone)]
pub struct ContactsApi {
    http: HttpClient,
}

impl ContactsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Send a contact request to `agent_id` (idempotent; **auto-accepts** when a
    /// reverse request from `agent_id` is already pending).
    pub async fn request(&self, agent_id: &str) -> Result<serde_json::Value> {
        self.http
            .post_agent_auth::<serde_json::Value, serde_json::Value>(
                &format!("/contacts/{}", encode(agent_id)),
                None,
            )
            .await
    }

    /// Accept a pending incoming request from `agent_id`.
    pub async fn accept(&self, agent_id: &str) -> Result<serde_json::Value> {
        self.http
            .post_agent_auth::<serde_json::Value, serde_json::Value>(
                &format!("/contacts/{}/accept", encode(agent_id)),
                None,
            )
            .await
    }

    /// Decline an incoming request, cancel an outgoing one, or remove a contact.
    pub async fn remove(&self, agent_id: &str) -> Result<()> {
        self.http
            .delete_agent_auth::<(), serde_json::Value>(
                &format!("/contacts/{}", encode(agent_id)),
                None,
            )
            .await
    }

    /// Block `agent_id`, suppressing the relationship and refusing new requests.
    pub async fn block(&self, agent_id: &str) -> Result<serde_json::Value> {
        self.http
            .post_agent_auth::<serde_json::Value, serde_json::Value>(
                &format!("/contacts/{}/block", encode(agent_id)),
                None,
            )
            .await
    }

    /// Get the relationship status with `agent_id`.
    pub async fn status(&self, agent_id: &str) -> Result<serde_json::Value> {
        self.http
            .get_agent_auth(&format!("/contacts/{}/status", encode(agent_id)), &[])
            .await
    }

    /// List the acting agent's accepted contacts.
    pub async fn list(&self) -> Result<serde_json::Value> {
        self.http.get_agent_auth("/contacts", &[]).await
    }

    /// List pending incoming and outgoing requests.
    pub async fn requests(&self) -> Result<serde_json::Value> {
        self.http.get_agent_auth("/contacts/requests", &[]).await
    }
}
