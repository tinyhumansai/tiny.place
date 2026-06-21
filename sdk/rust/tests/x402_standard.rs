//! x402 v2 standard-conformance tests for the Rust SDK: the SDK identification
//! header, parsing the 402 challenge from the standard `accepts[]` array, and
//! encoding the standard `X-PAYMENT` PaymentPayload envelope.

use std::collections::HashMap;

use base64::Engine as _;
use serde_json::json;
use tinyplace::{
    build_x402_payment_envelope, encode_x402_payment_header, Error, HttpClient, HttpClientOptions,
    RetryOptions, X402Authorization, X402AuthorizationFields, X402_PAYMENT_HEADER,
};

#[test]
fn exposes_canonical_submission_header() {
    assert_eq!(X402_PAYMENT_HEADER, "PAYMENT-SIGNATURE");
}
use wiremock::matchers::any;
use wiremock::{Mock, MockServer, ResponseTemplate};

fn http_for(uri: String) -> HttpClient {
    HttpClient::new(HttpClientOptions {
        base_url: uri,
        retry: RetryOptions {
            retries: 0,
            ..Default::default()
        },
        ..Default::default()
    })
}

#[tokio::test]
async fn sends_sdk_identification_header() {
    let server = MockServer::start().await;
    Mock::given(any())
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({})))
        .mount(&server)
        .await;
    let http = http_for(server.uri());

    let _: serde_json::Value = http.get("/thing", &[]).await.unwrap();

    let requests = server.received_requests().await.unwrap();
    let header = requests[0]
        .headers
        .get("x-tinyplace-sdk")
        .expect("X-Tinyplace-SDK header present")
        .to_str()
        .unwrap();
    assert!(header.starts_with("rust/"), "got {header}");
}

#[tokio::test]
async fn parses_challenge_from_standard_accepts() {
    let body = json!({
        "error": "payment required",
        "x402Version": 2,
        "resource": { "url": "https://tiny.place" },
        "accepts": [{
            "scheme": "exact",
            "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            "amount": "1000000",
            "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "payTo": "treasury-address",
            "maxTimeoutSeconds": 60,
            "extra": {
                "domain": "tiny.place",
                "feePayer": "facilitator-address",
                "from": "payer-address",
                "nonce": "nonce-xyz",
                "expiresAt": "2026-06-21T00:00:00Z"
            }
        }],
        "extensions": {}
    });
    let server = MockServer::start().await;
    Mock::given(any())
        .respond_with(ResponseTemplate::new(402).set_body_json(body))
        .mount(&server)
        .await;
    let http = http_for(server.uri());

    let err: Error = http
        .get::<serde_json::Value>("/thing", &[])
        .await
        .unwrap_err();
    let challenge = err
        .payment_required()
        .expect("challenge parsed from accepts");
    let payment = &challenge.payment;
    assert_eq!(payment.amount.as_deref(), Some("1000000"));
    assert_eq!(payment.to.as_deref(), Some("treasury-address")); // payTo -> to
                                                                 // Binding fields promoted out of extra.
    assert_eq!(payment.from.as_deref(), Some("payer-address"));
    assert_eq!(payment.nonce.as_deref(), Some("nonce-xyz"));
    assert_eq!(payment.expires_at.as_deref(), Some("2026-06-21T00:00:00Z"));
    // Remaining extra becomes metadata; binding keys are not duplicated in.
    let metadata = payment.metadata.as_ref().expect("metadata present");
    assert_eq!(
        metadata.get("domain").map(String::as_str),
        Some("tiny.place")
    );
    assert_eq!(
        metadata.get("feePayer").map(String::as_str),
        Some("facilitator-address")
    );
    assert!(!metadata.contains_key("nonce"));
    assert!(!metadata.contains_key("from"));
}

#[tokio::test]
async fn falls_back_to_legacy_payment_field() {
    let body =
        json!({ "error": "payment required", "payment": { "amount": "500", "to": "treasury" } });
    let server = MockServer::start().await;
    Mock::given(any())
        .respond_with(ResponseTemplate::new(402).set_body_json(body))
        .mount(&server)
        .await;
    let http = http_for(server.uri());

    let err: Error = http
        .get::<serde_json::Value>("/thing", &[])
        .await
        .unwrap_err();
    let challenge = err.payment_required().expect("legacy challenge parsed");
    assert_eq!(challenge.payment.amount.as_deref(), Some("500"));
}

#[test]
fn encodes_standard_x_payment_envelope() {
    let mut metadata = HashMap::new();
    metadata.insert("domain".to_string(), "tiny.place".to_string());
    metadata.insert("feePayer".to_string(), "facilitator".to_string());
    let authorization = X402Authorization {
        fields: X402AuthorizationFields {
            scheme: "exact".into(),
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp".into(),
            asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v".into(),
            amount: "1000000".into(),
            from: "payer".into(),
            to: "treasury".into(),
            nonce: "pay_test".into(),
            expires_at: "2026-06-21T00:00:00Z".into(),
            metadata: Some(metadata),
        },
        signature: "v1:ts:nonce:sig".into(),
    };

    let envelope = build_x402_payment_envelope(&authorization);
    assert_eq!(envelope["x402Version"], 2);
    assert_eq!(envelope["accepted"]["payTo"], "treasury");
    assert_eq!(envelope["accepted"]["extra"]["feePayer"], "facilitator");
    assert_eq!(envelope["payload"]["signature"], "v1:ts:nonce:sig");
    assert_eq!(envelope["payload"]["authorization"]["value"], "1000000");
    assert_eq!(
        envelope["payload"]["authorization"]["validBefore"],
        "2026-06-21T00:00:00Z"
    );

    let header = encode_x402_payment_header(&authorization);
    let decoded: serde_json::Value = serde_json::from_slice(
        &base64::engine::general_purpose::STANDARD
            .decode(header)
            .unwrap(),
    )
    .unwrap();
    assert_eq!(decoded, envelope);
}
