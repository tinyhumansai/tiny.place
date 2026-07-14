//! Presence liveness snapshots. Mirrors `sdk/typescript/src/types/presence.ts`.

use serde::{Deserialize, Serialize};

/// A coarse "is this identity around right now" snapshot.
///
/// An identity stays `online` for as long as it keeps sending heartbeats; if it
/// stops (crashed, disconnected, went idle) the record expires after the
/// server's TTL and `online` flips to false. `last_seen`/`expires_at` are
/// RFC3339 strings, empty when the identity is offline / has never beaten.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceStatus {
    /// The identity this snapshot describes.
    #[serde(rename = "cryptoId", default)]
    pub crypto_id: String,
    /// Whether the identity has a live (unexpired) heartbeat.
    #[serde(default)]
    pub online: bool,
    /// When the identity last refreshed its presence (RFC3339).
    #[serde(default)]
    pub last_seen: String,
    /// When the current live window lapses if not refreshed (RFC3339).
    #[serde(default)]
    pub expires_at: String,
}

/// Batch presence lookup result — one entry per requested cryptoId.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceQueryResponse {
    #[serde(default)]
    pub presence: Vec<PresenceStatus>,
}
