//! Endpoint tests for `EscrowApi`. Each test points the client at
//! a catch-all mock, invokes one public method, and asserts the request method
//! and path. Response bodies are permissive — the goal is to exercise request
//! construction, auth signing, and the response pipeline.

mod common;

use common::*;
use serde_json::json;
use tinyplace::api::escrow::{EscrowArbitrationVote, EscrowDeliveryProof, EscrowEvidenceInput};
use tinyplace::types::{EscrowCreateRequest, EscrowQueryParams};

// --- EscrowApi ---

#[tokio::test]
async fn escrow_list() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .escrow
        .list(Some(&EscrowQueryParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/escrow"));
}

#[tokio::test]
async fn escrow_create() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let request: EscrowCreateRequest = serde_json::from_value(json!({
        "client": "@me",
        "provider": "@bob",
        "amount": "100",
        "asset": "USDC",
        "network": "solana",
        "terms": {
            "description": "do work",
            "deadline": "2026-01-01T00:00:00Z",
            "maxRevisions": 1
        }
    }))
    .unwrap();
    let _ = client.escrow.create(&request).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/escrow"));
}

#[tokio::test]
async fn escrow_get() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.escrow.get("esc1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("esc1"));
}

#[tokio::test]
async fn escrow_accept() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.escrow.accept("esc1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/accept"));
}

#[tokio::test]
async fn escrow_deliver() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .escrow
        .deliver("esc1", &EscrowDeliveryProof::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/deliver"));
}

#[tokio::test]
async fn escrow_accept_delivery() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.escrow.accept_delivery("esc1", None, None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/accept-delivery"));
}

#[tokio::test]
async fn escrow_claim_release() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.escrow.claim_release("esc1", None, None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/claim-release"));
}

#[tokio::test]
async fn escrow_claim_refund() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.escrow.claim_refund("esc1", None, None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/claim-refund"));
}

#[tokio::test]
async fn escrow_request_revision() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .escrow
        .request_revision("esc1", "needs work", None)
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/request-revision"));
}

#[tokio::test]
async fn escrow_cancel() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.escrow.cancel("esc1", None, None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/cancel"));
}

#[tokio::test]
async fn escrow_extend_deadline() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .escrow
        .extend_deadline("esc1", "2026-02-01T00:00:00Z", None)
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/extend-deadline"));
}

#[tokio::test]
async fn escrow_approve_extension() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.escrow.approve_extension("esc1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/approve-extension"));
}

#[tokio::test]
async fn escrow_open_dispute() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.escrow.open_dispute("esc1", "broken", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/dispute"));
}

#[tokio::test]
async fn escrow_get_dispute() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.escrow.get_dispute("esc1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().ends_with("/dispute"));
}

#[tokio::test]
async fn escrow_submit_evidence() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .escrow
        .submit_evidence("esc1", &EscrowEvidenceInput::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/dispute/evidence"));
}

#[tokio::test]
async fn escrow_accept_mediation() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.escrow.accept_mediation("esc1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/dispute/accept-mediation"));
}

#[tokio::test]
async fn escrow_reject_mediation() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.escrow.reject_mediation("esc1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/dispute/reject-mediation"));
}

#[tokio::test]
async fn escrow_pay_arbitration() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.escrow.pay_arbitration("esc1", "tx123", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/dispute/pay-arbitration"));
}

#[tokio::test]
async fn escrow_vote_arbitration() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let vote = EscrowArbitrationVote {
        council_member: "@judge".into(),
        vote: "client".into(),
        ..Default::default()
    };
    let _ = client.escrow.vote_arbitration("esc1", &vote).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().ends_with("/dispute/vote"));
}

#[tokio::test]
async fn escrow_deliver_milestone() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .escrow
        .deliver_milestone("esc1", "ms1", &EscrowDeliveryProof::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/milestones/"));
    assert!(req.url.path().ends_with("/deliver"));
}

#[tokio::test]
async fn escrow_accept_milestone_delivery() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .escrow
        .accept_milestone_delivery("esc1", "ms1", None, None)
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/milestones/"));
    assert!(req.url.path().ends_with("/accept-delivery"));
}

#[tokio::test]
async fn escrow_request_milestone_revision() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .escrow
        .request_milestone_revision("esc1", "ms1", "redo", None)
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/milestones/"));
    assert!(req.url.path().ends_with("/request-revision"));
}

#[tokio::test]
async fn escrow_dispute_milestone() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .escrow
        .dispute_milestone("esc1", "ms1", "bad", None)
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/milestones/"));
    assert!(req.url.path().ends_with("/dispute"));
}
