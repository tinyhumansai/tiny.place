#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap; // sibling types share a flat namespace, like the TS barrel

/// Status of a [`PaymentIntent`].
pub type PaymentIntentStatus = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentIntent {
    #[serde(default)]
    pub intent_id: String,
    #[serde(default)]
    pub verified_id: String,
    #[serde(default)]
    pub nonce_key: String,
    #[serde(default)]
    pub payment_hash: String,
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub from: String,
    #[serde(default)]
    pub to: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub fee_id: Option<String>,
    #[serde(default)]
    pub fee_rate: String,
    #[serde(default)]
    pub fee_amount: String,
    #[serde(default)]
    pub net_amount: String,
    #[serde(default)]
    pub status: PaymentIntentStatus,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub expires_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub settled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ledger_tx_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct X402VerifyRequest {
    /// `"exact" | "upto" | "batch-settlement"`.
    #[serde(default)]
    pub scheme: String,
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub from: String,
    #[serde(default)]
    pub to: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payee: Option<String>,
    #[serde(default)]
    pub nonce: String,
    #[serde(default)]
    pub expires_at: String,
    #[serde(default)]
    pub signature: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct X402VerifyResponse {
    #[serde(default)]
    pub valid: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub intent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub verified_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub network: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub asset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub fee_quote_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub fee_rate: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub fee_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub net_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct X402VerifyUntilValidOptions {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub attempts: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub interval_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub retry_errors: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct X402SettleRequest {
    pub payment: X402VerifyRequest,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub settled_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub fee_quote_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reference: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub shielded: Option<bool>,
    /// Base64 legacy Solana transaction built and session-signed by the client
    /// (delegate authority), with the fee-payer slot left for the facilitator.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub delegated_tx: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct X402SettleResponse {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub settled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ledger_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub on_chain_tx: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub batch_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
    /// Additional fields (`[key: string]: unknown`).
    #[serde(flatten, default)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentBatchFlushRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
}

/// `"flushed" | "failed"`.
pub type PaymentBatchFlushStatus = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentBatchFlush {
    #[serde(default)]
    pub flush_id: String,
    #[serde(default)]
    pub batch_id: String,
    #[serde(default)]
    pub status: PaymentBatchFlushStatus,
    #[serde(default)]
    pub item_count: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub item_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub gross_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub fee_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub net_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub asset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub network: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub fee_ledger_tx_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub parent_ledger_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub on_chain_tx: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentBatchFlushResponse {
    pub flush: PaymentBatchFlush,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportedChain {
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub name: String,
    /// `"evm" | "solana"`.
    #[serde(default)]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub chain_id: Option<i64>,
    #[serde(default)]
    pub native_asset: String,
    #[serde(default)]
    pub explorer_url: String,
    #[serde(default)]
    pub assets: Vec<SupportedAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportedAsset {
    #[serde(default)]
    pub symbol: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub address: Option<String>,
    #[serde(default)]
    pub decimals: i64,
}

/// `"active" | "canceled" | "grace_period" | "suspended"`.
pub type SubscriptionStatus = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionPlan {
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub interval: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionAuthorization {
    #[serde(default)]
    pub scheme: String,
    #[serde(default)]
    pub signature: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub verified_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subscription {
    #[serde(default)]
    pub subscription_id: String,
    #[serde(default)]
    pub subscriber: String,
    #[serde(default)]
    pub provider: String,
    pub plan: SubscriptionPlan,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub authorization: Option<SubscriptionAuthorization>,
    #[serde(default)]
    pub status: SubscriptionStatus,
    #[serde(default)]
    pub current_period_end: String,
    #[serde(default)]
    pub auto_renew: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionCreateRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub subscription_id: Option<String>,
    #[serde(default)]
    pub subscriber: String,
    #[serde(default)]
    pub provider: String,
    pub plan: SubscriptionPlan,
    /// `Partial<SubscriptionAuthorization>`.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub authorization: Option<SubscriptionAuthorizationPartial>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<SubscriptionStatus>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub current_period_end: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub auto_renew: Option<bool>,
}

/// `Partial<SubscriptionAuthorization>` — every field optional.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionAuthorizationPartial {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub scheme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub verified_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionRenewRequest {
    #[serde(default)]
    pub payment_authorization: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub settled_amount: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionRenewResponse {
    pub subscription: Subscription,
    #[serde(default)]
    pub settlement: X402SettleResponse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DueRenewalResult {
    #[serde(default)]
    pub renewed: i64,
    #[serde(default)]
    pub failed: i64,
    #[serde(default)]
    pub suspended: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub errors: Option<Vec<String>>,
}
