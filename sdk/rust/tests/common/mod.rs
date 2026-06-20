//! Shared test harness: spins up a `wiremock` server and builds a
//! [`TinyPlaceClient`] pointed at it with a deterministic signer.
//!
//! The bulk API tests use [`any_ok`] / [`any_status`] catch-all servers and
//! simply invoke each method so the full request → auth-sign → send → parse
//! pipeline executes. Focused tests use exact matchers and assert behavior.

#![allow(dead_code)]

use std::sync::Arc;

use serde_json::{json, Value};
use tinyplace::{LocalSigner, TinyPlaceClient, TinyPlaceClientOptions};
use wiremock::matchers::any;
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

/// A fixed deterministic signer (seed of all 0x01) used across tests.
pub fn test_signer() -> Arc<LocalSigner> {
    Arc::new(LocalSigner::from_seed(&[1u8; 32]).unwrap())
}

/// Build a client (with both an agent signer and an admin signer) for `server`.
pub fn client_for(server: &MockServer) -> TinyPlaceClient {
    let signer = test_signer();
    TinyPlaceClient::new(TinyPlaceClientOptions {
        base_url: server.uri(),
        signer: Some(signer.clone()),
        admin_signer: Some(signer),
        admin: Default::default(),
        on_auth_invalid: None,
        ..Default::default()
    })
}

/// Build a client with no signer (public-only).
pub fn anon_client_for(server: &MockServer) -> TinyPlaceClient {
    TinyPlaceClient::new(TinyPlaceClientOptions {
        base_url: server.uri(),
        ..Default::default()
    })
}

/// A server that answers ANY request with `200` and the given JSON body.
pub async fn any_ok(body: Value) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(any())
        .respond_with(ResponseTemplate::new(200).set_body_json(body))
        .mount(&server)
        .await;
    server
}

/// A server that answers ANY request with `200` and an empty JSON object — a
/// permissive default for exercising request construction across many methods.
pub async fn any_empty_ok() -> MockServer {
    any_ok(json!({})).await
}

/// A server that answers ANY request with the given status + JSON body.
pub async fn any_status(status: u16, body: Value) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(any())
        .respond_with(ResponseTemplate::new(status).set_body_json(body))
        .mount(&server)
        .await;
    server
}

/// A server that answers ANY request with `204 No Content`.
pub async fn any_no_content() -> MockServer {
    let server = MockServer::start().await;
    Mock::given(any())
        .respond_with(ResponseTemplate::new(204))
        .mount(&server)
        .await;
    server
}

/// Return the single request the server received (panics if not exactly one).
pub async fn only_request(server: &MockServer) -> Request {
    let mut requests = server.received_requests().await.expect("recording enabled");
    assert_eq!(requests.len(), 1, "expected exactly one request");
    requests.remove(0)
}

/// All requests the server received, in order.
pub async fn all_requests(server: &MockServer) -> Vec<Request> {
    server.received_requests().await.expect("recording enabled")
}
