//! The 1:1 Signal session: ties X3DH + Double Ratchet + the store together and
//! speaks the backend's `KeyBundle` / `MessageEnvelope` / `SignalMetadata`
//! shapes. Mirrors `sdk/typescript/src/signal/session.ts`.

use std::sync::Arc;

use crate::crypto::{from_base64, to_base64};
use crate::error::{Error, Result};
use crate::signal::crypto::X25519KeyPair;
use crate::signal::ratchet::{ratchet_decrypt, ratchet_encrypt, RatchetHeader, RatchetMessage};
use crate::signal::store::{SessionState, SessionStore};
use crate::signal::x3dh::{
    build_associated_data, verify_pre_key_signature, x3dh_initiate, x3dh_respond, X3DHBundle,
};
use crate::types::{KeyBundle, MessageEnvelope, SignalMetadata};

/// `"CIPHERTEXT"` for an established session; `"PREKEY_BUNDLE"` for the first
/// message that also carries the X3DH handshake values.
pub const TYPE_CIPHERTEXT: &str = "CIPHERTEXT";
pub const TYPE_PREKEY_BUNDLE: &str = "PREKEY_BUNDLE";

/// The encrypted output of [`SignalSession::encrypt`], ready to put into a
/// `MessageEnvelope` (`body`/`type`/`signal`).
#[derive(Debug, Clone)]
pub struct EncryptedMessage {
    pub body: String,
    pub message_type: String,
    pub signal: SignalMetadata,
}

/// A long-lived Signal session bound to a [`SessionStore`].
pub struct SignalSession {
    store: Arc<dyn SessionStore>,
    our_identity_public_key: [u8; 32],
}

impl SignalSession {
    /// `our_identity_public_key` is our X25519 identity public key (bound into
    /// every message's associated data).
    pub fn new(store: Arc<dyn SessionStore>, our_identity_public_key: [u8; 32]) -> Self {
        Self {
            store,
            our_identity_public_key,
        }
    }

    /// Encrypt a message to `recipient_address`. On the first message a
    /// `recipient_bundle` (and the recipient's trusted Ed25519 identity key)
    /// must be supplied to run X3DH; subsequent messages reuse the session.
    pub async fn encrypt(
        &self,
        recipient_address: &str,
        recipient_identity_key: &[u8; 32],
        plaintext: &[u8],
        recipient_bundle: Option<&KeyBundle>,
        recipient_identity_ed25519_key: Option<&[u8; 32]>,
    ) -> Result<EncryptedMessage> {
        let mut prekey_signal: Option<SignalMetadata> = None;
        let mut session = match self.store.session(recipient_address).await? {
            Some(session) => session,
            None => {
                let bundle = recipient_bundle.ok_or_else(|| {
                    Error::InvalidArgument(format!(
                        "No session for {recipient_address}. Provide a key bundle for the initial message."
                    ))
                })?;
                let x3dh_bundle = parse_key_bundle(
                    bundle,
                    recipient_identity_key,
                    recipient_identity_ed25519_key,
                )?;
                let identity_key_pair = self.store.identity_x25519_key_pair().await?;
                let result = x3dh_initiate(&identity_key_pair, &x3dh_bundle);
                prekey_signal = Some(SignalMetadata {
                    ephemeral_key: Some(to_base64(&result.ephemeral_public_key)),
                    signed_pre_key_id: Some(result.signed_pre_key_id),
                    one_time_pre_key_id: result.one_time_pre_key_id,
                    ..Default::default()
                });
                result.session
            }
        };

        let associated_data =
            build_associated_data(&self.our_identity_public_key, recipient_identity_key);
        let message = ratchet_encrypt(&mut session, plaintext, &associated_data)?;
        self.store.store_session(recipient_address, session).await?;

        let is_prekey = prekey_signal.is_some();
        let signal = build_signal_metadata(&message.header, prekey_signal);

        Ok(EncryptedMessage {
            body: to_base64(&message.ciphertext),
            message_type: if is_prekey {
                TYPE_PREKEY_BUNDLE
            } else {
                TYPE_CIPHERTEXT
            }
            .to_string(),
            signal,
        })
    }

    /// Decrypt an inbound envelope from `sender_address`.
    pub async fn decrypt(
        &self,
        sender_address: &str,
        sender_identity_key: &[u8; 32],
        envelope: &MessageEnvelope,
    ) -> Result<Vec<u8>> {
        let ciphertext = from_base64(&envelope.body)
            .map_err(|_| Error::InvalidArgument("invalid message body".into()))?;

        let mut session = if envelope.envelope_type == TYPE_PREKEY_BUNDLE {
            let signal = envelope.signal.as_ref().ok_or_else(|| {
                Error::InvalidArgument("PREKEY_BUNDLE message is missing signal metadata".into())
            })?;
            self.process_pre_key_message(sender_identity_key, signal)
                .await?
        } else {
            self.store
                .session(sender_address)
                .await?
                .ok_or_else(|| Error::InvalidArgument(format!("No session for {sender_address}")))?
        };

        let header = parse_signal_header(envelope.signal.as_ref())?;
        let associated_data =
            build_associated_data(sender_identity_key, &self.our_identity_public_key);
        let message = RatchetMessage { header, ciphertext };
        let plaintext = ratchet_decrypt(&mut session, &message, &associated_data)?;
        self.store.store_session(sender_address, session).await?;
        Ok(plaintext)
    }

    /// True if a session already exists for `address`.
    pub async fn has_session(&self, address: &str) -> Result<bool> {
        Ok(self.store.session(address).await?.is_some())
    }

    /// Drop the session for `address`.
    pub async fn remove_session(&self, address: &str) -> Result<()> {
        self.store.remove_session(address).await
    }

    async fn process_pre_key_message(
        &self,
        sender_identity_key: &[u8; 32],
        signal: &SignalMetadata,
    ) -> Result<SessionState> {
        let identity_key_pair = self.store.identity_x25519_key_pair().await?;
        let signed_pre_key_id = signal
            .signed_pre_key_id
            .as_deref()
            .ok_or_else(|| Error::InvalidArgument("missing signedPreKeyId".into()))?;
        let signed_pre_key = self
            .store
            .signed_pre_key(signed_pre_key_id)
            .await?
            .ok_or_else(|| {
                Error::InvalidArgument(format!("Signed pre-key {signed_pre_key_id} not found"))
            })?;

        let mut one_time_pre_key_pair: Option<X25519KeyPair> = None;
        if let Some(one_time_id) = &signal.one_time_pre_key_id {
            if let Some(one_time) = self.store.pre_key(one_time_id).await? {
                one_time_pre_key_pair = Some(one_time.key_pair);
                self.store.remove_pre_key(one_time_id).await?;
            }
        }

        let ephemeral_key = signal
            .ephemeral_key
            .as_deref()
            .ok_or_else(|| Error::InvalidArgument("missing ephemeralKey".into()))?;

        Ok(x3dh_respond(
            &identity_key_pair,
            &signed_pre_key.key_pair,
            sender_identity_key,
            &decode_key(ephemeral_key)?,
            one_time_pre_key_pair.as_ref(),
        ))
    }
}

fn parse_key_bundle(
    bundle: &KeyBundle,
    recipient_x25519_identity_key: &[u8; 32],
    recipient_ed25519_identity_key: Option<&[u8; 32]>,
) -> Result<X3DHBundle> {
    let ed25519_identity = recipient_ed25519_identity_key.ok_or_else(|| {
        Error::InvalidArgument(
            "Key bundle rejected: peer Ed25519 identity key is required to verify the signed pre-key signature"
                .into(),
        )
    })?;
    verify_pre_key_signature(
        ed25519_identity,
        &bundle.signed_pre_key.public_key,
        bundle.signed_pre_key.signature.as_deref(),
        "signed pre-key",
    )?;

    let mut x3dh = X3DHBundle {
        identity_key: *recipient_x25519_identity_key,
        signed_pre_key_id: bundle.signed_pre_key.key_id.clone(),
        signed_pre_key: decode_key(&bundle.signed_pre_key.public_key)?,
        one_time_pre_key_id: None,
        one_time_pre_key: None,
    };
    if let Some(one_time) = &bundle.one_time_pre_key {
        verify_pre_key_signature(
            ed25519_identity,
            &one_time.public_key,
            one_time.signature.as_deref(),
            "one-time pre-key",
        )?;
        x3dh.one_time_pre_key_id = Some(one_time.key_id.clone());
        x3dh.one_time_pre_key = Some(decode_key(&one_time.public_key)?);
    }
    Ok(x3dh)
}

fn build_signal_metadata(header: &RatchetHeader, prekey: Option<SignalMetadata>) -> SignalMetadata {
    let mut signal = prekey.unwrap_or_default();
    signal.ratchet_key = Some(to_base64(&header.public_key));
    signal.message_number = Some(i64::from(header.message_number));
    signal.previous_chain_length = Some(i64::from(header.previous_chain_length));
    signal
}

fn parse_signal_header(signal: Option<&SignalMetadata>) -> Result<RatchetHeader> {
    let ratchet_key = signal
        .and_then(|s| s.ratchet_key.as_deref())
        .ok_or_else(|| Error::InvalidArgument("Missing ratchet key in signal metadata".into()))?;
    let signal = signal.expect("ratchet_key implies signal is present");
    Ok(RatchetHeader {
        public_key: decode_key(ratchet_key)?,
        previous_chain_length: signal.previous_chain_length.unwrap_or(0).max(0) as u32,
        message_number: signal.message_number.unwrap_or(0).max(0) as u32,
    })
}

fn decode_key(base64: &str) -> Result<[u8; 32]> {
    let bytes =
        from_base64(base64).map_err(|_| Error::InvalidArgument("invalid base64 key".into()))?;
    bytes
        .try_into()
        .map_err(|_| Error::InvalidArgument("key is not 32 bytes".into()))
}
