//! End-to-end `SignalSession` tests: two parties, each with their own store,
//! run the X3DH prekey handshake then exchange encrypted messages both ways.

use std::sync::Arc;

use base64::Engine as _;
use tinyplace::signal::crypto::ed25519_seed_to_x25519_keypair;
use tinyplace::signal::keys::{generate_pre_keys, generate_signed_pre_key, serialize_pre_key};
use tinyplace::signal::memory_store::MemorySessionStore;
use tinyplace::signal::session::{
    EncryptedMessage, SignalSession, TYPE_CIPHERTEXT, TYPE_PREKEY_BUNDLE,
};
use tinyplace::signal::store::SessionStore;
use tinyplace::types::{KeyBundle, MessageEnvelope};
use tinyplace::LocalSigner;

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn envelope(message: &EncryptedMessage, from: &str, to: &str) -> MessageEnvelope {
    MessageEnvelope {
        id: "m".into(),
        from: from.into(),
        to: to.into(),
        timestamp: "2026-01-01T00:00:00Z".into(),
        device_id: 1,
        envelope_type: message.message_type.clone(),
        body: message.body.clone(),
        content_hint: None,
        signal: Some(message.signal.clone()),
    }
}

/// Builds Bob's stored prekeys + published bundle. Returns (store, bundle,
/// bob_x25519_identity_pub, bob_ed25519_identity_pub).
async fn bob_setup(
    with_one_time: bool,
) -> (Arc<MemorySessionStore>, KeyBundle, [u8; 32], [u8; 32]) {
    let seed = [2u8; 32];
    let signer = LocalSigner::from_seed(&seed).unwrap();
    let identity = ed25519_seed_to_x25519_keypair(&seed);
    let store = Arc::new(MemorySessionStore::new(identity.clone()));

    let signed = generate_signed_pre_key(&signer, "spk_1").await.unwrap();
    store.store_signed_pre_key(signed.clone()).await.unwrap();
    let signed_ser = serialize_pre_key(&signed);

    let one_time_ser = if with_one_time {
        let one_time = generate_pre_keys(&signer, 1, 1)
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        store.store_pre_key(one_time.clone()).await.unwrap();
        Some(serialize_pre_key(&one_time))
    } else {
        None
    };

    let bundle = KeyBundle {
        agent_id: "bob".into(),
        identity_key: b64(&identity.public_key),
        signed_pre_key: signed_ser,
        one_time_pre_key: one_time_ser,
        updated_at: "2026-01-01T00:00:00Z".into(),
    };
    (store, bundle, identity.public_key, *signer.public_key())
}

async fn run_handshake_and_reply(with_one_time: bool) {
    let alice_seed = [1u8; 32];
    let alice_identity = ed25519_seed_to_x25519_keypair(&alice_seed);
    let alice_store = Arc::new(MemorySessionStore::new(alice_identity.clone()));

    let (bob_store, bundle, bob_x_pub, bob_ed_pub) = bob_setup(with_one_time).await;

    let alice = SignalSession::new(alice_store, alice_identity.public_key);
    let bob = SignalSession::new(bob_store, bob_x_pub);

    // Alice -> Bob: first message runs X3DH and is a PREKEY_BUNDLE.
    let msg1 = alice
        .encrypt(
            "bob",
            &bob_x_pub,
            b"hello bob",
            Some(&bundle),
            Some(&bob_ed_pub),
        )
        .await
        .unwrap();
    assert_eq!(msg1.message_type, TYPE_PREKEY_BUNDLE);
    let env1 = envelope(&msg1, "alice", "bob");
    let got1 = bob
        .decrypt("alice", &alice_identity.public_key, &env1)
        .await
        .unwrap();
    assert_eq!(got1, b"hello bob");

    // Bob -> Alice: reply uses the established session (CIPHERTEXT, no bundle).
    let msg2 = bob
        .encrypt("alice", &alice_identity.public_key, b"hi alice", None, None)
        .await
        .unwrap();
    assert_eq!(msg2.message_type, TYPE_CIPHERTEXT);
    let env2 = envelope(&msg2, "bob", "alice");
    let got2 = alice.decrypt("bob", &bob_x_pub, &env2).await.unwrap();
    assert_eq!(got2, b"hi alice");

    assert!(alice.has_session("bob").await.unwrap());
    assert!(bob.has_session("alice").await.unwrap());
}

#[tokio::test]
async fn end_to_end_with_one_time_prekey() {
    run_handshake_and_reply(true).await;
}

#[tokio::test]
async fn end_to_end_without_one_time_prekey() {
    run_handshake_and_reply(false).await;
}

#[tokio::test]
async fn encrypt_without_session_or_bundle_errors() {
    let identity = ed25519_seed_to_x25519_keypair(&[7u8; 32]);
    let store = Arc::new(MemorySessionStore::new(identity.clone()));
    let session = SignalSession::new(store, identity.public_key);
    let result = session.encrypt("bob", &[9u8; 32], b"hi", None, None).await;
    assert!(result.is_err());
}
