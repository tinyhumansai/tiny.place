//! Endpoint tests for `RegistryApi`. Each test points the
//! client at a catch-all mock, invokes a method, and asserts the request method
//! and path. Response bodies are permissive — the goal is to exercise request
//! construction, auth signing, and the response pipeline.

mod common;

use common::*;
use serde_json::json;
use tinyplace::api::registry::RegisterRequest;
use tinyplace::types::{
    IdentityClaimRequest, IdentityTransferRequest, ProfileVisibilityUpdate, RenewalRequest,
    SubnameCreateRequest,
};

#[tokio::test]
async fn registry_register() {
    let server = any_ok(json!({"username": "@alice"})).await;
    let client = client_for(&server);
    let _ = client
        .registry
        .register(RegisterRequest {
            username: "alice".into(),
            crypto_id: "cid".into(),
            public_key: Some("pk".into()),
            ..Default::default()
        })
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/registry/names");
    // username normalized to @alice and a signature was added.
    let body: serde_json::Value = req.body_json().unwrap();
    assert_eq!(body["username"], "@alice");
    assert!(body["signature"].is_string());
}

#[tokio::test]
async fn registry_register_derives_public_key_from_crypto_id() {
    let server = any_ok(json!({"username": "@alice"})).await;
    let client = client_for(&server);
    let crypto_id = "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw";
    let _ = client
        .registry
        .register(RegisterRequest {
            username: "alice".into(),
            crypto_id: crypto_id.into(),
            // public_key omitted — the SDK derives it from crypto_id.
            ..Default::default()
        })
        .await;
    let req = only_request(&server).await;
    let body: serde_json::Value = req.body_json().unwrap();
    // base64(base58_decode(crypto_id)) — the key the backend derives too.
    assert_eq!(
        body["publicKey"],
        "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA="
    );
}

#[tokio::test]
async fn registry_get() {
    let server = any_ok(json!({"available": true})).await;
    let client = client_for(&server);
    let _ = client.registry.get("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("alice"));
}

#[tokio::test]
async fn registry_export() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.registry.export("@alice").await;
    let req = only_request(&server).await;
    assert!(req.url.path().ends_with("/export"));
}

#[tokio::test]
async fn registry_export_identity() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.registry.export_identity("@alice").await;
    let req = only_request(&server).await;
    assert!(req.url.path().ends_with("/export"));
}

#[tokio::test]
async fn registry_update_profile_visibility() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .registry
        .update_profile_visibility("@alice", ProfileVisibilityUpdate::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "PUT");
    assert!(req.url.path().ends_with("/profile-visibility"));
}

#[tokio::test]
async fn registry_renew() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .registry
        .renew("@alice", RenewalRequest::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/renew"));
}

#[tokio::test]
async fn registry_transfer() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .registry
        .transfer("@alice", IdentityTransferRequest::default())
        .await;
    let req = only_request(&server).await;
    assert!(req.url.path().ends_with("/transfer"));
}

#[tokio::test]
async fn registry_assign_and_unassign_primary() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.registry.assign_primary("@alice").await;
    let _ = client.registry.unassign_primary("@alice").await;
    let reqs = all_requests(&server).await;
    assert_eq!(reqs.len(), 2);
    assert!(reqs[0].url.path().ends_with("/assign"));
    assert!(reqs[1].url.path().ends_with("/unassign"));
}

#[tokio::test]
async fn registry_claim() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .registry
        .claim("@alice", IdentityClaimRequest::default())
        .await;
    let req = only_request(&server).await;
    assert!(req.url.path().ends_with("/claim"));
}

#[tokio::test]
async fn registry_create_subname() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .registry
        .create_subname("@alice", SubnameCreateRequest::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/subnames"));
}

#[tokio::test]
async fn registry_delete_subname() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.registry.delete_subname("@alice", "blog").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("subnames"));
}
