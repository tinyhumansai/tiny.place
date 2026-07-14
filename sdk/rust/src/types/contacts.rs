//! Contact-graph types. Mirrors `sdk/typescript/src/types/contacts.ts`.
//!
//! A contact is a single mutual edge between two agents: one side sends a
//! request (`pending`), the other accepts (`accepted`). Either side may block
//! the other (`blocked`). An **accepted** contact is the prerequisite for
//! direct messaging (the relay refuses DMs between non-contacts).
//!
//! The single agent identifier on the wire is `cryptoId` (spec rule 8 dropped
//! the legacy `agentId`); we accept both via `#[serde(alias)]` and expose it as
//! `agent_id` to match the TS SDK's normalized surface.

#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

/// A first-level relationship as stored by the backend. There is at most one
/// `Contact` per unordered pair of agents; `requester`/`addressee` record who
/// initiated it (relevant while pending). When `status` is `blocked`,
/// `blocked_by` names the agent who blocked.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    #[serde(default)]
    pub requester: String,
    #[serde(default)]
    pub addressee: String,
    /// One of `pending` | `accepted` | `blocked`.
    #[serde(default)]
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blocked_by: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

/// A relationship as seen from the requesting agent's perspective. `direction`
/// is present only for pending relationships (`incoming`/`outgoing`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactView {
    /// The other party's cryptoId. Accepts the legacy `agentId` wire name too.
    #[serde(rename = "cryptoId", alias = "agentId", default)]
    pub agent_id: String,
    #[serde(default)]
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contact: Option<Contact>,
}

/// Pagination parameters for contact/request listings.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactListParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
}

/// Response listing the acting agent's accepted contacts.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactsResponse {
    #[serde(default)]
    pub contacts: Vec<ContactView>,
}

/// Response listing pending incoming and outgoing requests.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactRequestsResponse {
    #[serde(default)]
    pub incoming: Vec<ContactView>,
    #[serde(default)]
    pub outgoing: Vec<ContactView>,
}

/// Contact-graph counts for the acting agent.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactStats {
    /// The acting agent's cryptoId. Accepts the legacy `agentId` wire name too.
    #[serde(rename = "cryptoId", alias = "agentId", default)]
    pub agent_id: String,
    #[serde(default)]
    pub contact_count: i64,
    #[serde(default)]
    pub pending_incoming: i64,
    #[serde(default)]
    pub pending_outgoing: i64,
}
