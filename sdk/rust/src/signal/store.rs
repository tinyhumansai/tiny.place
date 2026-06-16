//! Session-store trait + Double Ratchet session state. Mirrors
//! `sdk/typescript/src/signal/store.ts`.

use std::collections::HashMap;

use async_trait::async_trait;

use crate::crypto::to_hex;
use crate::error::Result;
use crate::signal::crypto::X25519KeyPair;
use crate::signal::keys::{PreKeyPair, SignedPreKeyPair};

/// Per-peer Double Ratchet state, persisted by a [`SessionStore`].
#[derive(Debug, Clone)]
pub struct SessionState {
    pub dh_send_key_pair: X25519KeyPair,
    pub dh_recv_public_key: Option<[u8; 32]>,
    pub root_key: [u8; 32],
    pub send_chain_key: Option<[u8; 32]>,
    pub recv_chain_key: Option<[u8; 32]>,
    pub send_message_number: u32,
    pub recv_message_number: u32,
    pub previous_chain_length: u32,
    /// Skipped message keys, keyed by [`skipped_key_id`].
    pub skipped_keys: HashMap<String, [u8; 32]>,
}

/// Persistence for identity/pre-keys and per-peer ratchet sessions.
#[async_trait]
pub trait SessionStore: Send + Sync {
    async fn identity_x25519_key_pair(&self) -> Result<X25519KeyPair>;
    async fn signed_pre_key(&self, key_id: &str) -> Result<Option<SignedPreKeyPair>>;
    async fn active_signed_pre_key(&self) -> Result<SignedPreKeyPair>;
    async fn store_signed_pre_key(&self, pre_key: SignedPreKeyPair) -> Result<()>;
    async fn pre_key(&self, key_id: &str) -> Result<Option<PreKeyPair>>;
    async fn remove_pre_key(&self, key_id: &str) -> Result<()>;
    async fn store_pre_key(&self, pre_key: PreKeyPair) -> Result<()>;
    async fn all_pre_keys(&self) -> Result<Vec<PreKeyPair>>;
    async fn session(&self, address: &str) -> Result<Option<SessionState>>;
    async fn store_session(&self, address: &str, session: SessionState) -> Result<()>;
    async fn remove_session(&self, address: &str) -> Result<()>;
}

/// Stable id for a skipped message key: `hex(ratchet_public_key):message_number`.
pub fn skipped_key_id(ratchet_public_key: &[u8], message_number: u32) -> String {
    format!("{}:{}", to_hex(ratchet_public_key), message_number)
}
