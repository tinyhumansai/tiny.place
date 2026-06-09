use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PaymentIntentStatus {
    Verified,
    Settled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentIntent {
    pub intent_id: String,
    pub verified_id: String,
    pub nonce_key: String,
    pub payment_hash: String,
    pub network: String,
    pub asset: String,
    pub amount: String,
    pub from: String,
    pub to: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fee_id: Option<String>,
    pub fee_rate: String,
    pub fee_amount: String,
    pub net_amount: String,
    pub status: PaymentIntentStatus,
    pub created_at: String,
    pub expires_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ledger_tx_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct X402VerifyRequest {
    pub scheme: String,
    pub network: String,
    pub asset: String,
    pub amount: String,
    pub from: String,
    pub to: String,
    pub nonce: String,
    pub expires_at: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct X402VerifyResponse {
    pub valid: bool,
    pub intent_id: String,
    pub fee_rate: String,
    pub fee_amount: String,
    pub net_amount: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct X402SettleRequest {
    pub intent_id: String,
    pub on_chain_tx: String,
    pub network: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct X402SettleResponse {
    pub ledger_tx_id: String,
    pub on_chain_tx: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportedChain {
    pub network: String,
    pub name: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chain_id: Option<u64>,
    pub native_asset: String,
    pub explorer_url: String,
    pub assets: Vec<SupportedAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportedAsset {
    pub symbol: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    pub decimals: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionStatus {
    Active,
    Canceled,
    GracePeriod,
    Suspended,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionPlan {
    pub amount: String,
    pub asset: String,
    pub network: String,
    pub interval: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionAuthorization {
    pub scheme: String,
    pub signature: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subscription {
    pub subscription_id: String,
    pub subscriber: String,
    pub provider: String,
    pub plan: SubscriptionPlan,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authorization: Option<SubscriptionAuthorization>,
    pub status: SubscriptionStatus,
    pub current_period_end: String,
    pub auto_renew: bool,
    pub created_at: String,
    pub updated_at: String,
}
