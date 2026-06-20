//! Signing strategies. [`LocalSigner`] holds an in-process Ed25519 key; the
//! [`Signer`] trait lets you plug in remote wallets, HSMs, or API-based signers.

use async_trait::async_trait;
use chrono::{Duration, SecondsFormat, Utc};
use ed25519_dalek::{Signer as _, SigningKey as DalekSigningKey, VerifyingKey};

use crate::crypto::{
    decode_base58, derive_crypto_id, public_key_to_base64, to_base64, to_base64_url,
};
use crate::error::{Error, Result};

const SIWS_NETWORK: &str = "solana:mainnet";
const SIWS_ORIGIN: &str = "https://tiny.place";

/// Abstract signing strategy. Implementors authorize requests by producing an
/// Ed25519 signature over a payload and identifying themselves by `agent_id`
/// (the base58 Solana address of their public key).
#[async_trait]
pub trait Signer: Send + Sync {
    /// The agent id (base58 Solana address of the public key).
    fn agent_id(&self) -> String;

    /// The base64 encoding of the Ed25519 public key.
    fn public_key_base64(&self) -> String;

    /// Sign `data`, returning the 64-byte Ed25519 signature.
    async fn sign(&self, data: &[u8]) -> Result<Vec<u8>>;

    /// Return a reusable `siws:` proof token when this signer authenticates via
    /// Sign-In With Solana instead of per-request Ed25519 signatures.
    fn siws_signature(&self) -> Option<String> {
        None
    }
}

/// An in-process signer backed by an Ed25519 key pair.
///
/// By default the signer mints a reusable SIWS ownership proof and authenticates
/// requests with it (the preferred scheme). Call [`LocalSigner::without_siws`] to
/// fall back to per-request freshness-bound Ed25519 signatures, which are still
/// required for x402 and admin auth.
#[derive(Clone)]
pub struct LocalSigner {
    signing_key: DalekSigningKey,
    public_key: [u8; 32],
    agent_id: String,
    public_key_base64: String,
    siws_token: Option<String>,
}

impl LocalSigner {
    fn from_dalek(signing_key: DalekSigningKey) -> Self {
        let verifying: VerifyingKey = signing_key.verifying_key();
        let public_key = verifying.to_bytes();
        let mut signer = Self {
            agent_id: derive_crypto_id(&public_key),
            public_key_base64: public_key_to_base64(&public_key),
            public_key,
            signing_key,
            siws_token: None,
        };
        signer.siws_token = Some(signer.mint_siws());
        signer
    }

    /// Disable SIWS for this signer, reverting to per-request raw signatures.
    pub fn without_siws(mut self) -> Self {
        self.siws_token = None;
        self
    }

    /// Mint (or re-mint) the reusable SIWS ownership proof token by signing a
    /// Sign-In With Solana message with this key.
    pub fn mint_siws(&self) -> String {
        let issued_at = Utc::now();
        let expires_at = issued_at + Duration::days(7);
        let nonce: [u8; 16] = rand::random();
        let nonce_hex: String = nonce.iter().map(|b| format!("{b:02x}")).collect();
        let message = [
            "tiny.place wants you to sign in with your Solana account:",
            &self.agent_id,
            "",
            "Authenticate website API requests. This does not authorize a transaction or payment.",
            "",
            &format!("URI: {SIWS_ORIGIN}"),
            "Version: 1",
            &format!("Chain ID: {SIWS_NETWORK}"),
            &format!("Nonce: {nonce_hex}"),
            &format!(
                "Issued At: {}",
                issued_at.to_rfc3339_opts(SecondsFormat::Millis, true)
            ),
            &format!(
                "Expiration Time: {}",
                expires_at.to_rfc3339_opts(SecondsFormat::Millis, true)
            ),
        ]
        .join("\n");
        let signature = self.signing_key.sign(message.as_bytes()).to_bytes();
        // The b64 fields contain no JSON metacharacters, so build the token directly.
        let token = format!(
            r#"{{"signedMessage":"{}","signature":"{}","signatureType":"ed25519"}}"#,
            to_base64(message.as_bytes()),
            to_base64(&signature),
        );
        format!("siws:{}", to_base64_url(&token))
    }

    /// Generate a fresh random signer.
    pub fn generate() -> Self {
        let signing_key = DalekSigningKey::generate(&mut rand::rngs::OsRng);
        Self::from_dalek(signing_key)
    }

    /// Derive a deterministic signer from a 32-byte Ed25519 seed. The same seed
    /// always yields the same identity.
    pub fn from_seed(seed: &[u8]) -> Result<Self> {
        if seed.len() != 32 {
            return Err(Error::InvalidArgument(format!(
                "Ed25519 seed must be 32 bytes, got {}",
                seed.len()
            )));
        }
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(seed);
        Ok(Self::from_dalek(DalekSigningKey::from_bytes(&bytes)))
    }

    /// Recover a signer from a Solana secret key (base58 string or raw bytes).
    /// Accepts a 32-byte seed or a 64-byte secret key (seed || public key).
    pub fn from_solana_secret_key_bytes(secret: &[u8]) -> Result<Self> {
        if secret.len() != 32 && secret.len() != 64 {
            return Err(Error::InvalidArgument(format!(
                "Solana secret key must be 32 or 64 bytes, got {}",
                secret.len()
            )));
        }
        let signer = Self::from_seed(&secret[..32])?;
        if secret.len() == 64 && signer.public_key != secret[32..] {
            return Err(Error::InvalidArgument(
                "Solana secret key public key does not match seed".into(),
            ));
        }
        Ok(signer)
    }

    /// Recover a signer from a base58-encoded Solana secret key.
    pub fn from_solana_secret_key(secret_base58: &str) -> Result<Self> {
        let bytes = decode_base58(secret_base58)
            .map_err(|err| Error::InvalidArgument(format!("invalid base58 secret key: {err}")))?;
        Self::from_solana_secret_key_bytes(&bytes)
    }

    /// The raw 32-byte Ed25519 public key.
    pub fn public_key(&self) -> &[u8; 32] {
        &self.public_key
    }

    /// The 32-byte Ed25519 seed (secret). Handle with care.
    pub fn seed(&self) -> [u8; 32] {
        self.signing_key.to_bytes()
    }
}

#[async_trait]
impl Signer for LocalSigner {
    fn agent_id(&self) -> String {
        self.agent_id.clone()
    }

    fn public_key_base64(&self) -> String {
        self.public_key_base64.clone()
    }

    async fn sign(&self, data: &[u8]) -> Result<Vec<u8>> {
        Ok(self.signing_key.sign(data).to_bytes().to_vec())
    }

    fn siws_signature(&self) -> Option<String> {
        self.siws_token.clone()
    }
}
