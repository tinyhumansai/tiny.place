//! Endpoint tests for `PaymentsApi`, `LedgerApi`, and `PricingApi`. Each test
//! points the client at a catch-all mock, invokes a method, and asserts the
//! request method and path. Response bodies are permissive — the goal is to
//! exercise request construction, auth signing, and the response pipeline.

mod common;

use common::*;
use serde_json::{from_value, json};
use tinyplace::api::payments::RenewDueParams;
use tinyplace::api::pricing::{HistoryParams, QuoteParams};
use tinyplace::types::{
    LedgerListParams, LedgerVerifyRequest, PaymentBatchFlushRequest, SubscriptionCreateRequest,
    SubscriptionRenewRequest, X402SettleRequest, X402VerifyRequest, X402VerifyUntilValidOptions,
};

// --- PaymentsApi ---

#[tokio::test]
async fn payments_verify() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let request: X402VerifyRequest = from_value(json!({
        "scheme": "exact",
        "network": "solana",
        "asset": "SOL",
        "amount": "1",
        "from": "a",
        "to": "b",
        "nonce": "n",
        "expiresAt": "2030-01-01T00:00:00Z",
        "signature": "sig"
    }))
    .unwrap();
    let _ = client.payments.verify(&request).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/payments/verify"));
}

#[tokio::test]
async fn payments_verify_until_valid() {
    // `valid: true` makes `should_retry_verify` return false → no looping.
    let server = any_ok(json!({"valid": true})).await;
    let client = client_for(&server);
    let request: X402VerifyRequest = from_value(json!({
        "scheme": "exact",
        "network": "solana",
        "asset": "SOL",
        "amount": "1",
        "from": "a",
        "to": "b",
        "nonce": "n",
        "expiresAt": "2030-01-01T00:00:00Z",
        "signature": "sig"
    }))
    .unwrap();
    let _ = client
        .payments
        .verify_until_valid(&request, &X402VerifyUntilValidOptions::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/payments/verify"));
}

#[tokio::test]
async fn payments_settle() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let request: X402SettleRequest = from_value(json!({
        "payment": {
            "scheme": "exact",
            "network": "solana",
            "asset": "SOL",
            "amount": "1",
            "from": "a",
            "to": "b",
            "nonce": "n",
            "expiresAt": "2030-01-01T00:00:00Z",
            "signature": "sig"
        }
    }))
    .unwrap();
    let _ = client.payments.settle(&request).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/payments/settle"));
}

#[tokio::test]
async fn payments_facilitator() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.payments.facilitator().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/payments/facilitator"));
}

#[tokio::test]
async fn payments_supported() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.payments.supported().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/payments/supported"));
}

#[tokio::test]
async fn payments_create_subscription() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let request: SubscriptionCreateRequest = from_value(json!({
        "subscriber": "@alice",
        "provider": "@bob",
        "plan": {
            "amount": "1",
            "asset": "SOL",
            "network": "solana",
            "interval": "monthly"
        }
    }))
    .unwrap();
    let _ = client.payments.create_subscription(&request).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/payments/subscriptions"));
}

#[tokio::test]
async fn payments_get_subscription() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.payments.get_subscription("sub1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/payments/subscriptions/sub1"));
}

#[tokio::test]
async fn payments_cancel_subscription() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.payments.cancel_subscription("sub1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("/payments/subscriptions/sub1"));
}

#[tokio::test]
async fn payments_renew_subscription() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let request: SubscriptionRenewRequest = from_value(json!({
        "paymentAuthorization": "auth"
    }))
    .unwrap();
    let _ = client.payments.renew_subscription("sub1", &request).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req
        .url
        .path()
        .contains("/payments/subscriptions/sub1/renew"));
}

#[tokio::test]
async fn payments_renew_due_subscriptions() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .payments
        .renew_due_subscriptions(Some(&RenewDueParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/payments/subscriptions/renew-due"));
}

#[tokio::test]
async fn payments_flush_batch() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .payments
        .flush_batch("batch1", &PaymentBatchFlushRequest::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/payments/batches/batch1/flush"));
}

// --- LedgerApi ---

#[tokio::test]
async fn ledger_list() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.ledger.list(Some(&LedgerListParams::default())).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/ledger/transactions"));
}

#[tokio::test]
async fn ledger_get() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.ledger.get("tx1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/ledger/transactions/tx1"));
}

#[tokio::test]
async fn ledger_verify() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let request: LedgerVerifyRequest = from_value(json!({
        "onChainTx": "0xabc",
        "network": "solana"
    }))
    .unwrap();
    let _ = client.ledger.verify(&request).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/ledger/verify"));
}

// --- PricingApi ---

#[tokio::test]
async fn pricing_quote() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.pricing.quote(&QuoteParams::default()).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/pricing/quote"));
}

#[tokio::test]
async fn pricing_history() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.pricing.history(&HistoryParams::default()).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/pricing/history"));
}

#[tokio::test]
async fn pricing_assets() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.pricing.assets().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/pricing/assets"));
}

#[tokio::test]
async fn pricing_pairs() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.pricing.pairs().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/pricing/pairs"));
}

#[tokio::test]
async fn pricing_networks() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.pricing.networks().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/pricing/networks"));
}

#[tokio::test]
async fn pricing_gas() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.pricing.gas("solana").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/pricing/gas"));
}
