//! Pre-key generation & serialization. Mirrors `sdk/typescript/src/signal/keys.ts`.
//!
//! A pre-key is an X25519 key pair plus the identity key's signature over the
//! base64 string of its public key — the backend verifies
//! `ed25519.Verify(identityPubKey, base64(preKey.publicKey), signature)`.

use crate::crypto::to_base64;
use crate::error::Result;
use crate::signal::crypto::{generate_x25519_keypair, X25519KeyPair};
use crate::signer::Signer;
use crate::types::SignedKey;

/// A pre-key: an X25519 key pair and the identity-key signature over its base64
/// public key. Signed and one-time pre-keys share this shape.
#[derive(Debug, Clone)]
pub struct PreKeyPair {
    pub key_id: String,
    pub key_pair: X25519KeyPair,
    pub signature: Vec<u8>,
}

/// Signed pre-keys have the same shape as one-time pre-keys.
pub type SignedPreKeyPair = PreKeyPair;

/// Generate a signed pre-key with the given id.
pub async fn generate_signed_pre_key(
    signer: &dyn Signer,
    key_id: &str,
) -> Result<SignedPreKeyPair> {
    let key_pair = generate_x25519_keypair();
    let signature = sign_public_key(signer, &key_pair.public_key).await?;
    Ok(PreKeyPair {
        key_id: key_id.to_string(),
        key_pair,
        signature,
    })
}

/// Generate `count` one-time pre-keys with ids `pk_{start_id + i}`.
pub async fn generate_pre_keys(
    signer: &dyn Signer,
    start_id: u64,
    count: usize,
) -> Result<Vec<PreKeyPair>> {
    let mut pre_keys = Vec::with_capacity(count);
    for index in 0..count {
        let key_id = format!("pk_{}", start_id + index as u64);
        let key_pair = generate_x25519_keypair();
        let signature = sign_public_key(signer, &key_pair.public_key).await?;
        pre_keys.push(PreKeyPair {
            key_id,
            key_pair,
            signature,
        });
    }
    Ok(pre_keys)
}

/// Serialize a pre-key (signed or one-time) into the wire form uploaded to
/// `/keys` (`{ keyId, publicKey, signature }`, all base64).
pub fn serialize_pre_key(pre_key: &PreKeyPair) -> SignedKey {
    SignedKey {
        key_id: pre_key.key_id.clone(),
        public_key: to_base64(&pre_key.key_pair.public_key),
        signature: Some(to_base64(&pre_key.signature)),
    }
}

async fn sign_public_key(signer: &dyn Signer, public_key: &[u8]) -> Result<Vec<u8>> {
    signer.sign(to_base64(public_key).as_bytes()).await
}
