//! X3DH key agreement. Mirrors `sdk/typescript/src/signal/x3dh.ts`.

use std::collections::HashMap;

use ed25519_dalek::{Signature, Verifier as _, VerifyingKey};

use crate::crypto::from_base64;
use crate::error::{Error, Result};
use crate::signal::crypto::{
    generate_x25519_keypair, hkdf_sha256, x25519_shared_secret, X25519KeyPair,
};
use crate::signal::store::SessionState;

const X3DH_INFO: &[u8] = b"WhisperText";
const PADDING: [u8; 32] = [0xff; 32];

/// A peer's fetched key bundle (all X25519 public keys).
#[derive(Debug, Clone)]
pub struct X3DHBundle {
    pub identity_key: [u8; 32],
    pub signed_pre_key_id: String,
    pub signed_pre_key: [u8; 32],
    pub one_time_pre_key_id: Option<String>,
    pub one_time_pre_key: Option<[u8; 32]>,
}

/// The result of initiating X3DH: the new session plus the public values the
/// responder needs (carried in the first message's prekey header).
#[derive(Debug, Clone)]
pub struct X3DHInitResult {
    pub session: SessionState,
    pub ephemeral_public_key: [u8; 32],
    pub signed_pre_key_id: String,
    pub one_time_pre_key_id: Option<String>,
}

/// Verify a fetched pre-key was signed by the peer's long-term Ed25519 identity
/// key, exactly as the backend does: `ed25519.Verify(identityPubKey,
/// base64(preKey.publicKey), signature)`. Errors on a missing or invalid
/// signature so a malicious relay can't substitute attacker pre-keys.
///
/// `identity_ed25519_public_key` is the peer's long-term Ed25519 key (from a
/// trusted address), NOT the X25519 key from the served bundle.
pub fn verify_pre_key_signature(
    identity_ed25519_public_key: &[u8; 32],
    pre_key_public_key_base64: &str,
    signature_base64: Option<&str>,
    label: &str,
) -> Result<()> {
    let signature_base64 = signature_base64.ok_or_else(|| {
        Error::InvalidArgument(format!(
            "Key bundle rejected: {label} is missing its Ed25519 signature"
        ))
    })?;
    let reject = || {
        Error::InvalidArgument(format!(
            "Key bundle rejected: invalid Ed25519 signature on {label}"
        ))
    };
    let signature_bytes = from_base64(signature_base64).map_err(|_| reject())?;
    let signature = Signature::from_slice(&signature_bytes).map_err(|_| reject())?;
    let verifying = VerifyingKey::from_bytes(identity_ed25519_public_key).map_err(|_| reject())?;
    verifying
        .verify(pre_key_public_key_base64.as_bytes(), &signature)
        .map_err(|_| reject())
}

/// Initiate X3DH against a peer's bundle, deriving the initial root key.
pub fn x3dh_initiate(
    our_identity_key_pair: &X25519KeyPair,
    their_bundle: &X3DHBundle,
) -> X3DHInitResult {
    let ephemeral = generate_x25519_keypair();

    // DH1: our identity <-> their signed pre-key
    let dh1 = x25519_shared_secret(
        &our_identity_key_pair.private_key,
        &their_bundle.signed_pre_key,
    );
    // DH2: our ephemeral <-> their identity
    let dh2 = x25519_shared_secret(&ephemeral.private_key, &their_bundle.identity_key);
    // DH3: our ephemeral <-> their signed pre-key
    let dh3 = x25519_shared_secret(&ephemeral.private_key, &their_bundle.signed_pre_key);

    let mut parts: Vec<&[u8]> = vec![&PADDING, &dh1, &dh2, &dh3];
    let dh4;
    if let Some(one_time) = &their_bundle.one_time_pre_key {
        dh4 = x25519_shared_secret(&ephemeral.private_key, one_time);
        parts.push(&dh4);
    }
    let root_key = derive_root_key(&parts);

    let session = SessionState {
        dh_send_key_pair: generate_x25519_keypair(),
        dh_recv_public_key: Some(their_bundle.signed_pre_key),
        root_key,
        send_chain_key: None,
        recv_chain_key: None,
        send_message_number: 0,
        recv_message_number: 0,
        previous_chain_length: 0,
        skipped_keys: HashMap::new(),
    };

    X3DHInitResult {
        session,
        ephemeral_public_key: ephemeral.public_key,
        signed_pre_key_id: their_bundle.signed_pre_key_id.clone(),
        one_time_pre_key_id: their_bundle.one_time_pre_key_id.clone(),
    }
}

/// Respond to an X3DH initiation, deriving the same root key.
pub fn x3dh_respond(
    our_identity_key_pair: &X25519KeyPair,
    our_signed_pre_key_pair: &X25519KeyPair,
    their_identity_key: &[u8; 32],
    their_ephemeral_key: &[u8; 32],
    our_one_time_pre_key_pair: Option<&X25519KeyPair>,
) -> SessionState {
    // DH1: their identity <-> our signed pre-key
    let dh1 = x25519_shared_secret(&our_signed_pre_key_pair.private_key, their_identity_key);
    // DH2: their ephemeral <-> our identity
    let dh2 = x25519_shared_secret(&our_identity_key_pair.private_key, their_ephemeral_key);
    // DH3: their ephemeral <-> our signed pre-key
    let dh3 = x25519_shared_secret(&our_signed_pre_key_pair.private_key, their_ephemeral_key);

    let mut parts: Vec<&[u8]> = vec![&PADDING, &dh1, &dh2, &dh3];
    let dh4;
    if let Some(one_time) = our_one_time_pre_key_pair {
        dh4 = x25519_shared_secret(&one_time.private_key, their_ephemeral_key);
        parts.push(&dh4);
    }
    let root_key = derive_root_key(&parts);

    SessionState {
        dh_send_key_pair: our_signed_pre_key_pair.clone(),
        dh_recv_public_key: None,
        root_key,
        send_chain_key: None,
        recv_chain_key: None,
        send_message_number: 0,
        recv_message_number: 0,
        previous_chain_length: 0,
        skipped_keys: HashMap::new(),
    }
}

/// Associated data bound into every message MAC: `sender_identity ||
/// recipient_identity` (X25519 identity keys).
pub fn build_associated_data(sender_identity_key: &[u8], recipient_identity_key: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(sender_identity_key.len() + recipient_identity_key.len());
    out.extend_from_slice(sender_identity_key);
    out.extend_from_slice(recipient_identity_key);
    out
}

fn derive_root_key(parts: &[&[u8]]) -> [u8; 32] {
    let dh_concat: Vec<u8> = parts.concat();
    let okm = hkdf_sha256(&dh_concat, Some(&[0u8; 32]), X3DH_INFO, 32);
    let mut root = [0u8; 32];
    root.copy_from_slice(&okm);
    root
}
