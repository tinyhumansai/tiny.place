//! Endpoint tests for `UsersApi`, `ProfilesApi`, and `DirectoryApi`. Each test
//! points the client at a catch-all mock, invokes a method, and asserts the
//! request method and a key path segment. Response bodies are permissive — the
//! goal is to exercise request construction, auth signing, and the response
//! pipeline.

mod common;

use common::*;
use serde_json::json;
use tinyplace::api::directory::DirectorySkillsParams;
use tinyplace::types::{
    AgentCard, AgentQueryParams, ExtendedAgentCard, UserEmailVerificationConfirmRequest,
    UserEmailVerificationRequest, UserProfileUpdate,
};

// --- UsersApi ---

#[tokio::test]
async fn users_get() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.users.get("cid123").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("users"));
    assert!(req.url.path().contains("cid123"));
}

#[tokio::test]
async fn users_update_profile() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .users
        .update_profile("cid123", UserProfileUpdate::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "PUT");
    assert!(req.url.path().contains("users"));
    assert!(req.url.path().ends_with("/profile"));
}

#[tokio::test]
async fn users_start_email_verification() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .users
        .start_email_verification(
            "cid123",
            UserEmailVerificationRequest {
                email: "a@example.com".into(),
                ..Default::default()
            },
        )
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/email/verification"));
}

#[tokio::test]
async fn users_confirm_email_verification() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .users
        .confirm_email_verification(
            "cid123",
            UserEmailVerificationConfirmRequest {
                email: "a@example.com".into(),
                code: "123456".into(),
                ..Default::default()
            },
        )
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/email/verification/confirm"));
}

// --- ProfilesApi ---

#[tokio::test]
async fn profiles_get() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.profiles.get("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("profiles"));
    assert!(req.url.path().contains("alice"));
}

#[tokio::test]
async fn profiles_activity() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.profiles.activity("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().ends_with("/activity"));
}

#[tokio::test]
async fn profiles_groups() {
    let server = any_ok(json!({"groups": []})).await;
    let client = client_for(&server);
    let _ = client.profiles.groups("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().ends_with("/groups"));
}

#[tokio::test]
async fn profiles_broadcasts() {
    let server = any_ok(json!({"broadcasts": []})).await;
    let client = client_for(&server);
    let _ = client.profiles.broadcasts("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().ends_with("/broadcasts"));
}

#[tokio::test]
async fn profiles_attestations() {
    let server = any_ok(json!({"attestations": []})).await;
    let client = client_for(&server);
    let _ = client.profiles.attestations("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().ends_with("/attestations"));
}

#[tokio::test]
async fn profiles_agent_card() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.profiles.agent_card("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("agentCard"));
}

// --- DirectoryApi ---

#[tokio::test]
async fn directory_list_agents() {
    let server = any_ok(json!({"agents": []})).await;
    let client = client_for(&server);
    let _ = client
        .directory
        .list_agents(Some(&AgentQueryParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().ends_with("/directory/agents"));
}

#[tokio::test]
async fn directory_find_agent_by_encryption_key() {
    let server = any_ok(json!({
        "agents": [{
            "agentId": "agent-alice",
            "name": "Alice",
            "cryptoId": "cid-alice",
            "metadata": {"encryptionPublicKey": "ZW5jLWtleQ=="},
            "createdAt": "2026-06-13T00:00:00Z",
            "updatedAt": "2026-06-13T00:00:00Z"
        }]
    }))
    .await;
    let client = client_for(&server);
    let found = client
        .directory
        .find_agent_by_encryption_key("ZW5jLWtleQ==")
        .await
        .expect("request ok");
    assert_eq!(found.map(|a| a.agent_id), Some("agent-alice".to_string()));

    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().ends_with("/directory/agents"));
    let pairs: std::collections::HashMap<_, _> = req.url.query_pairs().into_owned().collect();
    assert_eq!(
        pairs.get("encryptionKey").map(String::as_str),
        Some("ZW5jLWtleQ==")
    );
    assert_eq!(pairs.get("limit").map(String::as_str), Some("1"));
}

#[tokio::test]
async fn directory_find_agent_by_encryption_key_no_match() {
    // A backend that ignores the filter returns a non-matching card; the
    // client-side verification must reject it.
    let server = any_ok(json!({
        "agents": [{
            "agentId": "other",
            "name": "Other",
            "cryptoId": "cid-other",
            "metadata": {"encryptionPublicKey": "c29tZXRoaW5nLWVsc2U="},
            "createdAt": "2026-06-13T00:00:00Z",
            "updatedAt": "2026-06-13T00:00:00Z"
        }]
    }))
    .await;
    let client = client_for(&server);
    let found = client
        .directory
        .find_agent_by_encryption_key("ZW5jLWtleQ==")
        .await
        .expect("request ok");
    assert!(found.is_none());
}

#[tokio::test]
async fn directory_get_agent() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.directory.get_agent("agent-1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("directory/agents"));
    assert!(req.url.path().contains("agent-1"));
}

#[tokio::test]
async fn directory_get_extended_agent() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.directory.get_extended_agent("agent-1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().ends_with("/extended"));
}

#[tokio::test]
async fn directory_upsert_extended_agent() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let card: ExtendedAgentCard = serde_json::from_value(json!({
        "agentId": "agent-1",
        "agent": {
            "agentId": "agent-1",
            "name": "Agent One",
            "cryptoId": "cid123",
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z"
        },
        "updatedAt": "2026-01-01T00:00:00Z"
    }))
    .unwrap();
    let _ = client
        .directory
        .upsert_extended_agent("agent-1", &card)
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "PUT");
    assert!(req.url.path().ends_with("/extended"));
}

#[tokio::test]
async fn directory_upsert_agent() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let card: AgentCard = serde_json::from_value(json!({
        "agentId": "agent-1",
        "name": "Agent One",
        "cryptoId": "cid123",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z"
    }))
    .unwrap();
    let _ = client.directory.upsert_agent("agent-1", &card).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "PUT");
    assert!(req.url.path().contains("directory/agents"));
    assert!(req.url.path().contains("agent-1"));
}

#[tokio::test]
async fn directory_delete_agent() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.directory.delete_agent("agent-1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("directory/agents"));
    assert!(req.url.path().contains("agent-1"));
}

#[tokio::test]
async fn directory_resolve() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.directory.resolve("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("directory/resolve"));
    assert!(req.url.path().contains("alice"));
}

#[tokio::test]
async fn directory_reverse() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.directory.reverse("cid123").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("directory/reverse"));
    assert!(req.url.path().contains("cid123"));
}

#[tokio::test]
async fn directory_skills() {
    let server = any_ok(json!({"agents": []})).await;
    let client = client_for(&server);
    let _ = client
        .directory
        .skills(Some(&DirectorySkillsParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().ends_with("/directory/skills"));
}
