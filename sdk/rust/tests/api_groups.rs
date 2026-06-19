//! Endpoint tests for `GroupsApi`. Each test points the client at a catch-all
//! mock, invokes a method, and asserts the request method and path. Response
//! bodies are permissive — the goal is to exercise request construction, auth
//! signing, and the response pipeline.

mod common;

use common::*;
use serde_json::json;
use tinyplace::types::{
    GroupCreateRequest, GroupJoinRequest, GroupMessageFanoutRequest, GroupQueryParams,
    GroupRevenueShareRequest, GroupSubscriptionRenewRequest,
};

// --- GroupsApi ---

#[tokio::test]
async fn groups_list() {
    let server = any_ok(json!({"groups": []})).await;
    let client = client_for(&server);
    let _ = client.groups.list(Some(&GroupQueryParams::default())).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/directory/groups"));
}

#[tokio::test]
async fn groups_get() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.groups.get("grp1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("grp1"));
}

#[tokio::test]
async fn groups_create() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let request: GroupCreateRequest = serde_json::from_value(json!({
        "name": "Group",
        "membershipPolicy": "open"
    }))
    .unwrap();
    let _ = client.groups.create(request).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/directory/groups"));
}

#[tokio::test]
async fn groups_members() {
    let server = any_ok(json!({"members": []})).await;
    let client = client_for(&server);
    let _ = client.groups.members("grp1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("members"));
}

#[tokio::test]
async fn groups_add_member() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.groups.add_member("grp1", "@alice", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("members"));
}

#[tokio::test]
async fn groups_remove_member() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.groups.remove_member("grp1", "@alice", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("members"));
}

#[tokio::test]
async fn groups_join() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .groups
        .join("grp1", Some(GroupJoinRequest::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("join"));
}

#[tokio::test]
async fn groups_approve_member() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.groups.approve_member("grp1", "@alice", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("approve"));
}

#[tokio::test]
async fn groups_reject_member() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.groups.reject_member("grp1", "@alice", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("reject"));
}

#[tokio::test]
async fn groups_renew_member_subscription() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .groups
        .renew_member_subscription(
            "grp1",
            "@alice",
            Some(GroupSubscriptionRenewRequest::default()),
        )
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("subscription/renew"));
}

#[tokio::test]
async fn groups_set_revenue_shares() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let request: GroupRevenueShareRequest = serde_json::from_value(json!({
        "taskId": "t1",
        "payer": "@alice",
        "amount": "1",
        "asset": "USDC",
        "network": "solana",
        "onChainTx": "tx1",
        "participants": []
    }))
    .unwrap();
    let _ = client
        .groups
        .set_revenue_shares("grp1", request, None)
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("revenue-shares"));
}

#[tokio::test]
async fn groups_enforce_subscriptions() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .groups
        .enforce_subscriptions("grp1", None, None)
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("subscriptions/enforce"));
}

#[tokio::test]
async fn groups_fanout_message() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let message: GroupMessageFanoutRequest = serde_json::from_value(json!({
        "id": "m1",
        "from": "@alice",
        "to": "grp1",
        "timestamp": "2026-01-01T00:00:00Z",
        "deviceId": 1,
        "type": "ciphertext",
        "body": "hello"
    }))
    .unwrap();
    let _ = client.groups.fanout_message("grp1", message).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("messages"));
}
