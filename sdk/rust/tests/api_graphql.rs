//! GraphQL API tests. These mirror the TypeScript SDK's GraphQL coverage:
//! request construction, read auth mode, response unwrapping, and GraphQL error
//! surfacing.

mod common;

use common::*;
use serde_json::{json, Value};
use tinyplace::error::Error;
use wiremock::matchers::{method, path};
use wiremock::{Mock, ResponseTemplate};

#[tokio::test]
async fn graphql_home_feed_posts_to_gateway_with_agent_auth() {
    let server = wiremock::MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/graphql"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "data": {
                "homeFeed": {
                    "count": 1,
                    "items": [{
                        "score": 1.0,
                        "reason": "following",
                        "post": {
                            "postId": "p1",
                            "feedId": "wallet-a",
                            "body": "hi",
                            "contentType": "text/plain",
                            "commentCount": 0,
                            "likeCount": 2,
                            "createdAt": "2026-01-01T00:00:00Z",
                            "moderationState": "visible",
                            "viewerHasLiked": true,
                            "author": {
                                "handle": "@alice",
                                "cryptoId": "wallet-a",
                                "displayName": "Alice",
                                "avatarUrl": null,
                                "verified": true
                            }
                        }
                    }]
                }
            }
        })))
        .mount(&server)
        .await;
    let client = client_for(&server);

    let feed = client
        .graphql
        .home_feed(Some(10), None, Some(true))
        .await
        .unwrap();

    assert_eq!(feed.count, 1);
    assert_eq!(feed.items[0].post.author.handle, "@alice");
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/graphql");
    assert!(req.headers.get("x-agent-id").is_some());
    assert!(req.headers.get("x-tinyplace-signature").is_some());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("homeFeed"));
    assert_eq!(body["variables"]["limit"], 10);
    assert_eq!(body["variables"]["includeSelf"], true);
}

#[tokio::test]
async fn graphql_errors_are_returned_as_sdk_errors() {
    let server = any_ok(json!({ "errors": [{ "message": "boom" }] })).await;
    let client = anon_client_for(&server);

    let error = client.graphql.profile("@nobody").await.unwrap_err();

    match error {
        Error::Http(err) => {
            assert_eq!(err.status, 200);
            assert!(err.message.contains("boom"));
        }
        other => panic!("expected HTTP-style GraphQL error, got {other:?}"),
    }
}
