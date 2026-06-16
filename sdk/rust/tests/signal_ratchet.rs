//! Double Ratchet end-to-end tests: bootstrap two sessions via X3DH, then
//! exchange messages (back-and-forth + out-of-order) and assert they decrypt.

use tinyplace::signal::crypto::{ed25519_seed_to_x25519_keypair, generate_x25519_keypair};
use tinyplace::signal::ratchet::{ratchet_decrypt, ratchet_encrypt};
use tinyplace::signal::store::SessionState;
use tinyplace::signal::x3dh::{build_associated_data, x3dh_initiate, x3dh_respond, X3DHBundle};

/// Bootstrap an (initiator, responder) session pair via X3DH.
fn bootstrap() -> (SessionState, SessionState, Vec<u8>, Vec<u8>) {
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
    let bob_session = x3dh_respond(
        &bob,
        &bob_spk,
        &alice.public_key,
        &init.ephemeral_public_key,
        Some(&bob_otk),
    );

    // AD is direction-scoped: sender_identity || recipient_identity.
    let a_to_b = build_associated_data(&alice.public_key, &bob.public_key);
    let b_to_a = build_associated_data(&bob.public_key, &alice.public_key);
    (init.session, bob_session, a_to_b, b_to_a)
}

#[test]
fn back_and_forth_conversation() {
    let (mut alice, mut bob, a_to_b, b_to_a) = bootstrap();

    // Alice -> Bob
    let m1 = ratchet_encrypt(&mut alice, b"hello bob", &a_to_b).unwrap();
    assert_eq!(
        ratchet_decrypt(&mut bob, &m1, &a_to_b).unwrap(),
        b"hello bob"
    );

    // Bob -> Alice (triggers a DH ratchet on both sides)
    let m2 = ratchet_encrypt(&mut bob, b"hi alice", &b_to_a).unwrap();
    assert_eq!(
        ratchet_decrypt(&mut alice, &m2, &b_to_a).unwrap(),
        b"hi alice"
    );

    // Alice -> Bob again
    let m3 = ratchet_encrypt(&mut alice, b"how are you", &a_to_b).unwrap();
    assert_eq!(
        ratchet_decrypt(&mut bob, &m3, &a_to_b).unwrap(),
        b"how are you"
    );

    // Several in a row from Bob.
    for i in 0..5u8 {
        let msg = vec![i; 10];
        let ct = ratchet_encrypt(&mut bob, &msg, &b_to_a).unwrap();
        assert_eq!(ratchet_decrypt(&mut alice, &ct, &b_to_a).unwrap(), msg);
    }
}

#[test]
fn out_of_order_delivery_uses_skipped_keys() {
    let (mut alice, mut bob, a_to_b, _b_to_a) = bootstrap();

    // Alice sends three; Bob receives them 3rd, 1st, 2nd.
    let m1 = ratchet_encrypt(&mut alice, b"one", &a_to_b).unwrap();
    let m2 = ratchet_encrypt(&mut alice, b"two", &a_to_b).unwrap();
    let m3 = ratchet_encrypt(&mut alice, b"three", &a_to_b).unwrap();

    assert_eq!(ratchet_decrypt(&mut bob, &m3, &a_to_b).unwrap(), b"three");
    assert_eq!(ratchet_decrypt(&mut bob, &m1, &a_to_b).unwrap(), b"one");
    assert_eq!(ratchet_decrypt(&mut bob, &m2, &a_to_b).unwrap(), b"two");
}

#[test]
fn tampered_ciphertext_fails() {
    let (mut alice, mut bob, a_to_b, _b_to_a) = bootstrap();
    let mut m1 = ratchet_encrypt(&mut alice, b"secret", &a_to_b).unwrap();
    let last = m1.ciphertext.len() - 1;
    m1.ciphertext[last] ^= 0x01;
    assert!(ratchet_decrypt(&mut bob, &m1, &a_to_b).is_err());
}
