//! In-memory [`SessionStore`]. Mirrors `sdk/typescript/src/signal/memory-store.ts`.
//! Suitable for tests and ephemeral sessions; persist with a custom store for
//! durability across restarts.

use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::error::{Error, Result};
use crate::signal::crypto::X25519KeyPair;
use crate::signal::keys::{PreKeyPair, SignedPreKeyPair};
use crate::signal::store::{SessionState, SessionStore};

/// A [`SessionStore`] holding everything in memory.
pub struct MemorySessionStore {
    identity_key_pair: X25519KeyPair,
    signed_pre_keys: Mutex<HashMap<String, SignedPreKeyPair>>,
    pre_keys: Mutex<HashMap<String, PreKeyPair>>,
    sessions: Mutex<HashMap<String, SessionState>>,
    active_signed_pre_key_id: Mutex<Option<String>>,
}

impl MemorySessionStore {
    /// Create a store bound to the given identity X25519 key pair.
    pub fn new(identity_key_pair: X25519KeyPair) -> Self {
        Self {
            identity_key_pair,
            signed_pre_keys: Mutex::new(HashMap::new()),
            pre_keys: Mutex::new(HashMap::new()),
            sessions: Mutex::new(HashMap::new()),
            active_signed_pre_key_id: Mutex::new(None),
        }
    }
}

#[async_trait]
impl SessionStore for MemorySessionStore {
    async fn identity_x25519_key_pair(&self) -> Result<X25519KeyPair> {
        Ok(self.identity_key_pair.clone())
    }

    async fn signed_pre_key(&self, key_id: &str) -> Result<Option<SignedPreKeyPair>> {
        Ok(self.signed_pre_keys.lock().unwrap().get(key_id).cloned())
    }

    async fn active_signed_pre_key(&self) -> Result<SignedPreKeyPair> {
        let active = self.active_signed_pre_key_id.lock().unwrap().clone();
        let key_id =
            active.ok_or_else(|| Error::InvalidArgument("No active signed pre-key".into()))?;
        self.signed_pre_keys
            .lock()
            .unwrap()
            .get(&key_id)
            .cloned()
            .ok_or_else(|| Error::InvalidArgument("Active signed pre-key not found".into()))
    }

    async fn store_signed_pre_key(&self, pre_key: SignedPreKeyPair) -> Result<()> {
        let key_id = pre_key.key_id.clone();
        self.signed_pre_keys
            .lock()
            .unwrap()
            .insert(key_id.clone(), pre_key);
        *self.active_signed_pre_key_id.lock().unwrap() = Some(key_id);
        Ok(())
    }

    async fn pre_key(&self, key_id: &str) -> Result<Option<PreKeyPair>> {
        Ok(self.pre_keys.lock().unwrap().get(key_id).cloned())
    }

    async fn remove_pre_key(&self, key_id: &str) -> Result<()> {
        self.pre_keys.lock().unwrap().remove(key_id);
        Ok(())
    }

    async fn store_pre_key(&self, pre_key: PreKeyPair) -> Result<()> {
        self.pre_keys
            .lock()
            .unwrap()
            .insert(pre_key.key_id.clone(), pre_key);
        Ok(())
    }

    async fn all_pre_keys(&self) -> Result<Vec<PreKeyPair>> {
        Ok(self.pre_keys.lock().unwrap().values().cloned().collect())
    }

    async fn session(&self, address: &str) -> Result<Option<SessionState>> {
        Ok(self.sessions.lock().unwrap().get(address).cloned())
    }

    async fn store_session(&self, address: &str, session: SessionState) -> Result<()> {
        self.sessions
            .lock()
            .unwrap()
            .insert(address.to_string(), session);
        Ok(())
    }

    async fn remove_session(&self, address: &str) -> Result<()> {
        self.sessions.lock().unwrap().remove(address);
        Ok(())
    }
}
