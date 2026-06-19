//! Bounties API tests. Mirror the TypeScript SDK's coverage: path + query
//! construction, directory-auth actor wiring, the create + fund x402 payment
//! (omitted vs present), and the admin-approved payout.

mod common;

use common::*;
use serde_json::{json, Value};
use tinyplace::types::{BountyCreateRequest, BountyFundPayment, BountyQueryParams};
use wiremock::matchers::{method, path};
use wiremock::{Mock, ResponseTemplate};

fn bounty_json() -> Value {
    json!({
        "bountyId": "b1",
        "creator": "@alice",
        "title": "Build a thing",
        "description": "Do the work",
        "reward": {"amount": "10000000", "asset": "USDC", "network": "solana"},
        "status": "open",
        "submissionCount": 0,
        "commentCount": 0,
        "startAt": "2026-01-01T00:00:00Z",
        "deadline": "2026-01-08T00:00:00Z",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z"
    })
}

#[tokio::test]
async fn list_sends_filters_and_unwraps() {
    let server = wiremock::MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/bounties"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({ "bounties": [bounty_json()] })),
        )
        .mount(&server)
        .await;
    let client = client_for(&server);

    let params = BountyQueryParams {
        status: Some("open".to_string()),
        limit: Some(10),
        ..Default::default()
    };
    let result = client.bounties.list(Some(&params)).await.unwrap();
    assert_eq!(result.bounties.len(), 1);
    assert_eq!(result.bounties[0].bounty_id, "b1");

    let query = only_request(&server)
        .await
        .url
        .query()
        .unwrap_or_default()
        .to_string();
    assert!(query.contains("status=open"), "query was: {query}");
    assert!(query.contains("limit=10"), "query was: {query}");
}

#[tokio::test]
async fn get_reads_single_bounty() {
    let server = wiremock::MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/bounties/b1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(bounty_json()))
        .mount(&server)
        .await;
    let client = client_for(&server);

    let bounty = client.bounties.get("b1").await.unwrap();
    assert_eq!(bounty.bounty_id, "b1");
    assert_eq!(bounty.reward.asset, "USDC");
    assert_eq!(bounty.status, "open");
}

#[tokio::test]
async fn create_signs_as_creator_and_round_trips_body() {
    let server = any_ok(bounty_json()).await;
    let client = client_for(&server);

    let request = BountyCreateRequest {
        creator: Some("@alice".to_string()),
        title: "Build a thing".to_string(),
        description: "Do the work".to_string(),
        amount: "10".to_string(),
        asset: Some("USDC".to_string()),
        duration_days: Some(7),
        ..Default::default()
    };
    client.bounties.create(&request).await.unwrap();

    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/bounties");
    // directory-auth "as" carries the creator in X-Agent-ID and signs the request.
    assert_eq!(req.headers.get("x-agent-id").unwrap(), "@alice");
    assert!(req.headers.get("x-tinyplace-signature").is_some());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert_eq!(body["title"], "Build a thing");
    assert_eq!(body["amount"], "10");
    assert_eq!(body["durationDays"], 7);
}

#[tokio::test]
async fn create_omits_payment_then_includes_it() {
    // First call: no payment → body omits "payment" (receives the 402 challenge).
    let server = any_ok(bounty_json()).await;
    let client = client_for(&server);
    let request = BountyCreateRequest {
        creator: Some("@alice".to_string()),
        title: "Build a thing".to_string(),
        description: "Do the work".to_string(),
        amount: "10".to_string(),
        ..Default::default()
    };
    client.bounties.create(&request).await.unwrap();
    let req = only_request(&server).await;
    assert_eq!(req.url.path(), "/bounties");
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body.get("payment").is_none(), "no payment → field omitted");

    // Second call: signed payment map echoed back under "payment", settling into
    // escrow so the bounty is created already `open`.
    let server = any_ok(bounty_json()).await;
    let client = client_for(&server);
    let mut payment: BountyFundPayment = BountyFundPayment::new();
    payment.insert("signature".to_string(), "sig123".to_string());
    let request = BountyCreateRequest {
        creator: Some("@alice".to_string()),
        title: "Build a thing".to_string(),
        description: "Do the work".to_string(),
        amount: "10".to_string(),
        payment: Some(payment),
        ..Default::default()
    };
    client.bounties.create(&request).await.unwrap();
    let req = only_request(&server).await;
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert_eq!(body["payment"]["signature"], "sig123");
}

#[tokio::test]
async fn cancel_posts_empty_body_as_creator() {
    let server = any_ok(bounty_json()).await;
    let client = client_for(&server);
    client.bounties.cancel("b1", "@alice").await.unwrap();
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/bounties/b1/cancel");
    assert_eq!(req.headers.get("x-agent-id").unwrap(), "@alice");
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert_eq!(body, json!({}));
}

#[tokio::test]
async fn run_council_posts_empty_body() {
    let server = any_ok(bounty_json()).await;
    let client = client_for(&server);
    client.bounties.run_council("b1", "@alice").await.unwrap();
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/bounties/b1/council");
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert_eq!(body, json!({}));
}

#[tokio::test]
async fn submit_signs_as_submitter() {
    let server = any_ok(json!({
        "submissionId": "s1",
        "bountyId": "b1",
        "submitter": "@bob",
        "url": "https://example.com/work",
        "status": "submitted",
        "createdAt": "2026-01-02T00:00:00Z",
        "updatedAt": "2026-01-02T00:00:00Z"
    }))
    .await;
    let client = client_for(&server);

    let request = tinyplace::types::BountySubmissionCreateRequest {
        submitter: Some("@bob".to_string()),
        url: "https://example.com/work".to_string(),
        ..Default::default()
    };
    let submission = client.bounties.submit("b1", &request).await.unwrap();
    assert_eq!(submission.submission_id, "s1");

    let req = only_request(&server).await;
    assert_eq!(req.url.path(), "/bounties/b1/submissions");
    assert_eq!(req.headers.get("x-agent-id").unwrap(), "@bob");
}

#[tokio::test]
async fn list_submissions_sends_filters() {
    let server = any_ok(json!({ "submissions": [] })).await;
    let client = client_for(&server);
    let params = tinyplace::types::BountySubmissionQueryParams {
        status: Some("winner".to_string()),
        ..Default::default()
    };
    let result = client
        .bounties
        .list_submissions("b1", Some(&params))
        .await
        .unwrap();
    assert!(result.submissions.is_empty());
    let query = only_request(&server)
        .await
        .url
        .query()
        .unwrap_or_default()
        .to_string();
    assert!(query.contains("status=winner"), "query was: {query}");
}

#[tokio::test]
async fn comment_signs_as_author() {
    let server = any_ok(json!({
        "commentId": "c1",
        "bountyId": "b1",
        "author": "@bob",
        "body": "great bounty",
        "createdAt": "2026-01-02T00:00:00Z"
    }))
    .await;
    let client = client_for(&server);

    let request = tinyplace::types::BountyCommentCreateRequest {
        author: Some("@bob".to_string()),
        body: "great bounty".to_string(),
        ..Default::default()
    };
    let comment = client.bounties.comment("b1", &request).await.unwrap();
    assert_eq!(comment.comment_id, "c1");
    let req = only_request(&server).await;
    assert_eq!(req.url.path(), "/bounties/b1/comments");
    assert_eq!(req.headers.get("x-agent-id").unwrap(), "@bob");
}

#[tokio::test]
async fn approve_uses_admin_auth_and_conditional_submission_id() {
    // With an explicit submission id.
    let server = any_ok(bounty_json()).await;
    let client = client_for(&server);
    client.bounties.approve("b1", Some("s1")).await.unwrap();
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/bounties/b1/approve");
    // admin auth uses the TinyPlace-Admin Authorization header.
    assert!(req.headers.get("authorization").is_some());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert_eq!(body["submissionId"], "s1");

    // Without one → empty body (defaults to the council's pick).
    let server = any_ok(bounty_json()).await;
    let client = client_for(&server);
    client.bounties.approve("b1", None).await.unwrap();
    let req = only_request(&server).await;
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert_eq!(body, json!({}));
}
