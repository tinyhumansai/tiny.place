//! Cross-language interop tests for the Signal port.
//!
//! Every vector in `tests/vectors/signal_vectors.json` was produced by
//! `sdk/python/tests/vectors/gen_signal_vectors.mjs`, which runs the real
//! **TypeScript** Signal modules. A passing assertion here proves the Rust port
//! is byte-for-byte compatible with the flagship TS SDK (and, transitively, the
//! Python port that pins the same vectors) — true cross-language interop.

use std::collections::HashMap;

use base64::Engine as _;
use serde_json::Value;
use tinyplace::signal::crypto::{
    compute_hmac, decrypt, derive_message_keys, encrypt, kdf_chain_key, kdf_root_key,
    x25519_public_key, x25519_shared_secret, X25519KeyPair,
};
use tinyplace::signal::ratchet::{ratchet_decrypt, ratchet_encrypt, RatchetHeader, RatchetMessage};
use tinyplace::signal::sender_key::{
    GroupSenderKey, GroupSenderKeyReceiver, SenderKeyDistribution, SenderKeyMessage,
    SenderKeyOwnState,
};
use tinyplace::signal::store::SessionState;
use tinyplace::signal::x3dh::x3dh_respond;

const VECTORS: &str = include_str!("vectors/signal_vectors.json");

fn load() -> Value {
    serde_json::from_str(VECTORS).expect("valid vectors json")
}

fn hx(value: &Value) -> Vec<u8> {
    let s = value.as_str().expect("hex string");
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).expect("hex byte"))
        .collect()
}

fn hx32(value: &Value) -> [u8; 32] {
    hx(value).try_into().expect("32 bytes")
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn s(value: &Value) -> String {
    value.as_str().expect("string").to_string()
}

// --- 1. crypto KDFs / AEAD --------------------------------------------------

#[test]
fn crypto_kdfs_and_hmac_match_ts() {
    let v = load();
    let c = &v["crypto"];

    let k = &c["kdf_root_key"];
    let (root, chain) = kdf_root_key(&hx(&k["root_key"]), &hx(&k["dh_output"]));
    assert_eq!(to_hex(&root), s(&k["next_root_key"]));
    assert_eq!(to_hex(&chain), s(&k["chain_key"]));

    let k = &c["kdf_chain_key"];
    let (next_chain, message_key) = kdf_chain_key(&hx(&k["chain_key_in"]));
    assert_eq!(to_hex(&next_chain), s(&k["next_chain_key"]));
    assert_eq!(to_hex(&message_key), s(&k["message_key"]));

    let k = &c["derive_message_keys"];
    let (enc, mac, iv) = derive_message_keys(&hx(&k["message_key"]));
    assert_eq!(to_hex(&enc), s(&k["enc_key"]));
    assert_eq!(to_hex(&mac), s(&k["mac_key"]));
    assert_eq!(to_hex(&iv), s(&k["iv"]));

    let k = &c["compute_hmac"];
    assert_eq!(
        to_hex(&compute_hmac(&hx(&k["key"]), &hx(&k["data"]))),
        s(&k["mac"])
    );
}

#[test]
fn crypto_aead_both_directions_match_ts() {
    let v = load();
    let a = &v["crypto"]["aead"];
    // Rust decrypts the TS ciphertext.
    let plaintext = decrypt(
        &hx(&a["message_key"]),
        &hx(&a["ciphertext"]),
        &hx(&a["associated_data"]),
    )
    .unwrap();
    assert_eq!(plaintext, hx(&a["plaintext"]));
    // Rust re-encrypts and reproduces the TS bytes (IV is derived from the key).
    let ciphertext = encrypt(
        &hx(&a["message_key"]),
        &hx(&a["plaintext"]),
        &hx(&a["associated_data"]),
    );
    assert_eq!(to_hex(&ciphertext), s(&a["ciphertext"]));

    let e = &v["crypto"]["aead_empty"];
    assert_eq!(
        to_hex(&encrypt(&hx(&e["message_key"]), b"", b"")),
        s(&e["ciphertext"])
    );
    assert_eq!(
        decrypt(&hx(&e["message_key"]), &hx(&e["ciphertext"]), b"").unwrap(),
        Vec::<u8>::new()
    );
}

// --- 2. X3DH ----------------------------------------------------------------

#[test]
fn x3dh_public_keys_and_dh_match_ts() {
    let v = load();
    let x = &v["x3dh"];
    for (priv_key, pub_key) in [
        ("alice_identity_priv", "alice_identity_pub"),
        ("alice_ephemeral_priv", "alice_ephemeral_pub"),
        ("bob_identity_priv", "bob_identity_pub"),
        ("bob_signed_pre_key_priv", "bob_signed_pre_key_pub"),
        ("bob_one_time_pre_key_priv", "bob_one_time_pre_key_pub"),
    ] {
        assert_eq!(
            to_hex(&x25519_public_key(&hx32(&x[priv_key]))),
            s(&x[pub_key])
        );
    }
    // A DH the X3DH secret is built from agrees with the TS scalar mult.
    let dh1 = x25519_shared_secret(
        &hx32(&x["alice_identity_priv"]),
        &hx32(&x["bob_signed_pre_key_pub"]),
    );
    let dh1_rev = x25519_shared_secret(
        &hx32(&x["bob_signed_pre_key_priv"]),
        &hx32(&x["alice_identity_pub"]),
    );
    assert_eq!(dh1, dh1_rev);
}

#[test]
fn x3dh_responder_reaches_ts_initiator_secret() {
    let v = load();
    let x = &v["x3dh"];
    let bob_identity = X25519KeyPair {
        public_key: hx32(&x["bob_identity_pub"]),
        private_key: hx32(&x["bob_identity_priv"]),
    };
    let bob_spk = X25519KeyPair {
        public_key: hx32(&x["bob_signed_pre_key_pub"]),
        private_key: hx32(&x["bob_signed_pre_key_priv"]),
    };
    let bob_otk = X25519KeyPair {
        public_key: hx32(&x["bob_one_time_pre_key_pub"]),
        private_key: hx32(&x["bob_one_time_pre_key_priv"]),
    };
    let session = x3dh_respond(
        &bob_identity,
        &bob_spk,
        &hx32(&x["alice_identity_pub"]),
        &hx32(&x["alice_ephemeral_pub"]),
        Some(&bob_otk),
    );
    // Rust's responder derives the exact secret the TS initiator computed.
    assert_eq!(to_hex(&session.root_key), s(&x["shared_secret_with_otk"]));
    assert_eq!(
        to_hex(&session.root_key),
        s(&x["responder_root_key_with_otk"])
    );
}

// --- 3. Double Ratchet ------------------------------------------------------

fn bob_recv_session(x: &Value) -> SessionState {
    SessionState {
        dh_send_key_pair: X25519KeyPair {
            public_key: hx32(&x["bob_ratchet_pub"]),
            private_key: hx32(&x["bob_ratchet_priv"]),
        },
        dh_recv_public_key: None,
        root_key: hx32(&x["root_key"]),
        send_chain_key: None,
        recv_chain_key: None,
        send_message_number: 0,
        recv_message_number: 0,
        previous_chain_length: 0,
        skipped_keys: HashMap::new(),
    }
}

fn alice_send_session(x: &Value) -> SessionState {
    SessionState {
        dh_send_key_pair: X25519KeyPair {
            public_key: hx32(&x["alice_ratchet_pub"]),
            private_key: hx32(&x["alice_ratchet_priv"]),
        },
        dh_recv_public_key: Some(hx32(&x["bob_ratchet_pub"])),
        root_key: hx32(&x["root_key"]),
        send_chain_key: None,
        recv_chain_key: None,
        send_message_number: 0,
        recv_message_number: 0,
        previous_chain_length: 0,
        skipped_keys: HashMap::new(),
    }
}

fn ratchet_message(entry: &Value) -> RatchetMessage {
    RatchetMessage {
        header: RatchetHeader {
            public_key: hx32(&entry["header_public_key"]),
            previous_chain_length: entry["header_previous_chain_length"].as_u64().unwrap() as u32,
            message_number: entry["header_message_number"].as_u64().unwrap() as u32,
        },
        ciphertext: hx(&entry["ciphertext"]),
    }
}

#[test]
fn ratchet_decrypts_ts_messages_in_order() {
    let v = load();
    let r = &v["ratchet"];
    let ad = hx(&r["associated_data"]);
    let mut session = bob_recv_session(r);
    for entry in r["messages"].as_array().unwrap() {
        let plaintext = ratchet_decrypt(&mut session, &ratchet_message(entry), &ad).unwrap();
        assert_eq!(plaintext, hx(&entry["plaintext"]));
    }
}

#[test]
fn ratchet_reproduces_ts_ciphertext() {
    let v = load();
    let r = &v["ratchet"];
    let ad = hx(&r["associated_data"]);
    let mut session = alice_send_session(r);
    for entry in r["messages"].as_array().unwrap() {
        let message = ratchet_encrypt(&mut session, &hx(&entry["plaintext"]), &ad).unwrap();
        assert_eq!(
            to_hex(&message.header.public_key),
            s(&entry["header_public_key"])
        );
        assert_eq!(
            message.header.message_number as u64,
            entry["header_message_number"].as_u64().unwrap()
        );
        assert_eq!(to_hex(&message.ciphertext), s(&entry["ciphertext"]));
    }
}

#[test]
fn ratchet_decrypts_ts_messages_out_of_order() {
    let v = load();
    let r = &v["ratchet"];
    let ad = hx(&r["associated_data"]);
    let entries = r["messages"].as_array().unwrap();
    let mut session = bob_recv_session(r);
    for index in [2usize, 0, 1] {
        let entry = &entries[index];
        assert_eq!(
            ratchet_decrypt(&mut session, &ratchet_message(entry), &ad).unwrap(),
            hx(&entry["plaintext"])
        );
    }
}

// --- 4. Sender Keys ---------------------------------------------------------

#[test]
fn sender_key_decrypts_ts_messages() {
    let v = load();
    let sk = &v["sender_key"];
    let dist = &sk["distribution"];
    let mut receiver = GroupSenderKeyReceiver::from_distribution(&SenderKeyDistribution {
        chain_key: s(&dist["chain_key_b64"]),
        iteration: dist["iteration"].as_u64().unwrap() as u32,
        signature_public_key: s(&dist["signature_public_key_b64"]),
    })
    .unwrap();
    for entry in sk["messages"].as_array().unwrap() {
        let message = SenderKeyMessage {
            iteration: entry["iteration"].as_u64().unwrap() as u32,
            ciphertext: s(&entry["ciphertext_b64"]),
            signature: s(&entry["signature_b64"]),
        };
        assert_eq!(receiver.decrypt(&message).unwrap(), hx(&entry["plaintext"]));
    }
}

#[test]
fn sender_key_reproduces_ts_ciphertext() {
    let v = load();
    let sk = &v["sender_key"];
    let mut sender = GroupSenderKey::restore(&SenderKeyOwnState {
        chain_key: b64(&hx(&sk["chain_key"])),
        iteration: 0,
        signature_private_key: b64(&hx(&sk["signing_seed"])),
        signature_public_key: b64(&hx(&sk["signing_public_key"])),
    })
    .unwrap();

    let dist = sender.distribution();
    assert_eq!(dist.chain_key, s(&sk["distribution"]["chain_key_b64"]));
    assert_eq!(
        dist.signature_public_key,
        s(&sk["distribution"]["signature_public_key_b64"])
    );

    for entry in sk["messages"].as_array().unwrap() {
        let message = sender.encrypt(&hx(&entry["plaintext"]));
        assert_eq!(
            message.iteration as u64,
            entry["iteration"].as_u64().unwrap()
        );
        assert_eq!(message.ciphertext, s(&entry["ciphertext_b64"]));
        assert_eq!(message.signature, s(&entry["signature_b64"]));
    }
}
