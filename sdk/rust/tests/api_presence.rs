//! Endpoint + typed-response tests for `PresenceApi` (the network's liveness
//! surface). Mirrors `sdk/typescript/src/api/presence.ts`. Each test points the
//! client at a `wiremock` catch-all, invokes a method, and asserts the HTTP
//! method + path (and, for reads, that the typed response deserializes).

mod common;

use common::*;
use serde_json::json;

#[tokio::test]
async fn presence_heartbeat_posts_as_agent() {
    let server = any_ok(json!({ "cryptoId": "AgentX", "online": true })).await;
    let client = client_for(&server);
    let status = client.presence.heartbeat().await.expect("heartbeat ok");
    assert!(status.online);
    assert_eq!(status.crypto_id, "AgentX");
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/presence/heartbeat");
    // Authenticated as the acting agent.
    assert!(req.headers.contains_key("x-agent-id"));
}

#[tokio::test]
async fn presence_get_reads_single_identity() {
    let server = any_ok(json!({ "cryptoId": "AgentX", "online": false })).await;
    let client = client_for(&server);
    let status = client.presence.get("AgentX").await.expect("get ok");
    assert!(!status.online);
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert_eq!(req.url.path(), "/presence/AgentX");
}

#[tokio::test]
async fn presence_query_posts_batch() {
    let server = any_ok(json!({
        "presence": [
            { "cryptoId": "AgentX", "online": true },
            { "cryptoId": "ghost", "online": false },
        ]
    }))
    .await;
    let client = client_for(&server);
    let ids = vec!["AgentX".to_string(), "ghost".to_string()];
    let result = client.presence.query(&ids).await.expect("query ok");
    assert_eq!(result.presence.len(), 2);
    assert!(result.presence[0].online);
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/presence/query");
    let body: serde_json::Value = serde_json::from_slice(&req.body).expect("json body");
    assert_eq!(body, json!({ "cryptoIds": ["AgentX", "ghost"] }));
}
