//! Endpoint tests for `BroadcastsApi`, `ActivityApi`, and `A2AApi`. Each test
//! points the client at a catch-all mock, invokes a method, and asserts the
//! request method and path. Response bodies are permissive — the goal is to
//! exercise request construction, auth signing, and the response pipeline.

mod common;

use common::*;
use serde_json::json;
use tinyplace::api::a2a::A2ATaskRequest;
use tinyplace::types::{
    ActivityListParams, BroadcastCreateRequest, BroadcastMessage, BroadcastSubscribeRequest,
    FeedListParams, FollowListParams,
};

// --- BroadcastsApi ---

#[tokio::test]
async fn broadcasts_list() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.broadcasts.list(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/broadcasts"));
}

#[tokio::test]
async fn broadcasts_create() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .broadcasts
        .create(BroadcastCreateRequest::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/broadcasts"));
}

#[tokio::test]
async fn broadcasts_get() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.broadcasts.get("bcast1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("bcast1"));
}

#[tokio::test]
async fn broadcasts_update() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.broadcasts.update("bcast1", &json!({}), None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "PUT");
    assert!(req.url.path().contains("bcast1"));
}

#[tokio::test]
async fn broadcasts_remove() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.broadcasts.remove("bcast1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("bcast1"));
}

#[tokio::test]
async fn broadcasts_add_publisher() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.broadcasts.add_publisher("bcast1", "@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("publishers"));
}

#[tokio::test]
async fn broadcasts_remove_publisher() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.broadcasts.remove_publisher("bcast1", "@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("publishers"));
}

#[tokio::test]
async fn broadcasts_subscribe() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .broadcasts
        .subscribe("bcast1", Some(BroadcastSubscribeRequest::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("subscribe"));
}

#[tokio::test]
async fn broadcasts_unsubscribe() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.broadcasts.unsubscribe("bcast1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("subscribe"));
}

#[tokio::test]
async fn broadcasts_subscribers() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.broadcasts.subscribers("bcast1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("subscribers"));
}

#[tokio::test]
async fn broadcasts_remove_subscriber() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .broadcasts
        .remove_subscriber("bcast1", "@alice", None)
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("subscribers"));
}

#[tokio::test]
async fn broadcasts_list_messages() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .broadcasts
        .list_messages("bcast1", None, None, None)
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("messages"));
}

#[tokio::test]
async fn broadcasts_post_message() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .broadcasts
        .post_message("bcast1", BroadcastMessage::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("messages"));
}

#[tokio::test]
async fn broadcasts_delete_message() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .broadcasts
        .delete_message("bcast1", "bmsg1", None)
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("messages"));
}

// --- ActivityApi ---

#[tokio::test]
async fn activity_list() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .activity
        .list(Some(&ActivityListParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/activity"));
}

// --- A2AApi ---

#[tokio::test]
async fn a2a_send_task() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let request = A2ATaskRequest {
        jsonrpc: "2.0".into(),
        id: json!(1),
        method: "tasks/send".into(),
        params: Some(json!({})),
    };
    let _ = client.a2a.send_task("@alice", &request, None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/a2a/"));
}

#[tokio::test]
async fn a2a_swagger() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.a2a.swagger("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("swagger.json"));
}

#[tokio::test]
async fn a2a_swagger_markdown() {
    let server = any_ok(json!("# swagger")).await;
    let client = client_for(&server);
    let _ = client.a2a.swagger_markdown("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("swagger.md"));
}

#[tokio::test]
async fn a2a_skill_description() {
    let server = any_ok(json!("# skill")).await;
    let client = client_for(&server);
    let _ = client.a2a.skill_description("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("skill.md"));
}

// --- FollowsApi ---

#[tokio::test]
async fn follows_follow() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.follows.follow("@bob").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/follows/"));
}

#[tokio::test]
async fn follows_unfollow() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.follows.unfollow("@bob").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("/follows/"));
}

#[tokio::test]
async fn follows_followers() {
    let server = any_ok(json!({"followers": []})).await;
    let client = client_for(&server);
    let _ = client
        .follows
        .followers("@bob", Some(&FollowListParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/follows/"));
    assert!(req.url.path().contains("/followers"));
}

#[tokio::test]
async fn follows_following() {
    let server = any_ok(json!({"following": []})).await;
    let client = client_for(&server);
    let _ = client.follows.following("@bob", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/following"));
}

#[tokio::test]
async fn follows_stats() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.follows.stats("@bob").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/follows/"));
    assert!(req.url.path().contains("/stats"));
}

#[tokio::test]
async fn follows_feed() {
    let server = any_ok(json!({"events": [], "following": [], "stats": {}})).await;
    let client = client_for(&server);
    let _ = client.follows.feed(Some(&FeedListParams::default())).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/feed"));
}
