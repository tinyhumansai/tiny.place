//! Tests for Signal pre-key generation & serialization. The signature contract
//! (Ed25519 over the base64 public key) is interop-critical — the backend
//! verifies it the same way — so we verify it here with ed25519-dalek directly.

use base64::Engine as _;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use tinyplace::signal::keys::{generate_pre_keys, generate_signed_pre_key, serialize_pre_key};
use tinyplace::LocalSigner;

fn b64(value: &str) -> Vec<u8> {
    base64::engine::general_purpose::STANDARD
        .decode(value)
        .unwrap()
}

fn verify_signature(signer: &LocalSigner, public_key: &[u8], signature: &[u8]) -> bool {
    let verifying = VerifyingKey::from_bytes(signer.public_key()).unwrap();
    let public_key_b64 = base64::engine::general_purpose::STANDARD.encode(public_key);
    let sig = Signature::from_slice(signature).unwrap();
    verifying.verify(public_key_b64.as_bytes(), &sig).is_ok()
}

#[tokio::test]
async fn signed_pre_key_signature_verifies_over_base64_pubkey() {
    let signer = LocalSigner::from_seed(&[1u8; 32]).unwrap();
    let pre_key = generate_signed_pre_key(&signer, "spk_1").await.unwrap();
    assert_eq!(pre_key.key_id, "spk_1");
    assert_eq!(pre_key.key_pair.public_key.len(), 32);
    assert!(verify_signature(
        &signer,
        &pre_key.key_pair.public_key,
        &pre_key.signature
    ));
}

#[tokio::test]
async fn generate_pre_keys_ids_and_count() {
    let signer = LocalSigner::from_seed(&[2u8; 32]).unwrap();
    let pre_keys = generate_pre_keys(&signer, 100, 3).await.unwrap();
    let ids: Vec<&str> = pre_keys.iter().map(|k| k.key_id.as_str()).collect();
    assert_eq!(ids, ["pk_100", "pk_101", "pk_102"]);
    for pre_key in &pre_keys {
        assert!(verify_signature(
            &signer,
            &pre_key.key_pair.public_key,
            &pre_key.signature
        ));
    }
}

#[tokio::test]
async fn serialize_pre_key_round_trips_base64() {
    let signer = LocalSigner::from_seed(&[3u8; 32]).unwrap();
    let pre_key = generate_signed_pre_key(&signer, "spk_2").await.unwrap();
    let serialized = serialize_pre_key(&pre_key);
    assert_eq!(serialized.key_id, "spk_2");
    assert_eq!(b64(&serialized.public_key), pre_key.key_pair.public_key);
    assert_eq!(b64(&serialized.signature.unwrap()), pre_key.signature);
}
