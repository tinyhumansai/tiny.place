//! Endpoint + typed-response tests for `ContactsApi` (the mutual contact graph
//! that gates direct messaging). Mirrors `sdk/typescript/src/api/contacts.ts`.
//! Each test points the client at a `wiremock` catch-all, invokes a method, and
//! asserts the HTTP method + path; the list/stats/status tests additionally
//! assert the typed response deserializes (including the `cryptoId` → `agent_id`
//! normalization the TS SDK performs).

mod common;

use common::*;
use serde_json::json;
use tinyplace::types::ContactListParams;

// --- request / accept / remove ---

#[tokio::test]
async fn contacts_request_posts_to_other() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.contacts.request("@bob").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/contacts/%40bob");
}

#[tokio::test]
async fn contacts_accept_posts_accept() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.contacts.accept("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/contacts/%40alice/accept");
}

#[tokio::test]
async fn contacts_remove_deletes() {
    let server = any_no_content().await;
    let client = client_for(&server);
    client.contacts.remove("@bob").await.expect("remove ok");
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert_eq!(req.url.path(), "/contacts/%40bob");
}

// --- block / unblock ---

#[tokio::test]
async fn contacts_block_posts_block() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.contacts.block("@carol").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/contacts/%40carol/block");
}

#[tokio::test]
async fn contacts_unblock_posts_unblock() {
    let server = any_no_content().await;
    let client = client_for(&server);
    client.contacts.unblock("@carol").await.expect("unblock ok");
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/contacts/%40carol/unblock");
}

// --- status (typed Contact) ---

#[tokio::test]
async fn contacts_status_gets_and_parses() {
    let server = any_ok(json!({
        "requester": "alice",
        "addressee": "bob",
        "status": "accepted",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
    }))
    .await;
    let client = client_for(&server);
    let contact = client.contacts.status("@bob").await.expect("status ok");
    assert_eq!(contact.status, "accepted");
    assert_eq!(contact.requester, "alice");
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert_eq!(req.url.path(), "/contacts/%40bob/status");
}

// --- list (typed ContactsResponse + cryptoId→agent_id + pagination) ---

#[tokio::test]
async fn contacts_list_parses_and_paginates() {
    let server = any_ok(json!({
        "contacts": [
            { "cryptoId": "bob-crypto-id", "status": "accepted",
              "contact": { "requester": "alice", "addressee": "bob", "status": "accepted",
                           "createdAt": "", "updatedAt": "" } }
        ]
    }))
    .await;
    let client = client_for(&server);
    let res = client
        .contacts
        .list(Some(&ContactListParams {
            limit: Some(10),
            offset: Some(5),
        }))
        .await
        .expect("list ok");
    assert_eq!(res.contacts.len(), 1);
    // cryptoId normalizes to agent_id, matching the TS SDK surface.
    assert_eq!(res.contacts[0].agent_id, "bob-crypto-id");
    assert_eq!(res.contacts[0].status, "accepted");
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert_eq!(req.url.path(), "/contacts");
    let query = req.url.query().unwrap_or_default();
    assert!(query.contains("limit=10"), "query was {query}");
    assert!(query.contains("offset=5"), "query was {query}");
}

#[tokio::test]
async fn contacts_list_defaults_have_no_query() {
    let server = any_ok(json!({ "contacts": [] })).await;
    let client = client_for(&server);
    let res = client.contacts.list(None).await.expect("list ok");
    assert!(res.contacts.is_empty());
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.query().unwrap_or_default().is_empty());
}

// --- requests (typed ContactRequestsResponse, incoming + outgoing) ---

#[tokio::test]
async fn contacts_requests_parses_incoming_outgoing() {
    let server = any_ok(json!({
        "incoming": [ { "cryptoId": "alice", "status": "pending", "direction": "incoming" } ],
        "outgoing": [ { "cryptoId": "carol", "status": "pending", "direction": "outgoing" } ]
    }))
    .await;
    let client = client_for(&server);
    let res = client.contacts.requests(None).await.expect("requests ok");
    assert_eq!(res.incoming.len(), 1);
    assert_eq!(res.incoming[0].agent_id, "alice");
    assert_eq!(res.incoming[0].direction.as_deref(), Some("incoming"));
    assert_eq!(res.outgoing[0].agent_id, "carol");
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert_eq!(req.url.path(), "/contacts/requests");
}

// --- stats (typed ContactStats, cryptoId→agent_id + counts) ---

#[tokio::test]
async fn contacts_stats_parses_counts() {
    let server = any_ok(json!({
        "cryptoId": "hub-id",
        "contactCount": 3,
        "pendingIncoming": 1,
        "pendingOutgoing": 2,
    }))
    .await;
    let client = client_for(&server);
    let stats = client.contacts.stats().await.expect("stats ok");
    assert_eq!(stats.agent_id, "hub-id");
    assert_eq!(stats.contact_count, 3);
    assert_eq!(stats.pending_incoming, 1);
    assert_eq!(stats.pending_outgoing, 2);
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert_eq!(req.url.path(), "/contacts/stats");
}
