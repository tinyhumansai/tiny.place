//! x402 payment authorizations. Mirrors `sdk/typescript/src/x402.ts`.
//!
//! Builds and signs the canonical x402 message (insertion-ordered, with
//! key-sorted metadata) and flattens the authorization into the
//! `X402PaymentMap` string map the backend's payment header carries.

use std::collections::HashMap;

use base64::Engine as _;
use rand::RngCore as _;
use serde_json::json;

use crate::crypto::{to_base64, to_hex};
use crate::error::Result;
use crate::signer::Signer;

/// A flat string map representing a signed payment (the `X402PaymentMap`).
pub type X402PaymentMap = HashMap<String, String>;

/// The signed fields of an x402 authorization.
#[derive(Debug, Clone)]
pub struct X402AuthorizationFields {
    /// `"exact" | "upto" | "batch-settlement"`.
    pub scheme: String,
    pub network: String,
    pub asset: String,
    pub amount: String,
    pub from: String,
    pub to: String,
    pub nonce: String,
    pub expires_at: String,
    pub metadata: Option<HashMap<String, String>>,
}

/// A signed x402 authorization.
#[derive(Debug, Clone)]
pub struct X402Authorization {
    pub fields: X402AuthorizationFields,
    pub signature: String,
}

/// Options for building a payment authorization.
#[derive(Debug, Clone, Default)]
pub struct X402PaymentAuthorizationOptions {
    pub scheme: Option<String>,
    pub network: String,
    pub asset: String,
    pub amount: String,
    pub from: Option<String>,
    pub to: String,
    pub nonce: Option<String>,
    pub expires_at: Option<String>,
    pub expires_in_ms: Option<i64>,
    pub metadata: Option<HashMap<String, String>>,
    pub domain: Option<String>,
    pub public_key_base64: Option<String>,
    /// On-chain / ledger references attached to the payment map.
    pub references: X402PaymentReferenceOptions,
}

/// On-chain or ledger references carried alongside a payment.
#[derive(Debug, Clone, Default)]
pub struct X402PaymentReferenceOptions {
    pub on_chain_tx: Option<String>,
    pub tx: Option<String>,
    pub transaction: Option<String>,
    pub ledger_tx_id: Option<String>,
    pub verified_id: Option<String>,
}

/// Build the canonical message that is signed for an x402 authorization.
///
/// Key order is significant (it is preserved, not sorted): optional `domain`,
/// then `scheme, network, asset, amount, from, to, nonce`, optional `expiresAt`,
/// then `metadata` as a key-sorted array of `{key, value}` objects.
pub fn build_canonical_message(fields: &X402AuthorizationFields) -> String {
    let mut parts: Vec<String> = Vec::new();

    let domain = fields
        .metadata
        .as_ref()
        .and_then(|m| m.get("domain"))
        .filter(|d| !d.is_empty());
    if let Some(domain) = domain {
        parts.push(json_field("domain", &json_string(domain)));
    }
    parts.push(json_field("scheme", &json_string(&fields.scheme)));
    parts.push(json_field("network", &json_string(&fields.network)));
    parts.push(json_field("asset", &json_string(&fields.asset)));
    parts.push(json_field("amount", &json_string(&fields.amount)));
    parts.push(json_field("from", &json_string(&fields.from)));
    parts.push(json_field("to", &json_string(&fields.to)));
    parts.push(json_field("nonce", &json_string(&fields.nonce)));
    if !fields.expires_at.is_empty() {
        parts.push(json_field("expiresAt", &json_string(&fields.expires_at)));
    }
    if let Some(metadata) = &fields.metadata {
        parts.push(json_field("metadata", &sorted_metadata_array(metadata)));
    }

    format!("{{{}}}", parts.join(","))
}

/// Sign the canonical message of `fields`, returning the authorization.
pub async fn sign_x402_authorization(
    signer: &dyn Signer,
    fields: X402AuthorizationFields,
) -> Result<X402Authorization> {
    let message = build_canonical_message(&fields);
    let signature = signer.sign(message.as_bytes()).await?;
    Ok(X402Authorization {
        fields,
        signature: to_base64(&signature),
    })
}

/// Build and sign a payment authorization from options, applying defaults.
pub async fn build_x402_payment_authorization(
    signer: &dyn Signer,
    options: X402PaymentAuthorizationOptions,
) -> Result<X402Authorization> {
    let public_key_base64 = options
        .public_key_base64
        .clone()
        .unwrap_or_else(|| signer.public_key_base64());

    let mut metadata: HashMap<String, String> = HashMap::new();
    metadata.insert(
        "domain".to_string(),
        options
            .domain
            .clone()
            .unwrap_or_else(|| "tiny.place".to_string()),
    );
    if !public_key_base64.is_empty() {
        metadata.insert("publicKey".to_string(), public_key_base64);
    }
    if let Some(extra) = &options.metadata {
        for (key, value) in extra {
            metadata.insert(key.clone(), value.clone());
        }
    }

    let expires_at = options.expires_at.clone().unwrap_or_else(|| {
        let offset = options.expires_in_ms.unwrap_or(5 * 60 * 1000);
        (chrono::Utc::now() + chrono::Duration::milliseconds(offset))
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string()
    });

    let fields = X402AuthorizationFields {
        scheme: options
            .scheme
            .clone()
            .unwrap_or_else(|| "exact".to_string()),
        network: options.network,
        asset: options.asset,
        amount: options.amount,
        from: options.from.clone().unwrap_or_else(|| signer.agent_id()),
        to: options.to,
        nonce: options
            .nonce
            .clone()
            .unwrap_or_else(|| generate_nonce(Some("pay"))),
        expires_at,
        metadata: Some(metadata),
    };
    sign_x402_authorization(signer, fields).await
}

/// Build a flat payment map (authorization fields + metadata + references).
pub async fn build_x402_payment_map(
    signer: &dyn Signer,
    mut options: X402PaymentAuthorizationOptions,
) -> Result<X402PaymentMap> {
    let references = payment_references(&options.references);
    // References are also folded into the signed metadata, matching the TS SDK.
    let mut metadata = options.metadata.take().unwrap_or_default();
    for (key, value) in &references {
        metadata.insert(key.clone(), value.clone());
    }
    options.metadata = Some(metadata);

    let authorization = build_x402_payment_authorization(signer, options).await?;
    let mut map = x402_authorization_to_payment_map(&authorization);
    for (key, value) in references {
        map.insert(key, value);
    }
    Ok(map)
}

/// Flatten a signed authorization into the payment map sent to the backend.
pub fn x402_authorization_to_payment_map(authorization: &X402Authorization) -> X402PaymentMap {
    let f = &authorization.fields;
    let mut map: X402PaymentMap = HashMap::new();
    map.insert("scheme".to_string(), f.scheme.clone());
    map.insert("network".to_string(), f.network.clone());
    map.insert("asset".to_string(), f.asset.clone());
    map.insert("amount".to_string(), f.amount.clone());
    map.insert("from".to_string(), f.from.clone());
    map.insert("to".to_string(), f.to.clone());
    map.insert("nonce".to_string(), f.nonce.clone());
    map.insert("expiresAt".to_string(), f.expires_at.clone());
    map.insert("signature".to_string(), authorization.signature.clone());
    if let Some(metadata) = &f.metadata {
        for (key, value) in metadata {
            map.insert(format!("metadata.{key}"), value.clone());
        }
    }
    map
}

/// The canonical x402 v2 submission header. A migrated SDK (or any standard
/// x402 client) base64-encodes the PaymentPayload envelope and submits it in
/// this header. The legacy `X-PAYMENT` header is still accepted by the backend
/// for backwards compatibility.
pub const X402_PAYMENT_HEADER: &str = "PAYMENT-SIGNATURE";

/// Build the standard x402 v2 PaymentPayload envelope from an authorization.
///
/// tiny.place's authorization signature travels as the scheme-specific
/// `payload`; a standard client base64-encodes this envelope and submits it in
/// the [`X402_PAYMENT_HEADER`] (`PAYMENT-SIGNATURE`) header on the header-based
/// payment surfaces (e.g. a2a).
pub fn build_x402_payment_envelope(authorization: &X402Authorization) -> serde_json::Value {
    let f = &authorization.fields;
    let extra: serde_json::Map<String, serde_json::Value> = f
        .metadata
        .as_ref()
        .map(|m| {
            m.iter()
                .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
                .collect()
        })
        .unwrap_or_default();

    let mut payload_authorization = serde_json::Map::new();
    payload_authorization.insert("from".to_string(), json!(f.from));
    payload_authorization.insert("to".to_string(), json!(f.to));
    payload_authorization.insert("value".to_string(), json!(f.amount));
    payload_authorization.insert("nonce".to_string(), json!(f.nonce));
    if !f.expires_at.is_empty() {
        payload_authorization.insert("validBefore".to_string(), json!(f.expires_at));
    }

    json!({
        "x402Version": 2,
        "accepted": {
            "scheme": f.scheme,
            "network": f.network,
            "amount": f.amount,
            "asset": f.asset,
            "payTo": f.to,
            "maxTimeoutSeconds": 60,
            "extra": extra,
        },
        "payload": {
            "signature": authorization.signature,
            "authorization": payload_authorization,
        },
        "extensions": {},
    })
}

/// Encode an authorization as the base64 [`X402_PAYMENT_HEADER`]
/// (`PAYMENT-SIGNATURE`) header value — the standard x402 v2 submission format.
/// Mirrors the backend's `x402::ParseInboundPayment`.
pub fn encode_x402_payment_header(authorization: &X402Authorization) -> String {
    let envelope = build_x402_payment_envelope(authorization);
    let raw = serde_json::to_vec(&envelope).expect("envelope serialization cannot fail");
    base64::engine::general_purpose::STANDARD.encode(raw)
}

fn payment_references(options: &X402PaymentReferenceOptions) -> X402PaymentMap {
    let mut references = HashMap::new();
    let mut insert = |key: &str, value: &Option<String>| {
        if let Some(value) = value {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                references.insert(key.to_string(), trimmed.to_string());
            }
        }
    };
    insert("onChainTx", &options.on_chain_tx);
    insert("tx", &options.tx);
    insert("transaction", &options.transaction);
    insert("ledgerTxId", &options.ledger_tx_id);
    insert("verifiedId", &options.verified_id);
    references
}

/// Generate a hex nonce, optionally prefixed (`<prefix>_<hex>`).
pub fn generate_nonce(prefix: Option<&str>) -> String {
    let mut random = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let hex = to_hex(&random);
    match prefix {
        Some(prefix) => format!("{prefix}_{hex}"),
        None => hex,
    }
}

fn json_field(key: &str, raw_value: &str) -> String {
    format!("{}:{}", json_string(key), raw_value)
}

fn json_string(value: &str) -> String {
    serde_json::to_string(value).expect("string serialization cannot fail")
}

fn sorted_metadata_array(metadata: &HashMap<String, String>) -> String {
    let mut keys: Vec<&String> = metadata.keys().collect();
    keys.sort();
    let entries: Vec<String> = keys
        .iter()
        .map(|key| {
            format!(
                "{{{}:{},{}:{}}}",
                json_string("key"),
                json_string(key),
                json_string("value"),
                json_string(&metadata[*key])
            )
        })
        .collect();
    format!("[{}]", entries.join(","))
}
