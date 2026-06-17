//! Sender Keys for group messaging. Mirrors `sdk/typescript/src/signal/sender-key.ts`.
//!
//! Each sender has a symmetric chain key (ratcheted once per message) plus an
//! Ed25519 signing key so receivers can attribute and verify messages. A sender
//! shares a [`SenderKeyDistribution`] (chain key at an iteration + its signature
//! public key) over an already-secure 1:1 channel; receivers init from it and
//! read forward.

use std::collections::HashMap;

use ed25519_dalek::{Signature, Signer as _, SigningKey, Verifier as _, VerifyingKey};
use rand::RngCore as _;
use serde::{Deserialize, Serialize};

use crate::crypto::{from_base64, to_base64};
use crate::error::{Error, Result};
use crate::signal::crypto::{decrypt, encrypt, kdf_chain_key};

/// How far a receiver will fast-forward to reach an out-of-order message.
const MAX_SKIP: u32 = 2000;

/// Group sender-key messages carry no associated data; the Ed25519 signature
/// authenticates the sender.
const EMPTY_AD: &[u8] = &[];

/// Public, distributable snapshot of a sender's group key, shared over a secure
/// 1:1 channel so other members can decrypt from `iteration` forward.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SenderKeyDistribution {
    pub chain_key: String,
    pub iteration: u32,
    pub signature_public_key: String,
}

/// A single encrypted group message produced by a [`GroupSenderKey`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SenderKeyMessage {
    pub iteration: u32,
    pub ciphertext: String,
    pub signature: String,
}

/// Persistable snapshot of the sending half (includes the private signing key).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SenderKeyOwnState {
    pub chain_key: String,
    pub iteration: u32,
    pub signature_private_key: String,
    pub signature_public_key: String,
}

/// Persistable snapshot of the receiving half.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SenderKeyReceiverState {
    pub chain_key: String,
    pub iteration: u32,
    pub signature_public_key: String,
    pub skipped: HashMap<u32, String>,
}

/// The sending half of a Sender Key. One per (group, sender, membership epoch).
pub struct GroupSenderKey {
    chain_key: [u8; 32],
    iteration: u32,
    signing_key: SigningKey,
}

impl GroupSenderKey {
    /// A brand-new sender key with a random chain key and signing pair.
    pub fn create() -> Self {
        let mut chain_key = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut chain_key);
        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        Self {
            chain_key,
            iteration: 0,
            signing_key: SigningKey::from_bytes(&seed),
        }
    }

    /// Rebuild from [`serialize`](Self::serialize) output.
    pub fn restore(state: &SenderKeyOwnState) -> Result<Self> {
        Ok(Self {
            chain_key: decode_key(&state.chain_key)?,
            iteration: state.iteration,
            signing_key: SigningKey::from_bytes(&decode_key(&state.signature_private_key)?),
        })
    }

    /// The current message number (advances after each [`encrypt`](Self::encrypt)).
    pub fn current_iteration(&self) -> u32 {
        self.iteration
    }

    /// Persistable snapshot including the private signing key. Keep secret.
    pub fn serialize(&self) -> SenderKeyOwnState {
        SenderKeyOwnState {
            chain_key: to_base64(&self.chain_key),
            iteration: self.iteration,
            signature_private_key: to_base64(&self.signing_key.to_bytes()),
            signature_public_key: to_base64(&self.signing_key.verifying_key().to_bytes()),
        }
    }

    /// Snapshot to hand other members so they can decrypt from here forward.
    pub fn distribution(&self) -> SenderKeyDistribution {
        SenderKeyDistribution {
            chain_key: to_base64(&self.chain_key),
            iteration: self.iteration,
            signature_public_key: to_base64(&self.signing_key.verifying_key().to_bytes()),
        }
    }

    /// Encrypt and sign one group message, ratcheting the chain forward.
    pub fn encrypt(&mut self, plaintext: &[u8]) -> SenderKeyMessage {
        let iteration = self.iteration;
        let (next_chain, message_key) = kdf_chain_key(&self.chain_key);
        let ciphertext = encrypt(&message_key, plaintext, EMPTY_AD);
        let signature = self.signing_key.sign(&ciphertext);
        self.chain_key = next_chain;
        self.iteration += 1;
        SenderKeyMessage {
            iteration,
            ciphertext: to_base64(&ciphertext),
            signature: to_base64(&signature.to_bytes()),
        }
    }
}

/// The receiving half of a Sender Key: another member's chain key + signature
/// public key, tolerant of out-of-order delivery via cached skipped keys.
pub struct GroupSenderKeyReceiver {
    chain_key: [u8; 32],
    iteration: u32,
    signature_public_key: [u8; 32],
    skipped: HashMap<u32, [u8; 32]>,
}

impl GroupSenderKeyReceiver {
    /// Initialise from a sender's distribution snapshot.
    pub fn from_distribution(distribution: &SenderKeyDistribution) -> Result<Self> {
        Ok(Self {
            chain_key: decode_key(&distribution.chain_key)?,
            iteration: distribution.iteration,
            signature_public_key: decode_key(&distribution.signature_public_key)?,
            skipped: HashMap::new(),
        })
    }

    /// Rebuild from [`serialize`](Self::serialize) output.
    pub fn restore(state: &SenderKeyReceiverState) -> Result<Self> {
        let mut skipped = HashMap::with_capacity(state.skipped.len());
        for (iteration, key) in &state.skipped {
            skipped.insert(*iteration, decode_key(key)?);
        }
        Ok(Self {
            chain_key: decode_key(&state.chain_key)?,
            iteration: state.iteration,
            signature_public_key: decode_key(&state.signature_public_key)?,
            skipped,
        })
    }

    /// Persistable snapshot of the receiver chain and any cached skipped keys.
    pub fn serialize(&self) -> SenderKeyReceiverState {
        SenderKeyReceiverState {
            chain_key: to_base64(&self.chain_key),
            iteration: self.iteration,
            signature_public_key: to_base64(&self.signature_public_key),
            skipped: self
                .skipped
                .iter()
                .map(|(iteration, key)| (*iteration, to_base64(key)))
                .collect(),
        }
    }

    /// Verify the signature, then decrypt the message at its iteration.
    pub fn decrypt(&mut self, message: &SenderKeyMessage) -> Result<Vec<u8>> {
        let ciphertext = from_base64(&message.ciphertext)
            .map_err(|_| Error::InvalidArgument("invalid ciphertext".into()))?;
        let signature_bytes = from_base64(&message.signature)
            .map_err(|_| Error::InvalidArgument("invalid signature".into()))?;
        let signature = Signature::from_slice(&signature_bytes)
            .map_err(|_| Error::InvalidArgument("invalid signature".into()))?;
        let verifying = VerifyingKey::from_bytes(&self.signature_public_key)
            .map_err(|_| Error::InvalidArgument("invalid sender key".into()))?;
        verifying.verify(&ciphertext, &signature).map_err(|_| {
            Error::InvalidArgument("Sender key signature verification failed".into())
        })?;

        let message_key = self.message_key_for(message.iteration)?;
        decrypt(&message_key, &ciphertext, EMPTY_AD)
    }

    /// Message key for `target`, advancing the chain and caching keys for any
    /// skipped iterations along the way.
    fn message_key_for(&mut self, target: u32) -> Result<[u8; 32]> {
        if let Some(cached) = self.skipped.remove(&target) {
            return Ok(cached);
        }
        if target < self.iteration {
            return Err(Error::InvalidArgument(
                "Sender key message is older than the current chain".into(),
            ));
        }
        if target - self.iteration > MAX_SKIP {
            return Err(Error::InvalidArgument(
                "Too many skipped sender key messages".into(),
            ));
        }
        while self.iteration < target {
            let (next_chain, message_key) = kdf_chain_key(&self.chain_key);
            self.skipped.insert(self.iteration, message_key);
            self.chain_key = next_chain;
            self.iteration += 1;
        }
        let (next_chain, message_key) = kdf_chain_key(&self.chain_key);
        self.chain_key = next_chain;
        self.iteration += 1;
        Ok(message_key)
    }
}

fn decode_key(base64: &str) -> Result<[u8; 32]> {
    let bytes =
        from_base64(base64).map_err(|_| Error::InvalidArgument("invalid base64 key".into()))?;
    bytes
        .try_into()
        .map_err(|_| Error::InvalidArgument("key is not 32 bytes".into()))
}
