//! Standard x402 v2 HTTP transport: wire types + base64 header codec for the
//! inline payment flow. Mirrors `sdk/typescript/src/x402-standard.ts`.
//!
//! Flow: a client requests a resource; the server answers 402 with a base64
//! `PAYMENT-REQUIRED` header (a [`X402PaymentRequired`]); the client retries the
//! SAME request with a base64 `PAYMENT-SIGNATURE` header (a
//! [`X402PaymentPayload`]); the server verifies + settles inline and returns 200
//! with a base64 `PAYMENT-RESPONSE` header (a [`X402SettlementResponse`]).
//!
//! For the Solana `exact` scheme the payload carries a partially-signed
//! `TransferChecked` transaction under `payload.transaction`.

use base64::Engine as _;
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::solana::{build_exact_svm_transfer_transaction, ExactSvmTransferOptions};

/// The standard x402 protocol version this transport speaks.
pub const X402_VERSION: i64 = 2;

/// Canonical HTTP header names for the standard x402 v2 transport.
pub const X402_HEADER_PAYMENT_REQUIRED: &str = "PAYMENT-REQUIRED";
pub const X402_HEADER_PAYMENT_SIGNATURE: &str = "PAYMENT-SIGNATURE";
pub const X402_HEADER_PAYMENT_RESPONSE: &str = "PAYMENT-RESPONSE";

/// A single acceptable payment method in a 402 challenge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct X402PaymentRequirements {
    pub scheme: String,
    pub network: String,
    pub amount: String,
    pub asset: String,
    #[serde(rename = "payTo")]
    pub pay_to: String,
    #[serde(rename = "maxTimeoutSeconds", skip_serializing_if = "Option::is_none")]
    pub max_timeout_seconds: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

impl X402PaymentRequirements {
    /// The `extra.feePayer` string, if present.
    pub fn fee_payer(&self) -> Option<&str> {
        self.extra
            .as_ref()
            .and_then(|extra| extra.get("feePayer"))
            .and_then(|value| value.as_str())
    }

    /// The `extra.memo` string, if present.
    pub fn memo(&self) -> Option<&str> {
        self.extra
            .as_ref()
            .and_then(|extra| extra.get("memo"))
            .and_then(|value| value.as_str())
    }
}

/// The 402 challenge object (base64 in the `PAYMENT-REQUIRED` header).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct X402PaymentRequired {
    #[serde(rename = "x402Version")]
    pub x402_version: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<serde_json::Value>,
    pub accepts: Vec<X402PaymentRequirements>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extensions: Option<serde_json::Value>,
}

/// The payment authorization object (base64 in the `PAYMENT-SIGNATURE` header).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct X402PaymentPayload {
    #[serde(rename = "x402Version")]
    pub x402_version: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<serde_json::Value>,
    pub accepted: X402PaymentRequirements,
    pub payload: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extensions: Option<serde_json::Value>,
}

/// The settlement result object (base64 in the `PAYMENT-RESPONSE` header).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct X402SettlementResponse {
    pub success: bool,
    #[serde(rename = "errorReason", skip_serializing_if = "Option::is_none")]
    pub error_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payer: Option<String>,
    #[serde(default)]
    pub transaction: String,
    #[serde(default)]
    pub network: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extensions: Option<serde_json::Value>,
}

/// Decode a base64 (standard or base64url, padded or not) JSON header.
fn decode_header<T: serde::de::DeserializeOwned>(value: &str) -> Option<T> {
    let normalized = value.trim().replace('-', "+").replace('_', "/");
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&normalized)
        .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(&normalized))
        .ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Encode a value as a base64 JSON header (standard base64).
pub fn encode_x402_header<T: Serialize>(value: &T) -> Result<String> {
    let json = serde_json::to_vec(value)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(json))
}

/// Decode the `PAYMENT-REQUIRED` challenge header.
pub fn decode_payment_required(value: &str) -> Option<X402PaymentRequired> {
    let decoded: X402PaymentRequired = decode_header(value)?;
    Some(decoded)
}

/// Decode the `PAYMENT-RESPONSE` settlement header.
pub fn decode_settlement_response(value: &str) -> Option<X402SettlementResponse> {
    decode_header(value)
}

/// Encode a [`X402PaymentPayload`] for the `PAYMENT-SIGNATURE` header.
pub fn encode_payment_signature(payload: &X402PaymentPayload) -> Result<String> {
    encode_x402_header(payload)
}

/// Select the Solana `exact` requirement from a challenge's `accepts[]` — the
/// only scheme tiny.place clients fulfil. Returns `None` when none is offered.
pub fn select_exact_svm_requirement(
    challenge: &X402PaymentRequired,
) -> Option<&X402PaymentRequirements> {
    challenge
        .accepts
        .iter()
        .find(|entry| entry.scheme == "exact" && entry.network.starts_with("solana:"))
}

/// Options for [`build_exact_svm_payment_payload`].
pub struct BuildExactSvmPayloadOptions<'a> {
    /// The 402 challenge decoded from the `PAYMENT-REQUIRED` header.
    pub challenge: &'a X402PaymentRequired,
    /// The payer's Solana secret key (32-byte seed or 64-byte keypair).
    pub secret_key: Vec<u8>,
    /// The Solana RPC URL used to fetch a recent blockhash.
    pub rpc_url: String,
    /// Override the SPL mint decimals (defaults to the resolved asset, else 6).
    pub decimals: Option<u8>,
    /// The reqwest client used for the blockhash RPC.
    pub client: &'a reqwest::Client,
}

/// Build the standard `PaymentPayload` for the Solana `exact` requirement in a
/// 402 challenge: fetch a recent blockhash, construct the partially-signed
/// `TransferChecked` transaction (fee payer = `extra.feePayer`, destination =
/// ATA(payTo, asset), Memo = `extra.memo` or a random nonce), and wrap it in the
/// v2 envelope (`{ x402Version, accepted, payload: { transaction } }`).
pub async fn build_exact_svm_payment_payload(
    options: BuildExactSvmPayloadOptions<'_>,
) -> Result<X402PaymentPayload> {
    let accepted = select_exact_svm_requirement(options.challenge).ok_or_else(|| {
        Error::InvalidArgument("x402 challenge offers no Solana exact-scheme payment method".into())
    })?;
    let fee_payer = accepted.fee_payer().ok_or_else(|| {
        Error::InvalidArgument("x402 exact-SVM challenge is missing extra.feePayer".into())
    })?;
    let memo = accepted.memo().map(str::to_string);
    let decimals = options
        .decimals
        .or_else(|| crate::assets::resolve_solana_asset(&accepted.asset).map(|a| a.decimals))
        .unwrap_or(6);

    let recent_blockhash =
        crate::solana::get_recent_blockhash(options.client, &options.rpc_url, "confirmed").await?;

    let built = build_exact_svm_transfer_transaction(ExactSvmTransferOptions {
        secret_key: options.secret_key,
        fee_payer: fee_payer.to_string(),
        pay_to: accepted.pay_to.clone(),
        mint: accepted.asset.clone(),
        amount: accepted.amount.clone(),
        decimals,
        recent_blockhash,
        memo,
        source_token_account: None,
        compute_unit_limit: None,
        compute_unit_price_micro_lamports: None,
    })?;

    Ok(X402PaymentPayload {
        x402_version: X402_VERSION,
        resource: options.challenge.resource.clone(),
        accepted: accepted.clone(),
        payload: serde_json::json!({ "transaction": built.transaction }),
        extensions: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrips_challenge_header() {
        let challenge = X402PaymentRequired {
            x402_version: 2,
            error: Some("payment required".into()),
            resource: None,
            accepts: vec![X402PaymentRequirements {
                scheme: "exact".into(),
                network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp".into(),
                amount: "1000000".into(),
                asset: super::super::solana::SOLANA_USDC_MINT.into(),
                pay_to: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM".into(),
                max_timeout_seconds: Some(60),
                extra: Some(serde_json::json!({ "feePayer": "FEE" })),
            }],
            extensions: None,
        };
        let encoded = encode_x402_header(&challenge).unwrap();
        let decoded = decode_payment_required(&encoded).unwrap();
        let selected = select_exact_svm_requirement(&decoded).unwrap();
        assert_eq!(selected.fee_payer(), Some("FEE"));
        assert_eq!(selected.amount, "1000000");
    }

    #[test]
    fn tolerates_base64url() {
        let challenge = X402PaymentRequired {
            x402_version: 2,
            error: None,
            resource: None,
            accepts: vec![],
            extensions: None,
        };
        let json = serde_json::to_vec(&challenge).unwrap();
        let url = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json);
        assert!(decode_payment_required(&url).is_some());
    }
}
