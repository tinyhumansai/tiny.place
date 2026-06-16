//! Signal protocol crypto primitives. Mirrors `sdk/typescript/src/signal/crypto.ts`
//! and the Python port, kept byte-compatible for cross-language interop:
//!
//! - **DH:** X25519 (Curve25519)
//! - **Conversions:** Ed25519 seed/pubkey → X25519
//! - **KDF:** HKDF-SHA256 (root key) + HMAC-SHA256 chain ratchet
//! - **AEAD:** AES-256-CBC (PKCS#7) + HMAC-SHA256 truncated to 8 bytes,
//!   Encrypt-then-MAC over `associated_data || ciphertext`.

use aes::Aes256;
use cbc::cipher::block_padding::Pkcs7;
use cbc::cipher::{BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use curve25519_dalek::edwards::CompressedEdwardsY;
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use rand::RngCore as _;
use sha2::{Digest, Sha256, Sha512};
use x25519_dalek::{PublicKey, StaticSecret};

use crate::error::{Error, Result};

type HmacSha256 = Hmac<Sha256>;

const HKDF_INFO: &[u8] = b"WhisperRatchet";
const MESSAGE_KEY_INFO: &[u8] = b"WhisperMessageKeys";
const CHAIN_KEY_SEED_MESSAGE: &[u8] = &[0x01];
const CHAIN_KEY_SEED_CHAIN: &[u8] = &[0x02];

/// An X25519 (Curve25519) key pair, raw 32-byte keys.
#[derive(Debug, Clone)]
pub struct X25519KeyPair {
    pub public_key: [u8; 32],
    pub private_key: [u8; 32],
}

/// Generate a fresh random X25519 key pair.
pub fn generate_x25519_keypair() -> X25519KeyPair {
    let mut private_key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut private_key);
    let public_key = x25519_public_key(&private_key);
    X25519KeyPair {
        public_key,
        private_key,
    }
}

/// The X25519 public key for a raw private key (clamped basepoint multiply).
pub fn x25519_public_key(private_key: &[u8; 32]) -> [u8; 32] {
    let secret = StaticSecret::from(*private_key);
    PublicKey::from(&secret).to_bytes()
}

/// Compute the X25519 shared secret for `private_key` and `public_key`.
pub fn x25519_shared_secret(private_key: &[u8; 32], public_key: &[u8; 32]) -> [u8; 32] {
    let secret = StaticSecret::from(*private_key);
    let public = PublicKey::from(*public_key);
    secret.diffie_hellman(&public).to_bytes()
}

/// Derive the X25519 private scalar from an Ed25519 seed: `sha512(seed)[..32]`
/// with the standard Curve25519 clamping.
pub fn ed25519_seed_to_x25519_private(seed: &[u8; 32]) -> [u8; 32] {
    let hash = Sha512::digest(seed);
    let mut scalar = [0u8; 32];
    scalar.copy_from_slice(&hash[..32]);
    scalar[0] &= 248;
    scalar[31] &= 127;
    scalar[31] |= 64;
    scalar
}

/// Derive the X25519 key pair from an Ed25519 seed.
pub fn ed25519_seed_to_x25519_keypair(seed: &[u8; 32]) -> X25519KeyPair {
    let private_key = ed25519_seed_to_x25519_private(seed);
    let public_key = x25519_public_key(&private_key);
    X25519KeyPair {
        public_key,
        private_key,
    }
}

/// Convert an Ed25519 public key to the corresponding X25519 (Montgomery)
/// public key (`u = (1 + y) / (1 - y)`).
pub fn ed25519_pub_to_x25519_pub(ed_pub: &[u8; 32]) -> Result<[u8; 32]> {
    let point = CompressedEdwardsY(*ed_pub)
        .decompress()
        .ok_or_else(|| Error::InvalidArgument("invalid Ed25519 public key".into()))?;
    Ok(point.to_montgomery().to_bytes())
}

/// Derive the next root key and chain key from the current root key and a fresh
/// DH output. `HKDF-SHA256(ikm = dh_output, salt = root_key, info)`.
pub fn kdf_root_key(root_key: &[u8], dh_output: &[u8]) -> ([u8; 32], [u8; 32]) {
    let output = hkdf_sha256(dh_output, Some(root_key), HKDF_INFO, 64);
    let mut next_root = [0u8; 32];
    let mut chain = [0u8; 32];
    next_root.copy_from_slice(&output[..32]);
    chain.copy_from_slice(&output[32..64]);
    (next_root, chain)
}

/// Advance a chain key, returning `(next_chain_key, message_key)`.
pub fn kdf_chain_key(chain_key: &[u8]) -> ([u8; 32], [u8; 32]) {
    let next_chain = compute_hmac(chain_key, CHAIN_KEY_SEED_CHAIN);
    let message_key = compute_hmac(chain_key, CHAIN_KEY_SEED_MESSAGE);
    (next_chain, message_key)
}

/// Derive `(enc_key[32], mac_key[32], iv[16])` from a message key.
pub fn derive_message_keys(message_key: &[u8]) -> ([u8; 32], [u8; 32], [u8; 16]) {
    let output = hkdf_sha256(message_key, Some(&[0u8; 32]), MESSAGE_KEY_INFO, 80);
    let mut enc = [0u8; 32];
    let mut mac = [0u8; 32];
    let mut iv = [0u8; 16];
    enc.copy_from_slice(&output[..32]);
    mac.copy_from_slice(&output[32..64]);
    iv.copy_from_slice(&output[64..80]);
    (enc, mac, iv)
}

/// HMAC-SHA256 of `data` under `key`.
pub fn compute_hmac(key: &[u8], data: &[u8]) -> [u8; 32] {
    let mut mac = <HmacSha256 as Mac>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(data);
    mac.finalize().into_bytes().into()
}

/// Encrypt-then-MAC: AES-256-CBC(enc, iv) then append `HMAC-SHA256(mac, ad ||
/// ciphertext)[..8]`. Keys/iv are derived from `message_key`.
pub fn encrypt(message_key: &[u8], plaintext: &[u8], associated_data: &[u8]) -> Vec<u8> {
    let (enc_key, mac_key, iv) = derive_message_keys(message_key);
    let ciphertext = aes_cbc_encrypt(&enc_key, &iv, plaintext);
    let mac = mac_tag(&mac_key, associated_data, &ciphertext);
    let mut result = ciphertext;
    result.extend_from_slice(&mac);
    result
}

/// Verify the MAC and AES-256-CBC-decrypt. Errors on MAC mismatch.
pub fn decrypt(
    message_key: &[u8],
    ciphertext_with_mac: &[u8],
    associated_data: &[u8],
) -> Result<Vec<u8>> {
    if ciphertext_with_mac.len() < 8 {
        return Err(Error::InvalidArgument("ciphertext too short".into()));
    }
    let (enc_key, mac_key, iv) = derive_message_keys(message_key);
    let split = ciphertext_with_mac.len() - 8;
    let ciphertext = &ciphertext_with_mac[..split];
    let received_mac = &ciphertext_with_mac[split..];
    let expected_mac = mac_tag(&mac_key, associated_data, ciphertext);
    if !constant_time_eq(received_mac, &expected_mac) {
        return Err(Error::InvalidArgument("MAC verification failed".into()));
    }
    aes_cbc_decrypt(&enc_key, &iv, ciphertext)
}

// --- internal helpers ------------------------------------------------------

pub(crate) fn hkdf_sha256(ikm: &[u8], salt: Option<&[u8]>, info: &[u8], length: usize) -> Vec<u8> {
    let hk = Hkdf::<Sha256>::new(salt, ikm);
    let mut okm = vec![0u8; length];
    hk.expand(info, &mut okm)
        .expect("HKDF output length within bounds");
    okm
}

fn mac_tag(mac_key: &[u8], associated_data: &[u8], ciphertext: &[u8]) -> [u8; 8] {
    let mut input = Vec::with_capacity(associated_data.len() + ciphertext.len());
    input.extend_from_slice(associated_data);
    input.extend_from_slice(ciphertext);
    let full = compute_hmac(mac_key, &input);
    let mut tag = [0u8; 8];
    tag.copy_from_slice(&full[..8]);
    tag
}

fn aes_cbc_encrypt(key: &[u8; 32], iv: &[u8; 16], plaintext: &[u8]) -> Vec<u8> {
    cbc::Encryptor::<Aes256>::new(&(*key).into(), &(*iv).into())
        .encrypt_padded_vec_mut::<Pkcs7>(plaintext)
}

fn aes_cbc_decrypt(key: &[u8; 32], iv: &[u8; 16], ciphertext: &[u8]) -> Result<Vec<u8>> {
    cbc::Decryptor::<Aes256>::new(&(*key).into(), &(*iv).into())
        .decrypt_padded_vec_mut::<Pkcs7>(ciphertext)
        .map_err(|_| Error::InvalidArgument("AES-CBC unpad failed".into()))
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
