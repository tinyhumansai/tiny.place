//! Exercises the HTTP pipeline branches in `http.rs`: auth modes, query
//! building, response parsing (json / empty / 204), and error handling
//! (status, body, x402 payment challenges).

mod common;

use base64::Engine as _;
use common::*;
use serde_json::json;
use tinyplace::http::{HttpClient, HttpClientOptions};
use tinyplace::Error;
use wiremock::matchers::any;
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn get_parses_json_body() {
    let server = any_ok(json!({"status": "ok"})).await;
    let client = anon_client_for(&server);
    let value = client.healthz().await.unwrap();
    assert_eq!(value["status"], "ok");
}

#[tokio::test]
async fn signed_request_attaches_authorization_header() {
    let server = any_ok(json!({"escrows": []})).await;
    let client = client_for(&server);
    // escrow.list is a Signed (getAuth) request → Authorization: tiny.place ...
    let _ = client.escrow.list(None).await;
    let req = only_request(&server).await;
    let auth = req.headers.get("authorization").unwrap().to_str().unwrap();
    assert!(auth.starts_with("tiny.place "), "auth was {auth}");
}

#[tokio::test]
async fn agent_request_signs_with_directory_write_headers() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.inbox.counts(None).await;
    let req = only_request(&server).await;
    assert!(req.headers.contains_key("x-tinyplace-signature"));
    assert!(req.headers.contains_key("x-tinyplace-public-key"));
    assert!(req.headers.contains_key("x-tinyplace-date"));
    assert!(req.headers.contains_key("x-tinyplace-nonce"));
    assert!(req.headers.contains_key("x-agent-id"));
}

#[tokio::test]
async fn admin_request_signs_with_admin_authorization() {
    let server = any_ok(json!({"fees": []})).await;
    let client = client_for(&server);
    let _ = client.admin.list_fees().await;
    let req = only_request(&server).await;
    let auth = req.headers.get("authorization").unwrap().to_str().unwrap();
    assert!(auth.starts_with("TinyPlace-Admin "));
}

#[tokio::test]
async fn public_request_has_no_auth_header() {
    let server = any_ok(json!({"ok": true})).await;
    let client = anon_client_for(&server);
    let _ = client.healthz().await;
    let req = only_request(&server).await;
    assert!(!req.headers.contains_key("authorization"));
}

#[tokio::test]
async fn error_response_surfaces_status_and_body() {
    let server = any_status(404, json!({"error": "not found"})).await;
    let client = anon_client_for(&server);
    let err = client.healthz().await.unwrap_err();
    assert_eq!(err.status(), Some(404));
    assert_eq!(err.body().unwrap()["error"], "not found");
    assert!(err.http().is_some());
    assert!(err.to_string().contains("404"));
}

#[tokio::test]
async fn non_json_error_body_is_kept_as_string() {
    let server = MockServer::start().await;
    Mock::given(any())
        .respond_with(ResponseTemplate::new(500).set_body_string("boom"))
        .mount(&server)
        .await;
    let client = anon_client_for(&server);
    let err = client.healthz().await.unwrap_err();
    assert_eq!(err.status(), Some(500));
    assert_eq!(err.body().unwrap(), &json!("boom"));
}

#[tokio::test]
async fn payment_required_from_body() {
    let body = json!({
        "error": "payment required",
        "payment": { "scheme": "exact", "asset": "USDC", "amount": "1", "network": "solana" }
    });
    let server = any_status(402, body).await;
    let client = anon_client_for(&server);
    let err = client.healthz().await.unwrap_err();
    let challenge = err.payment_required().expect("payment challenge");
    assert_eq!(challenge.payment.amount.as_deref(), Some("1"));
    assert_eq!(challenge.error.as_deref(), Some("payment required"));
}

#[tokio::test]
async fn payment_required_from_header() {
    let challenge = json!({ "payment": { "amount": "5", "asset": "SOL" } });
    let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(serde_json::to_vec(&challenge).unwrap());
    let server = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(402)
                .insert_header("x-payment-required", encoded.as_str())
                .set_body_string(""),
        )
        .mount(&server)
        .await;
    let client = anon_client_for(&server);
    let err = client.healthz().await.unwrap_err();
    let parsed = err.payment_required().expect("challenge from header");
    assert_eq!(parsed.payment.amount.as_deref(), Some("5"));
}

#[tokio::test]
async fn no_content_returns_unit() {
    let server = any_no_content().await;
    let signer = test_signer();
    let http = HttpClient::new(HttpClientOptions {
        base_url: server.uri(),
        signer: Some(signer),
        ..Default::default()
    });
    let _: () = http.delete::<(), serde_json::Value>("/thing", None).await.unwrap();
}

#[tokio::test]
async fn on_auth_invalid_hook_fires_on_401() {
    use std::sync::atomic::{AtomicU16, Ordering};
    use std::sync::Arc;
    let server = any_status(401, json!({"error": "nope"})).await;
    let seen = Arc::new(AtomicU16::new(0));
    let seen_clone = seen.clone();
    let http = HttpClient::new(HttpClientOptions {
        base_url: server.uri(),
        on_auth_invalid: Some(Arc::new(move |status, _body| {
            seen_clone.store(status, Ordering::SeqCst);
        })),
        ..Default::default()
    });
    let _: Result<serde_json::Value, Error> = http.get("/x", &[]).await;
    assert_eq!(seen.load(Ordering::SeqCst), 401);
}

#[tokio::test]
async fn query_params_are_encoded_and_appended() {
    let server = any_ok(json!({"results": []})).await;
    let http = HttpClient::new(HttpClientOptions {
        base_url: server.uri(),
        ..Default::default()
    });
    let query = vec![
        ("q".to_string(), "a b&c".to_string()),
        ("tag".to_string(), "x".to_string()),
    ];
    let _: serde_json::Value = http.get("/search", &query).await.unwrap();
    let req = only_request(&server).await;
    let url = req.url.to_string();
    assert!(url.contains("q=a%20b%26c"), "url was {url}");
    assert!(url.contains("tag=x"));
}

#[tokio::test]
async fn get_text_returns_raw_body() {
    let server = MockServer::start().await;
    Mock::given(any())
        .respond_with(ResponseTemplate::new(200).set_body_string("plain text"))
        .mount(&server)
        .await;
    let http = HttpClient::new(HttpClientOptions {
        base_url: server.uri(),
        ..Default::default()
    });
    let text = http.get_text("/robots.txt", &[]).await.unwrap();
    assert_eq!(text, "plain text");
}

#[tokio::test]
async fn signing_public_key_exposed() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    assert!(client.http().signing_public_key().is_some());
    assert!(client.http().signer().is_some());
}
