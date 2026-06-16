//! X3DH tests. The core property: initiator and responder derive the SAME root
//! key — the agreement that bootstraps the Double Ratchet.

use base64::Engine as _;
use tinyplace::signal::crypto::{ed25519_seed_to_x25519_keypair, generate_x25519_keypair};
use tinyplace::signal::keys::generate_signed_pre_key;
use tinyplace::signal::x3dh::{verify_pre_key_signature, x3dh_initiate, x3dh_respond, X3DHBundle};
use tinyplace::LocalSigner;

#[test]
fn initiator_and_responder_agree_with_one_time_prekey() {
    let alice = ed25519_seed_to_x25519_keypair(&[1u8; 32]);
    let bob = ed25519_seed_to_x25519_keypair(&[2u8; 32]);
    let bob_spk = generate_x25519_keypair();
    let bob_otk = generate_x25519_keypair();

    let bundle = X3DHBundle {
        identity_key: bob.public_key,
        signed_pre_key_id: "spk_1".into(),
        signed_pre_key: bob_spk.public_key,
        one_time_pre_key_id: Some("pk_1".into()),
        one_time_pre_key: Some(bob_otk.public_key),
    };

    let init = x3dh_initiate(&alice, &bundle);
    let responder = x3dh_respond(
        &bob,
        &bob_spk,
        &alice.public_key,
        &init.ephemeral_public_key,
        Some(&bob_otk),
    );

    assert_eq!(init.session.root_key, responder.root_key);
    assert_eq!(init.signed_pre_key_id, "spk_1");
    assert_eq!(init.one_time_pre_key_id.as_deref(), Some("pk_1"));
}

#[test]
fn initiator_and_responder_agree_without_one_time_prekey() {
    let alice = ed25519_seed_to_x25519_keypair(&[3u8; 32]);
    let bob = ed25519_seed_to_x25519_keypair(&[4u8; 32]);
    let bob_spk = generate_x25519_keypair();

    let bundle = X3DHBundle {
        identity_key: bob.public_key,
        signed_pre_key_id: "spk_1".into(),
        signed_pre_key: bob_spk.public_key,
        one_time_pre_key_id: None,
        one_time_pre_key: None,
    };

    let init = x3dh_initiate(&alice, &bundle);
    let responder = x3dh_respond(
        &bob,
        &bob_spk,
        &alice.public_key,
        &init.ephemeral_public_key,
        None,
    );

    assert_eq!(init.session.root_key, responder.root_key);
}

#[test]
fn one_time_prekey_changes_the_root_key() {
    // A bundle WITH a one-time prekey must derive a different root than WITHOUT.
    let alice = ed25519_seed_to_x25519_keypair(&[5u8; 32]);
    let bob = ed25519_seed_to_x25519_keypair(&[6u8; 32]);
    let bob_spk = generate_x25519_keypair();
    let bob_otk = generate_x25519_keypair();

    let base = X3DHBundle {
        identity_key: bob.public_key,
        signed_pre_key_id: "spk_1".into(),
        signed_pre_key: bob_spk.public_key,
        one_time_pre_key_id: None,
        one_time_pre_key: None,
    };
    let with_otk = X3DHBundle {
        one_time_pre_key_id: Some("pk_1".into()),
        one_time_pre_key: Some(bob_otk.public_key),
        ..base.clone()
    };

    assert_ne!(
        x3dh_initiate(&alice, &base).session.root_key,
        x3dh_initiate(&alice, &with_otk).session.root_key
    );
}

#[tokio::test]
async fn verify_pre_key_signature_accepts_valid_and_rejects_tampered() {
    let signer = LocalSigner::from_seed(&[9u8; 32]).unwrap();
    let pre_key = generate_signed_pre_key(&signer, "spk_1").await.unwrap();
    let pub_b64 = base64::engine::general_purpose::STANDARD.encode(pre_key.key_pair.public_key);
    let sig_b64 = base64::engine::general_purpose::STANDARD.encode(&pre_key.signature);

    assert!(verify_pre_key_signature(signer.public_key(), &pub_b64, Some(&sig_b64), "spk").is_ok());
    assert!(verify_pre_key_signature(signer.public_key(), &pub_b64, None, "spk").is_err());

    let mut tampered = pre_key.signature.clone();
    tampered[0] ^= 0x01;
    let bad_b64 = base64::engine::general_purpose::STANDARD.encode(&tampered);
    assert!(
        verify_pre_key_signature(signer.public_key(), &pub_b64, Some(&bad_b64), "spk").is_err()
    );
}
