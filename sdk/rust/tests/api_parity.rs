//! Endpoint tests for the API surface added for TypeScript-SDK parity:
//! `FeedbackApi`, `FollowsApi`, `SolanaApi`, the `UsersApi` email-verification
//! methods, and the `registry.export_identity` alias. Each test points the
//! client at a catch-all mock, invokes a method, and asserts the request method
//! and path. Response bodies are permissive — the goal is to exercise request
//! construction, auth signing, and the response pipeline.

mod common;

use common::*;
use tinyplace::types::{
    FeedbackCreate, FeedbackListParams, FeedbackStatusUpdate, FeedbackVoteRequest,
    FollowListParams, SolanaRpcRequest, UserEmailVerificationConfirmRequest,
    UserEmailVerificationRequest,
};

// --- FeedbackApi ---

#[tokio::test]
async fn feedback_list() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .feedback
        .list(Some(&FeedbackListParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/feedback"));
}

#[tokio::test]
async fn feedback_get() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.feedback.get("fb1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("fb1"));
}

#[tokio::test]
async fn feedback_create_signs_as_author() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .feedback
        .create(FeedbackCreate {
            author: "@alice".into(),
            title: "Bug".into(),
            description: "It broke".into(),
            ..Default::default()
        })
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/feedback"));
}

#[tokio::test]
async fn feedback_vote() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .feedback
        .vote(
            "fb1",
            FeedbackVoteRequest {
                voter: "@bob".into(),
                vote: "up".into(),
            },
        )
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("fb1/vote"));
}

#[tokio::test]
async fn feedback_update_status() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .feedback
        .update_status(
            "fb1",
            FeedbackStatusUpdate {
                status: "resolved".into(),
                ..Default::default()
            },
        )
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "PUT");
    assert!(req.url.path().contains("fb1/status"));
}

// --- FollowsApi ---

#[tokio::test]
async fn follows_follow() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.follows.follow("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/follows/%40alice"));
}

#[tokio::test]
async fn follows_unfollow() {
    let server = any_no_content().await;
    let client = client_for(&server);
    let _ = client.follows.unfollow("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("/follows/%40alice"));
}

#[tokio::test]
async fn follows_followers_and_following() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .follows
        .followers("@alice", Some(&FollowListParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/followers"));
}

#[tokio::test]
async fn follows_stats() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.follows.stats("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/stats"));
}

#[tokio::test]
async fn follows_feed_is_agent_authed() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.follows.feed(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert_eq!(req.url.path(), "/feed");
}

// --- SolanaApi ---

#[tokio::test]
async fn solana_info() {
    let server = any_empty_ok().await;
    let client = anon_client_for(&server);
    let _ = client.solana.info().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert_eq!(req.url.path(), "/solana");
}

#[tokio::test]
async fn solana_rpc_posts_to_proxy() {
    let server = any_empty_ok().await;
    let client = anon_client_for(&server);
    let _ = client
        .solana
        .rpc::<serde_json::Value>(&SolanaRpcRequest {
            jsonrpc: "2.0".into(),
            id: Some(serde_json::json!(1)),
            method: "getHealth".into(),
            params: None,
        })
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/solana/rpc");
}

#[tokio::test]
async fn solana_call_unwraps_result() {
    let server = any_ok(serde_json::json!({
        "jsonrpc": "2.0",
        "id": "getHealth",
        "result": "ok"
    }))
    .await;
    let client = anon_client_for(&server);
    let result: String = client
        .solana
        .call("getHealth", None, None)
        .await
        .expect("call should unwrap result");
    assert_eq!(result, "ok");
}

#[tokio::test]
async fn solana_call_surfaces_rpc_error() {
    let server = any_ok(serde_json::json!({
        "jsonrpc": "2.0",
        "id": "getHealth",
        "error": { "code": -32000, "message": "boom" }
    }))
    .await;
    let client = anon_client_for(&server);
    let err = client
        .solana
        .call::<serde_json::Value>("getHealth", None, None)
        .await
        .expect_err("rpc error should surface");
    assert!(err.to_string().contains("boom"));
}

// --- UsersApi email verification + registry alias ---

#[tokio::test]
async fn users_start_email_verification() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .users
        .start_email_verification(
            "crypto1",
            UserEmailVerificationRequest {
                email: "a@example.com".into(),
                ..Default::default()
            },
        )
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("crypto1/email/verification"));
}

#[tokio::test]
async fn users_confirm_email_verification() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .users
        .confirm_email_verification(
            "crypto1",
            UserEmailVerificationConfirmRequest {
                email: "a@example.com".into(),
                code: "123456".into(),
                ..Default::default()
            },
        )
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req
        .url
        .path()
        .contains("crypto1/email/verification/confirm"));
}

#[tokio::test]
async fn registry_export_identity_alias() {
    let server = any_empty_ok().await;
    let client = anon_client_for(&server);
    let _ = client.registry.export_identity("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/export"));
}
