//! Encoding and canonicalization helpers shared across the SDK.
//!
//! Mirrors `sdk/typescript/src/crypto.ts`: agent ids are the base58 (Solana
//! address) encoding of the Ed25519 public key, signatures are base64, and
//! signed canonical payloads use a stable (recursively key-sorted) JSON form.

use base64::Engine as _;
use sha2::{Digest, Sha256};

/// Standard base64 (with padding), matching the TS SDK's `btoa` output.
pub(crate) fn to_base64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// URL-safe base64 without padding, matching the TS SDK's `toBase64Url`.
pub(crate) fn to_base64_url(value: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(value.as_bytes())
}

/// Decode standard base64 (accepts padded input).
pub fn from_base64(value: &str) -> Result<Vec<u8>, base64::DecodeError> {
    base64::engine::general_purpose::STANDARD.decode(value)
}

/// Lower-case hex encoding.
pub(crate) fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// The base64 encoding of an Ed25519 public key.
pub fn public_key_to_base64(public_key: &[u8]) -> String {
    to_base64(public_key)
}

/// The lower-case hex encoding of an Ed25519 public key.
pub fn public_key_to_hex(public_key: &[u8]) -> String {
    to_hex(public_key)
}

/// The base58 (Solana address) encoding of an Ed25519 public key.
pub fn public_key_to_solana_address(public_key: &[u8]) -> String {
    bs58::encode(public_key).into_string()
}

/// The agent id derived from an Ed25519 public key (its base58 Solana address).
pub fn derive_crypto_id(public_key: &[u8]) -> String {
    public_key_to_solana_address(public_key)
}

/// SHA-256 of the input, hex-encoded.
pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    to_hex(&hasher.finalize())
}

/// Build a canonical payload string `{"action":..,"fields":..}` with all object
/// keys recursively sorted, matching the TS `canonicalPayload` / `stableStringify`.
pub fn canonical_payload(action: &str, fields: serde_json::Value) -> String {
    let value = serde_json::json!({ "action": action, "fields": fields });
    stable_stringify(&value)
}

/// Serialize a JSON value with all object keys recursively sorted and no
/// whitespace — the stable form the backend signs over.
pub fn stable_stringify(value: &serde_json::Value) -> String {
    let sorted = sort_value(value);
    serde_json::to_string(&sorted).expect("json serialization cannot fail")
}

fn sort_value(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Array(items) => {
            serde_json::Value::Array(items.iter().map(sort_value).collect())
        }
        serde_json::Value::Object(map) => {
            // BTreeMap keeps keys sorted, matching JS `Object.keys().sort()`.
            let mut sorted = serde_json::Map::new();
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for key in keys {
                sorted.insert(key.clone(), sort_value(&map[key]));
            }
            serde_json::Value::Object(sorted)
        }
        other => other.clone(),
    }
}

/// Decode a base58 string into bytes (used for Solana secret keys).
pub fn decode_base58(value: &str) -> Result<Vec<u8>, bs58::decode::Error> {
    bs58::decode(value).into_vec()
}

/// Derive the base64 Ed25519 public key from a Solana `cryptoId` (base58
/// address). A Solana address IS the base58 encoding of the 32-byte ed25519
/// public key, so the stored/signed `publicKey` is just that same key re-encoded
/// as base64. Mirrors the TS `cryptoIdToPublicKeyBase64`.
pub fn crypto_id_to_public_key_base64(crypto_id: &str) -> crate::error::Result<String> {
    let bytes = decode_base58(crypto_id).map_err(|err| {
        crate::error::Error::InvalidArgument(format!("cryptoId is not valid base58: {err}"))
    })?;
    if bytes.len() != 32 {
        return Err(crate::error::Error::InvalidArgument(format!(
            "cryptoId does not decode to a 32-byte Ed25519 public key (got {} bytes)",
            bytes.len()
        )));
    }
    Ok(public_key_to_base64(&bytes))
}
