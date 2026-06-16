//! Double Ratchet. Mirrors `sdk/typescript/src/signal/ratchet.ts`.
//!
//! Symmetric-key ratchet per chain + a DH ratchet on each direction change,
//! with skipped-message-key handling for out-of-order delivery. Encrypt/decrypt
//! are synchronous here (Rust AES is sync, unlike the TS WebCrypto port).

use crate::error::{Error, Result};
use crate::signal::crypto::{
    decrypt, encrypt, generate_x25519_keypair, kdf_chain_key, kdf_root_key, x25519_shared_secret,
};
use crate::signal::store::{skipped_key_id, SessionState};

const MAX_SKIP: u32 = 1000;

/// Per-message ratchet header (sent in the clear, bound into the MAC).
#[derive(Debug, Clone)]
pub struct RatchetHeader {
    pub public_key: [u8; 32],
    pub previous_chain_length: u32,
    pub message_number: u32,
}

/// A ratchet header plus its ciphertext.
#[derive(Debug, Clone)]
pub struct RatchetMessage {
    pub header: RatchetHeader,
    pub ciphertext: Vec<u8>,
}

/// Encrypt the next message in the sending chain, advancing the ratchet.
pub fn ratchet_encrypt(
    state: &mut SessionState,
    plaintext: &[u8],
    associated_data: &[u8],
) -> Result<RatchetMessage> {
    if state.send_chain_key.is_none() {
        dh_ratchet_step(state)?;
    }
    let chain = state
        .send_chain_key
        .expect("send chain key set after ratchet");
    let (next_chain, message_key) = kdf_chain_key(&chain);
    state.send_chain_key = Some(next_chain);

    let header = RatchetHeader {
        public_key: state.dh_send_key_pair.public_key,
        previous_chain_length: state.previous_chain_length,
        message_number: state.send_message_number,
    };
    state.send_message_number += 1;

    let ad = [associated_data, &encode_header(&header)].concat();
    let ciphertext = encrypt(&message_key, plaintext, &ad);
    Ok(RatchetMessage { header, ciphertext })
}

/// Decrypt a message, performing a DH ratchet step and/or replaying skipped
/// message keys as needed.
pub fn ratchet_decrypt(
    state: &mut SessionState,
    message: &RatchetMessage,
    associated_data: &[u8],
) -> Result<Vec<u8>> {
    let skipped_id = skipped_key_id(&message.header.public_key, message.header.message_number);
    if let Some(skipped_key) = state.skipped_keys.get(&skipped_id).copied() {
        state.skipped_keys.remove(&skipped_id);
        let ad = [associated_data, &encode_header(&message.header)].concat();
        return decrypt(&skipped_key, &message.ciphertext, &ad);
    }

    if state.dh_recv_public_key != Some(message.header.public_key) {
        if state.recv_chain_key.is_some() {
            skip_message_keys(state, message.header.previous_chain_length)?;
        }
        dh_ratchet_step_with_recv(state, message.header.public_key);
    }

    skip_message_keys(state, message.header.message_number)?;

    let chain = state
        .recv_chain_key
        .expect("recv chain key set after ratchet");
    let (next_chain, message_key) = kdf_chain_key(&chain);
    state.recv_chain_key = Some(next_chain);
    state.recv_message_number += 1;

    let ad = [associated_data, &encode_header(&message.header)].concat();
    decrypt(&message_key, &message.ciphertext, &ad)
}

fn dh_ratchet_step(state: &mut SessionState) -> Result<()> {
    let recv = state.dh_recv_public_key.ok_or_else(|| {
        Error::InvalidArgument("Cannot perform DH ratchet without recipient public key".into())
    })?;
    let dh_output = x25519_shared_secret(&state.dh_send_key_pair.private_key, &recv);
    let (root_key, chain_key) = kdf_root_key(&state.root_key, &dh_output);
    state.root_key = root_key;
    state.send_chain_key = Some(chain_key);
    Ok(())
}

fn dh_ratchet_step_with_recv(state: &mut SessionState, new_recv_public_key: [u8; 32]) {
    state.previous_chain_length = state.send_message_number;
    state.send_message_number = 0;
    state.recv_message_number = 0;
    state.dh_recv_public_key = Some(new_recv_public_key);

    let dh_recv = x25519_shared_secret(&state.dh_send_key_pair.private_key, &new_recv_public_key);
    let (root_key, recv_chain) = kdf_root_key(&state.root_key, &dh_recv);
    state.root_key = root_key;
    state.recv_chain_key = Some(recv_chain);

    state.dh_send_key_pair = generate_x25519_keypair();
    let dh_send = x25519_shared_secret(&state.dh_send_key_pair.private_key, &new_recv_public_key);
    let (root_key, send_chain) = kdf_root_key(&state.root_key, &dh_send);
    state.root_key = root_key;
    state.send_chain_key = Some(send_chain);
}

fn skip_message_keys(state: &mut SessionState, until: u32) -> Result<()> {
    if state.recv_chain_key.is_none() {
        return Ok(());
    }
    if until.saturating_sub(state.recv_message_number) > MAX_SKIP {
        return Err(Error::InvalidArgument("Too many skipped messages".into()));
    }
    let recv_public_key = state
        .dh_recv_public_key
        .expect("recv public key set when recv chain key is set");
    while state.recv_message_number < until {
        let chain = state
            .recv_chain_key
            .expect("recv chain key present in loop");
        let (next_chain, message_key) = kdf_chain_key(&chain);
        state.recv_chain_key = Some(next_chain);
        let skipped_id = skipped_key_id(&recv_public_key, state.recv_message_number);
        state.skipped_keys.insert(skipped_id, message_key);
        state.recv_message_number += 1;
    }
    Ok(())
}

/// Header wire form: `public_key(32) || previous_chain_length(u32 BE) ||
/// message_number(u32 BE)`.
fn encode_header(header: &RatchetHeader) -> [u8; 40] {
    let mut out = [0u8; 40];
    out[..32].copy_from_slice(&header.public_key);
    out[32..36].copy_from_slice(&header.previous_chain_length.to_be_bytes());
    out[36..40].copy_from_slice(&header.message_number.to_be_bytes());
    out
}
