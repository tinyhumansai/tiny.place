//! Unit tests for the deterministic core (no network). These pin the exact
//! byte-for-byte signing/canonicalization behavior the backend depends on,
//! mirroring `sdk/typescript/tests`.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use tinyplace::auth::{
    build_auth_header, sign_directory_write, sign_directory_write_query,
    sign_fresh_canonical_payload, sign_request, AdminSigningOptions,
};
use tinyplace::crypto::{
    canonical_payload, derive_crypto_id, public_key_to_solana_address, sha256_hex,
};
use tinyplace::x402::{build_canonical_message, X402AuthorizationFields};
use tinyplace::{Error, LocalSigner, Result, Signer};

struct SiwsSigner;

#[async_trait::async_trait]
impl Signer for SiwsSigner {
    fn agent_id(&self) -> String {
        "wallet-address".to_string()
    }

    fn public_key_base64(&self) -> String {
        "wallet-public-key".to_string()
    }

    async fn sign(&self, _data: &[u8]) -> Result<Vec<u8>> {
        Err(Error::InvalidArgument(
            "SIWS auth should not call sign()".to_string(),
        ))
    }

    fn siws_signature(&self) -> Option<String> {
        Some("siws:test-token".to_string())
    }
}

#[test]
fn solana_address_of_zero_key_is_all_ones() {
    // 32 zero bytes base58-encode to 32 '1' characters.
    let zero = [0u8; 32];
    assert_eq!(public_key_to_solana_address(&zero), "1".repeat(32),);
    assert_eq!(derive_crypto_id(&zero), "1".repeat(32));
}

#[test]
fn sha256_hex_matches_known_vector() {
    // SHA-256 of the empty string.
    assert_eq!(
        sha256_hex(b""),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
}

#[test]
fn canonical_payload_sorts_keys_recursively() {
    let payload = canonical_payload(
        "identity.renew",
        serde_json::json!({ "b": 1, "a": { "z": 2, "y": 3 } }),
    );
    assert_eq!(
        payload,
        r#"{"action":"identity.renew","fields":{"a":{"y":3,"z":2},"b":1}}"#
    );
}

#[test]
fn x402_canonical_message_order_and_metadata() {
    let mut metadata = std::collections::HashMap::new();
    metadata.insert("domain".to_string(), "tiny.place".to_string());
    metadata.insert("publicKey".to_string(), "PK".to_string());
    let fields = X402AuthorizationFields {
        scheme: "exact".into(),
        network: "solana".into(),
        asset: "USDC".into(),
        amount: "1".into(),
        from: "A".into(),
        to: "B".into(),
        nonce: "n".into(),
        // empty expiresAt is omitted from the canonical message
        expires_at: String::new(),
        metadata: Some(metadata),
    };
    assert_eq!(
        build_canonical_message(&fields),
        r#"{"domain":"tiny.place","scheme":"exact","network":"solana","asset":"USDC","amount":"1","from":"A","to":"B","nonce":"n","metadata":[{"key":"domain","value":"tiny.place"},{"key":"publicKey","value":"PK"}]}"#
    );
}

#[test]
fn signer_from_seed_is_deterministic() {
    let seed = [7u8; 32];
    let a = LocalSigner::from_seed(&seed).unwrap();
    let b = LocalSigner::from_seed(&seed).unwrap();
    assert_eq!(a.agent_id(), b.agent_id());
    assert_eq!(a.public_key_base64(), b.public_key_base64());
}

#[test]
fn from_seed_matches_typescript_sdk() {
    // Reference values produced by the TypeScript SDK (`LocalSigner.fromSeed`)
    // for a 32-byte seed of all 0x07 — pins cross-language identity derivation.
    let signer = LocalSigner::from_seed(&[7u8; 32]).unwrap();
    assert_eq!(
        signer.agent_id(),
        "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB"
    );
    assert_eq!(
        signer.public_key_base64(),
        "6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw="
    );
}

#[test]
fn from_seed_rejects_wrong_length() {
    assert!(LocalSigner::from_seed(&[0u8; 31]).is_err());
}

#[tokio::test]
async fn signature_verifies_against_public_key() {
    let signer = LocalSigner::from_seed(&[3u8; 32]).unwrap();
    let message = b"hello tiny.place";
    let sig_bytes = signer.sign(message).await.unwrap();

    let verifying = VerifyingKey::from_bytes(signer.public_key()).unwrap();
    let signature = Signature::from_slice(&sig_bytes).unwrap();
    assert!(verifying.verify(message, &signature).is_ok());
}

#[tokio::test]
async fn sign_request_builds_expected_header_shape() {
    let signer = LocalSigner::from_seed(&[9u8; 32]).unwrap().without_siws();
    let headers = sign_request(&signer, "{}").await.unwrap();
    assert_eq!(headers.len(), 1);
    let (name, value) = &headers[0];
    assert_eq!(name, "Authorization");
    // tiny.place <agentId>:<sig>:<timestamp>
    assert!(value.starts_with("tiny.place "));
    let rest = value.strip_prefix("tiny.place ").unwrap();
    let parts: Vec<&str> = rest.splitn(3, ':').collect();
    assert_eq!(parts.len(), 3);
    assert_eq!(parts[0], signer.agent_id());
    assert!(parts[2].ends_with('Z')); // ISO timestamp
}

#[tokio::test]
async fn fresh_canonical_payload_is_versioned_token() {
    // Opt out of SIWS to exercise the raw freshness-bound signature scheme.
    let signer = LocalSigner::from_seed(&[5u8; 32]).unwrap().without_siws();
    let token = sign_fresh_canonical_payload(&signer, "payload")
        .await
        .unwrap();
    let parts: Vec<&str> = token.split(':').collect();
    assert_eq!(parts.len(), 4);
    assert_eq!(parts[0], "v1");
}

#[tokio::test]
async fn local_signer_defaults_to_siws() {
    use base64::Engine as _;

    let signer = LocalSigner::from_seed(&[7u8; 32]).unwrap();
    let token = signer.siws_signature().expect("SIWS minted by default");
    assert!(token.starts_with("siws:"));

    // Decode the proof and confirm it is signed by this key and names this wallet.
    let json = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(token.strip_prefix("siws:").unwrap())
        .unwrap();
    let value: serde_json::Value = serde_json::from_slice(&json).unwrap();
    let message = base64::engine::general_purpose::STANDARD
        .decode(value["signedMessage"].as_str().unwrap())
        .unwrap();
    let signature = base64::engine::general_purpose::STANDARD
        .decode(value["signature"].as_str().unwrap())
        .unwrap();
    let verifying = VerifyingKey::from_bytes(signer.public_key()).unwrap();
    verifying
        .verify(&message, &Signature::from_slice(&signature).unwrap())
        .expect("SIWS proof verifies against the key");
    let text = String::from_utf8(message).unwrap();
    assert_eq!(text.lines().nth(1).unwrap(), signer.agent_id());

    // The auth helpers emit the SIWS token by default.
    let fresh = sign_fresh_canonical_payload(&signer, "{}").await.unwrap();
    assert!(fresh.starts_with("siws:"));
}

#[tokio::test]
async fn siws_signer_passes_token_through() {
    let signer = SiwsSigner;

    let request = sign_request(&signer, "{}").await.unwrap();
    let directory = sign_directory_write(
        &signer,
        "wallet-public-key",
        "PUT",
        "/directory/agents/x",
        "{}",
    )
    .await
    .unwrap();
    let query = sign_directory_write_query(
        &signer,
        "wallet-public-key",
        "GET",
        "/marketplace/stream",
        "",
    )
    .await
    .unwrap();
    let canonical = sign_fresh_canonical_payload(&signer, "{}").await.unwrap();

    assert!(request[0]
        .1
        .starts_with("tiny.place wallet-address:siws:test-token:"));
    assert_eq!(
        directory
            .iter()
            .find(|(name, _)| name == "X-TinyPlace-Signature")
            .unwrap()
            .1,
        "siws:test-token"
    );
    assert!(query.contains("X-TinyPlace-Signature=siws%3Atest-token"));
    assert_eq!(canonical, "siws:test-token");
}

#[tokio::test]
async fn admin_request_includes_date_and_nonce() {
    let signer = LocalSigner::from_seed(&[11u8; 32]).unwrap();
    let opts = AdminSigningOptions {
        actor: Some("@root".into()),
        role: Some("operator".into()),
    };
    let headers = sign_admin_helper(&signer, &opts).await;
    let names: Vec<&str> = headers.iter().map(|(n, _)| n.as_str()).collect();
    assert!(names.contains(&"Authorization"));
    assert!(names.contains(&"X-TinyPlace-Date"));
    assert!(names.contains(&"X-TinyPlace-Nonce"));
    let auth = &headers
        .iter()
        .find(|(n, _)| n == "Authorization")
        .unwrap()
        .1;
    assert!(auth.starts_with("TinyPlace-Admin actor=\"@root\""));
    assert!(auth.contains("role=\"operator\""));
}

async fn sign_admin_helper(
    signer: &LocalSigner,
    opts: &AdminSigningOptions,
) -> Vec<(String, String)> {
    tinyplace::auth::sign_admin_request(signer, "POST", "/admin/config", "{}", opts)
        .await
        .unwrap()
}

#[test]
fn solana_secret_key_round_trips_64_and_32_bytes() {
    use tinyplace::crypto::{from_base64, public_key_to_hex};

    let base = LocalSigner::from_seed(&[4u8; 32]).unwrap();
    let seed = base.seed();
    let public = *base.public_key();

    // 64-byte secret = seed || public key
    let mut secret64 = Vec::with_capacity(64);
    secret64.extend_from_slice(&seed);
    secret64.extend_from_slice(&public);
    let from64 = LocalSigner::from_solana_secret_key_bytes(&secret64).unwrap();
    assert_eq!(from64.agent_id(), base.agent_id());

    // 32-byte secret = seed only
    let from32 = LocalSigner::from_solana_secret_key_bytes(&seed).unwrap();
    assert_eq!(from32.agent_id(), base.agent_id());

    // base58 string form
    let b58 = bs58::encode(&secret64).into_string();
    let from_str = LocalSigner::from_solana_secret_key(&b58).unwrap();
    assert_eq!(from_str.agent_id(), base.agent_id());

    // hex / base64 helpers
    assert_eq!(public_key_to_hex(&public).len(), 64);
    assert_eq!(
        from_base64(&base.public_key_base64()).unwrap(),
        public.to_vec()
    );
}

#[test]
fn solana_secret_key_rejects_bad_input() {
    // wrong length
    assert!(LocalSigner::from_solana_secret_key_bytes(&[0u8; 10]).is_err());
    // 64 bytes whose trailing public key does not match the seed
    let mut bad = vec![1u8; 32];
    bad.extend_from_slice(&[9u8; 32]);
    assert!(LocalSigner::from_solana_secret_key_bytes(&bad).is_err());
    // invalid base58
    assert!(LocalSigner::from_solana_secret_key("not base58 !!!").is_err());
}

#[test]
fn generate_produces_distinct_identities() {
    let a = LocalSigner::generate();
    let b = LocalSigner::generate();
    assert_ne!(a.agent_id(), b.agent_id());
    assert_eq!(a.public_key().len(), 32);
}

#[test]
fn base58_decode_round_trip() {
    use tinyplace::crypto::decode_base58;
    let encoded = bs58::encode([1u8, 2, 3, 4]).into_string();
    assert_eq!(decode_base58(&encoded).unwrap(), vec![1, 2, 3, 4]);
}

#[test]
fn auth_header_format() {
    assert_eq!(
        build_auth_header("@a", "SIG", "2026-01-01T00:00:00.000Z"),
        "tiny.place @a:SIG:2026-01-01T00:00:00.000Z"
    );
}
