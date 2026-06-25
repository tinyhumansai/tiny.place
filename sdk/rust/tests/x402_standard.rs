//! Tests for the standard x402 v2 transport + Solana `exact` transaction
//! building: the ATA oracle vector, the built-tx byte structure, and an
//! end-to-end 402 → pay → 200 auto-pay flow asserting the PAYMENT-SIGNATURE
//! envelope.

mod common;

use base64::Engine as _;
use common::*;
use serde_json::json;
use tinyplace::solana::{
    build_exact_svm_transfer_transaction, derive_associated_token_address, ExactSvmTransferOptions,
    SOLANA_MAINNET_NETWORK, SOLANA_USDC_MINT,
};
use tinyplace::x402_standard::{
    encode_x402_header, X402PaymentPayload, X402PaymentRequired, X402PaymentRequirements,
};
use tinyplace::{LocalSigner, Signer, TinyPlaceClient, TinyPlaceClientOptions, X402PayerConfig};
use wiremock::matchers::{any, header_exists, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const FEE_PAYER: &str = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const PAY_TO: &str = "7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK";
const RECENT_BLOCKHASH: &str = "GfVcyD4kkQK7Yk5kJyFp6JxqXY9aUw3ZpkRsr1xqe3Cn";

fn payer_secret() -> [u8; 32] {
    // A fixed 32-byte seed; its public key differs from FEE_PAYER.
    [7u8; 32]
}

#[test]
fn ata_oracle_vector() {
    let ata = derive_associated_token_address(FEE_PAYER, SOLANA_USDC_MINT).unwrap();
    assert_eq!(ata, "FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B");
}

#[test]
fn built_transaction_structure() {
    let built = build_exact_svm_transfer_transaction(ExactSvmTransferOptions {
        secret_key: payer_secret().to_vec(),
        fee_payer: FEE_PAYER.to_string(),
        pay_to: PAY_TO.to_string(),
        mint: SOLANA_USDC_MINT.to_string(),
        amount: "1000000".to_string(),
        decimals: 6,
        recent_blockhash: RECENT_BLOCKHASH.to_string(),
        memo: Some("test-memo".to_string()),
        source_token_account: None,
        compute_unit_limit: None,
        compute_unit_price_micro_lamports: None,
    })
    .unwrap();

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&built.transaction)
        .unwrap();

    // signatures: short-vec count == 2, then 2 * 64 bytes.
    let mut cursor = 0usize;
    assert_eq!(bytes[cursor], 2, "expected 2 signatures");
    cursor += 1;
    // signatures[0] (fee payer) must be all-zero.
    assert!(
        bytes[cursor..cursor + 64].iter().all(|b| *b == 0),
        "fee-payer signature must be zeroed"
    );
    cursor += 64;
    // signatures[1] (authority) must be non-zero.
    assert!(
        bytes[cursor..cursor + 64].iter().any(|b| *b != 0),
        "authority signature must be present"
    );
    cursor += 64;

    // message header: [numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned]
    assert_eq!(&bytes[cursor..cursor + 3], &[2, 1, 4], "header mismatch");
    cursor += 3;

    // account keys short-vec count == 8.
    assert_eq!(bytes[cursor], 8, "expected 8 accounts");
    cursor += 1;
    cursor += 8 * 32; // 8 account pubkeys
    cursor += 32; // recent blockhash

    // instruction count short-vec == 4.
    assert_eq!(bytes[cursor], 4, "expected 4 instructions");
}

#[test]
fn built_transaction_rejects_self_fee_payer() {
    // Use the payer's own pubkey as the fee payer → must error.
    let signer = LocalSigner::from_seed(&payer_secret()).unwrap();
    let result = build_exact_svm_transfer_transaction(ExactSvmTransferOptions {
        secret_key: payer_secret().to_vec(),
        fee_payer: signer.agent_id(),
        pay_to: PAY_TO.to_string(),
        mint: SOLANA_USDC_MINT.to_string(),
        amount: "1".to_string(),
        decimals: 6,
        recent_blockhash: RECENT_BLOCKHASH.to_string(),
        memo: None,
        source_token_account: None,
        compute_unit_limit: None,
        compute_unit_price_micro_lamports: None,
    });
    assert!(result.is_err());
}

/// A mock Solana RPC server answering `getLatestBlockhash`.
async fn mock_solana_rpc() -> MockServer {
    let server = MockServer::start().await;
    Mock::given(any())
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "jsonrpc": "2.0",
            "id": "getLatestBlockhash",
            "result": { "value": { "blockhash": RECENT_BLOCKHASH } }
        })))
        .mount(&server)
        .await;
    server
}

fn challenge_header() -> String {
    let challenge = X402PaymentRequired {
        x402_version: 2,
        error: Some("payment required".into()),
        resource: None,
        accepts: vec![X402PaymentRequirements {
            scheme: "exact".into(),
            network: SOLANA_MAINNET_NETWORK.into(),
            amount: "1000000".into(),
            asset: SOLANA_USDC_MINT.into(),
            pay_to: PAY_TO.into(),
            max_timeout_seconds: Some(60),
            extra: Some(json!({ "feePayer": FEE_PAYER })),
        }],
        extensions: None,
    };
    encode_x402_header(&challenge).unwrap()
}

#[tokio::test]
async fn auto_pays_402_with_payment_signature() {
    let rpc = mock_solana_rpc().await;
    let api = MockServer::start().await;

    // First request (no PAYMENT-SIGNATURE) → 402 with PAYMENT-REQUIRED.
    Mock::given(method("GET"))
        .and(path("/protected"))
        .respond_with(
            ResponseTemplate::new(402).insert_header("PAYMENT-REQUIRED", challenge_header()),
        )
        .up_to_n_times(1)
        .mount(&api)
        .await;

    // Retry (carries PAYMENT-SIGNATURE) → 200 with PAYMENT-RESPONSE.
    let settlement = encode_x402_header(&json!({
        "success": true,
        "transaction": "sig123",
        "network": SOLANA_MAINNET_NETWORK,
    }))
    .unwrap();
    Mock::given(method("GET"))
        .and(path("/protected"))
        .and(header_exists("PAYMENT-SIGNATURE"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("PAYMENT-RESPONSE", settlement)
                .set_body_json(json!({ "ok": true })),
        )
        .mount(&api)
        .await;

    let signer = std::sync::Arc::new(LocalSigner::from_seed(&payer_secret()).unwrap());
    let client = TinyPlaceClient::new(TinyPlaceClientOptions {
        base_url: api.uri(),
        signer: Some(signer),
        x402_payer: Some(X402PayerConfig {
            secret_key: payer_secret().to_vec(),
            rpc_url: format!("{}/", rpc.uri()),
            on_settled: None,
        }),
        ..Default::default()
    });

    let result: serde_json::Value = client.http().get("/protected", &[]).await.unwrap();
    assert_eq!(result["ok"], json!(true));

    // The retry must have carried a valid PAYMENT-SIGNATURE envelope.
    let requests = api.received_requests().await.unwrap();
    let paid = requests
        .iter()
        .find(|r| r.headers.contains_key("payment-signature"))
        .expect("a retry with PAYMENT-SIGNATURE");
    let header = paid
        .headers
        .get("payment-signature")
        .unwrap()
        .to_str()
        .unwrap();
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(header)
        .unwrap();
    let payload: X402PaymentPayload = serde_json::from_slice(&decoded).unwrap();
    assert_eq!(payload.x402_version, 2);
    assert_eq!(payload.accepted.scheme, "exact");
    assert_eq!(payload.accepted.amount, "1000000");
    assert!(payload.payload.get("transaction").is_some());
}

#[tokio::test]
async fn surfaces_402_when_no_payer_configured() {
    let api = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(402).insert_header("PAYMENT-REQUIRED", challenge_header()),
        )
        .mount(&api)
        .await;

    let client = client_for(&api);
    let result: tinyplace::Result<serde_json::Value> = client.http().get("/protected", &[]).await;
    let err = result.unwrap_err();
    assert_eq!(err.status(), Some(402));
}
