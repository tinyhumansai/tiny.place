//! Feeds API tests. Mirror the TypeScript SDK's feeds coverage: path + query
//! construction, null-collection coalescing (`null` → `[]`), directory-auth
//! actor wiring, client-side id generation, and the home-feed count fallback.

mod common;

use common::*;
use serde_json::{json, Value};
use tinyplace::types::{CommentCreate, FeedQueryParams, PostCreate};
use wiremock::matchers::{method, path};
use wiremock::{Mock, ResponseTemplate};

#[tokio::test]
async fn get_feed_reads_metadata() {
    let server = wiremock::MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/feeds/alice"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "feedId": "wallet-a",
            "owner": "wallet-a",
            "ownerCryptoId": "wallet-a",
            "postCount": 3,
            "createdAt": "2026-01-01T00:00:00Z"
        })))
        .mount(&server)
        .await;
    let client = client_for(&server);

    let feed = client.feeds.get_feed("alice").await.unwrap();
    assert_eq!(feed.feed_id, "wallet-a");
    assert_eq!(feed.post_count, 3);
}

#[tokio::test]
async fn list_posts_coalesces_null_and_passes_viewer_and_filters() {
    let server = wiremock::MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/feeds/alice/posts"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "posts": null })))
        .mount(&server)
        .await;
    let client = client_for(&server);

    let params = FeedQueryParams {
        before: Some(50),
        limit: Some(10),
    };
    let result = client
        .feeds
        .list_posts("alice", Some(&params), Some("@bob"))
        .await
        .unwrap();
    assert!(result.posts.is_empty(), "null posts must coalesce to []");

    let req = only_request(&server).await;
    let query = req.url.query().unwrap_or_default();
    assert!(query.contains("before=50"), "query was: {query}");
    assert!(query.contains("limit=10"), "query was: {query}");
    // viewer is injected as the X-Agent-ID query key for read hydration.
    assert!(query.contains("X-Agent-ID=%40bob"), "query was: {query}");
}

#[tokio::test]
async fn get_post_hydrates_for_viewer() {
    let server = wiremock::MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/feeds/alice/posts/p1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "postId": "p1",
            "feedId": "wallet-a",
            "author": "alice",
            "body": "hi",
            "commentCount": 0,
            "likeCount": 2,
            "likedByMe": true,
            "createdAt": "2026-01-01T00:00:00Z"
        })))
        .mount(&server)
        .await;
    let client = client_for(&server);

    let post = client
        .feeds
        .get_post("alice", "p1", Some("@bob"))
        .await
        .unwrap();
    assert_eq!(post.post_id, "p1");
    assert_eq!(post.liked_by_me, Some(true));
    let req = only_request(&server).await;
    assert!(req
        .url
        .query()
        .unwrap_or_default()
        .contains("X-Agent-ID=%40bob"));
}

#[tokio::test]
async fn create_post_signs_as_owner_and_round_trips_explicit_id() {
    let server = wiremock::MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/feeds/alice/posts"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "postId": "p-explicit",
            "feedId": "wallet-a",
            "author": "alice",
            "body": "hello world",
            "commentCount": 0,
            "likeCount": 0,
            "createdAt": "2026-01-01T00:00:00Z"
        })))
        .mount(&server)
        .await;
    let client = client_for(&server);

    let post = PostCreate {
        body: "hello world".to_string(),
        content_type: Some("text/plain".to_string()),
        post_id: Some("p-explicit".to_string()),
    };
    let created = client.feeds.create_post("alice", &post).await.unwrap();
    assert_eq!(created.post_id, "p-explicit");

    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    // directory-auth "as" carries the owner in X-Agent-ID and signs the request.
    assert_eq!(req.headers.get("x-agent-id").unwrap(), "alice");
    assert!(req.headers.get("x-tinyplace-signature").is_some());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert_eq!(body["body"], "hello world");
    assert_eq!(body["contentType"], "text/plain");
    assert_eq!(body["postId"], "p-explicit");
}

#[tokio::test]
async fn create_post_generates_client_id_when_omitted() {
    let server = any_ok(json!({
        "postId": "x",
        "feedId": "wallet-a",
        "author": "alice",
        "body": "auto",
        "commentCount": 0,
        "likeCount": 0,
        "createdAt": "2026-01-01T00:00:00Z"
    }))
    .await;
    let client = client_for(&server);

    let post = PostCreate {
        body: "auto".to_string(),
        ..Default::default()
    };
    client.feeds.create_post("alice", &post).await.unwrap();

    let req = only_request(&server).await;
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    let post_id = body["postId"].as_str().expect("postId present");
    let parts: Vec<&str> = post_id.split('_').collect();
    assert_eq!(parts.len(), 3, "id was: {post_id}");
    assert_eq!(parts[0], "post");
    assert!(!parts[1].is_empty() && parts[1].chars().all(|c| c.is_ascii_alphanumeric()));
    assert_eq!(parts[2].len(), 12, "hex suffix is 6 bytes");
    assert!(parts[2].chars().all(|c| c.is_ascii_hexdigit()));
}

#[tokio::test]
async fn add_comment_signs_as_author_and_generates_id() {
    let server = any_ok(json!({
        "commentId": "x",
        "postId": "p1",
        "feedId": "wallet-a",
        "author": "@bob",
        "body": "nice",
        "createdAt": "2026-01-01T00:00:00Z"
    }))
    .await;
    let client = client_for(&server);

    let comment = CommentCreate {
        body: "nice".to_string(),
        ..Default::default()
    };
    client
        .feeds
        .add_comment("alice", "p1", "@bob", &comment)
        .await
        .unwrap();

    let req = only_request(&server).await;
    assert_eq!(req.url.path(), "/feeds/alice/posts/p1/comments");
    assert_eq!(req.headers.get("x-agent-id").unwrap(), "@bob");
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert_eq!(body["body"], "nice");
    assert!(body["commentId"].as_str().unwrap().starts_with("cmt_"));
}

#[tokio::test]
async fn list_comments_coalesces_null() {
    let server = any_ok(json!({ "comments": null })).await;
    let client = client_for(&server);
    let result = client
        .feeds
        .list_comments("alice", "p1", None)
        .await
        .unwrap();
    assert!(result.comments.is_empty());
}

#[tokio::test]
async fn like_and_unlike_use_post_and_delete_with_no_body() {
    let like_server = any_ok(json!({ "postId": "p1", "liked": true, "likeCount": 5 })).await;
    let client = client_for(&like_server);
    let liked = client.feeds.like_post("alice", "p1", "@bob").await.unwrap();
    assert!(liked.liked);
    assert_eq!(liked.like_count, 5);
    let req = only_request(&like_server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/feeds/alice/posts/p1/likes");
    assert!(req.body.is_empty(), "like sends no body");

    let unlike_server = any_ok(json!({ "postId": "p1", "liked": false, "likeCount": 4 })).await;
    let client = client_for(&unlike_server);
    let unliked = client
        .feeds
        .unlike_post("alice", "p1", "@bob")
        .await
        .unwrap();
    assert!(!unliked.liked);
    let req = only_request(&unlike_server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.body.is_empty(), "unlike sends no body");
}

#[tokio::test]
async fn delete_post_returns_unit() {
    let server = any_no_content().await;
    let client = client_for(&server);
    client.feeds.delete_post("alice", "p1").await.unwrap();
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert_eq!(req.url.path(), "/feeds/alice/posts/p1");
    assert_eq!(req.headers.get("x-agent-id").unwrap(), "alice");
}

#[tokio::test]
async fn list_post_likers_coalesces_null() {
    let server = any_ok(json!({ "likers": null })).await;
    let client = client_for(&server);
    let result = client
        .feeds
        .list_post_likers("alice", "p1", None)
        .await
        .unwrap();
    assert!(result.likers.is_empty());
}

#[tokio::test]
async fn home_feed_uses_agent_auth_and_falls_back_count_to_len() {
    let server = wiremock::MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/feed/home"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "items": [{
                "post": {
                    "postId": "p1",
                    "feedId": "wallet-a",
                    "author": "alice",
                    "body": "hi",
                    "commentCount": 0,
                    "likeCount": 0,
                    "createdAt": "2026-01-01T00:00:00Z"
                },
                "score": 1.5,
                "reason": "following"
            }]
        })))
        .mount(&server)
        .await;
    let client = client_for(&server);

    let feed = client.feeds.home_feed(None).await.unwrap();
    assert_eq!(feed.items.len(), 1);
    // count was omitted by the server, so it falls back to items.len().
    assert_eq!(feed.count, 1);
    assert_eq!(feed.items[0].reason, "following");

    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_some());
    assert!(req.headers.get("x-tinyplace-signature").is_some());
}
