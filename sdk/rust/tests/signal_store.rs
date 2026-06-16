//! Tests for the in-memory Signal session store.

use std::collections::HashMap;

use tinyplace::signal::crypto::{ed25519_seed_to_x25519_keypair, X25519KeyPair};
use tinyplace::signal::keys::PreKeyPair;
use tinyplace::signal::memory_store::MemorySessionStore;
use tinyplace::signal::store::{skipped_key_id, SessionState, SessionStore};

fn store() -> MemorySessionStore {
    MemorySessionStore::new(ed25519_seed_to_x25519_keypair(&[1u8; 32]))
}

fn pre_key(id: &str) -> PreKeyPair {
    PreKeyPair {
        key_id: id.to_string(),
        key_pair: X25519KeyPair {
            public_key: [2u8; 32],
            private_key: [3u8; 32],
        },
        signature: vec![4u8; 64],
    }
}

fn session_state() -> SessionState {
    SessionState {
        dh_send_key_pair: X25519KeyPair {
            public_key: [5u8; 32],
            private_key: [6u8; 32],
        },
        dh_recv_public_key: None,
        root_key: [7u8; 32],
        send_chain_key: None,
        recv_chain_key: None,
        send_message_number: 0,
        recv_message_number: 0,
        previous_chain_length: 0,
        skipped_keys: HashMap::new(),
    }
}

#[tokio::test]
async fn identity_key_pair_is_the_constructor_key() {
    let expected = ed25519_seed_to_x25519_keypair(&[1u8; 32]);
    let got = store().identity_x25519_key_pair().await.unwrap();
    assert_eq!(got.public_key, expected.public_key);
}

#[tokio::test]
async fn pre_key_store_get_remove_and_list() {
    let store = store();
    assert!(store.pre_key("pk_1").await.unwrap().is_none());
    store.store_pre_key(pre_key("pk_1")).await.unwrap();
    store.store_pre_key(pre_key("pk_2")).await.unwrap();
    assert!(store.pre_key("pk_1").await.unwrap().is_some());
    assert_eq!(store.all_pre_keys().await.unwrap().len(), 2);
    store.remove_pre_key("pk_1").await.unwrap();
    assert!(store.pre_key("pk_1").await.unwrap().is_none());
    assert_eq!(store.all_pre_keys().await.unwrap().len(), 1);
}

#[tokio::test]
async fn signed_pre_key_tracks_active() {
    let store = store();
    assert!(store.active_signed_pre_key().await.is_err());
    store.store_signed_pre_key(pre_key("spk_1")).await.unwrap();
    store.store_signed_pre_key(pre_key("spk_2")).await.unwrap();
    // Latest stored becomes active.
    assert_eq!(store.active_signed_pre_key().await.unwrap().key_id, "spk_2");
    assert!(store.signed_pre_key("spk_1").await.unwrap().is_some());
}

#[tokio::test]
async fn session_store_get_remove() {
    let store = store();
    assert!(store.session("peer").await.unwrap().is_none());
    store.store_session("peer", session_state()).await.unwrap();
    assert!(store.session("peer").await.unwrap().is_some());
    store.remove_session("peer").await.unwrap();
    assert!(store.session("peer").await.unwrap().is_none());
}

#[test]
fn skipped_key_id_format() {
    assert_eq!(skipped_key_id(&[0x00, 0xff, 0x0a], 7), "00ff0a:7");
}
