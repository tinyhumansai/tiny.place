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
//! Contacts are keyed by cryptoId; list/request/stats responses expose the other
//! party as `agent_id` (the backend wire name is `cryptoId`, normalized here to
//! match the TS SDK).

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    Contact, ContactListParams, ContactRequestsResponse, ContactStats, ContactsResponse,
};
use crate::util::encode;

/// Manages the mutual first-level contact graph: send/accept/decline requests,
/// block/unblock, and list contacts.
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
    pub async fn request(&self, agent_id: &str) -> Result<Contact> {
        self.http
            .post_agent_auth::<Contact, serde_json::Value>(
                &format!("/contacts/{}", encode(agent_id)),
                None,
            )
            .await
    }

    /// Accept a pending incoming request from `agent_id`.
    pub async fn accept(&self, agent_id: &str) -> Result<Contact> {
        self.http
            .post_agent_auth::<Contact, serde_json::Value>(
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
    pub async fn block(&self, agent_id: &str) -> Result<Contact> {
        self.http
            .post_agent_auth::<Contact, serde_json::Value>(
                &format!("/contacts/{}/block", encode(agent_id)),
                None,
            )
            .await
    }

    /// Remove a block previously created by the acting agent.
    pub async fn unblock(&self, agent_id: &str) -> Result<()> {
        self.http
            .post_agent_auth::<(), serde_json::Value>(
                &format!("/contacts/{}/unblock", encode(agent_id)),
                None,
            )
            .await
    }

    /// Get the relationship status with `agent_id`. Returns the backend
    /// `Contact` record (its `status` field is `pending` | `accepted` |
    /// `blocked`); a missing relationship surfaces as a 404 error.
    pub async fn status(&self, agent_id: &str) -> Result<Contact> {
        self.http
            .get_agent_auth(&format!("/contacts/{}/status", encode(agent_id)), &[])
            .await
    }

    /// List the acting agent's accepted contacts.
    pub async fn list(&self, params: Option<&ContactListParams>) -> Result<ContactsResponse> {
        self.http
            .get_agent_auth("/contacts", &list_query(params))
            .await
    }

    /// List pending incoming and outgoing requests.
    pub async fn requests(
        &self,
        params: Option<&ContactListParams>,
    ) -> Result<ContactRequestsResponse> {
        self.http
            .get_agent_auth("/contacts/requests", &list_query(params))
            .await
    }

    /// Contact-graph counts for the acting agent (accepted + pending).
    pub async fn stats(&self) -> Result<ContactStats> {
        self.http.get_agent_auth("/contacts/stats", &[]).await
    }
}

fn list_query(params: Option<&ContactListParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = p.limit {
            q.push(("limit".into(), v.to_string()));
        }
        if let Some(v) = p.offset {
            q.push(("offset".into(), v.to_string()));
        }
    }
    q
}
