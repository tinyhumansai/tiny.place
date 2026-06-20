//! Commerce types (pricing, fees, stats). Mirrors
//! `sdk/typescript/src/types/commerce.ts`.

use std::collections::HashMap;

#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

/// A monetary amount on a given asset/network.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoneyAmount {
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub amount: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub network: Option<String>,
}

/// A fee amount, optionally with a percentage rate.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeAmount {
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub asset: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub percent: Option<String>,
}

/// A spot price quote for a trading pair.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceQuote {
    #[serde(default)]
    pub base: String,
    #[serde(default)]
    pub quote: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub network: Option<String>,
    #[serde(default)]
    pub bid: String,
    #[serde(default)]
    pub ask: String,
    #[serde(default)]
    pub mid: String,
    #[serde(default)]
    pub volume24h: String,
    #[serde(default)]
    pub change24h: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub updated_at: String,
}

/// A single OHLCV candle.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceCandle {
    #[serde(default)]
    pub open: String,
    #[serde(default)]
    pub high: String,
    #[serde(default)]
    pub low: String,
    #[serde(default)]
    pub close: String,
    #[serde(default)]
    pub volume: String,
    #[serde(default)]
    pub timestamp: String,
}

/// Historical price candles for a pair.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceHistory {
    #[serde(default)]
    pub base: String,
    #[serde(default)]
    pub quote: String,
    #[serde(default)]
    pub interval: String,
    #[serde(default)]
    pub candles: Vec<PriceCandle>,
}

/// A gas-fee estimate for a network.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GasEstimate {
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub slow: String,
    #[serde(default)]
    pub standard: String,
    #[serde(default)]
    pub fast: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub estimated_fee: Option<String>,
    #[serde(default)]
    pub updated_at: String,
}

/// A tradable pair and the networks it is available on.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradePair {
    #[serde(default)]
    pub base: String,
    #[serde(default)]
    pub quote: String,
    #[serde(default)]
    pub networks: Vec<String>,
}

/// A signed payment payload carried by commerce execution requests.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommercePaymentPayload {
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
    pub nonce: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, String>>,
}

/// A fee configuration rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeConfig {
    #[serde(default)]
    pub fee_id: String,
    #[serde(default)]
    pub scope: String,
    #[serde(default)]
    pub transaction_type: crate::types::LedgerType,
    #[serde(default)]
    pub agents: Vec<String>,
    #[serde(default)]
    pub rate: String,
    #[serde(default)]
    pub effective_from: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub effective_until: Option<String>,
    #[serde(default)]
    pub created_by: String,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub revoked: bool,
    #[serde(default)]
    pub updated_at: String,
}

/// Query params for resolving the applicable fee.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeResolveParams {
    #[serde(default)]
    pub from: String,
    #[serde(default)]
    pub to: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub r#type: Option<crate::types::LedgerType>,
}

/// Response for a fee-resolution lookup.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeResolveResponse {
    pub fee: FeeConfig,
}

/// Aggregate fee metrics (admin).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminFeeMetrics {
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub total: String,
    #[serde(default)]
    pub last24h: String,
    #[serde(default)]
    pub last30d: String,
    #[serde(default)]
    pub by_asset: HashMap<String, String>,
    #[serde(default)]
    pub by_network: HashMap<String, String>,
    #[serde(default)]
    pub by_transaction_type: HashMap<String, String>,
    #[serde(default)]
    pub by_agent: HashMap<String, String>,
}

/// An agent's payment status (admin).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPaymentStatus {
    #[serde(default)]
    pub handle: String,
    #[serde(default)]
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub updated_by: String,
    #[serde(default)]
    pub updated_at: String,
}

/// An admin audit-log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminAuditEntry {
    #[serde(default)]
    pub audit_id: String,
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub actor: String,
    #[serde(default)]
    pub timestamp: String,
    #[serde(default)]
    pub params: HashMap<String, String>,
    #[serde(default)]
    pub reason: String,
}

/// A system configuration key/value.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemConfig {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub updated_by: String,
    #[serde(default)]
    pub updated_at: String,
}

/// A point-in-time stats snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsSnapshot {
    #[serde(default)]
    pub timestamp: String,
    pub agents: AgentStats,
    pub transactions: TransactionStats,
    pub volume: VolumeStats,
    pub fees: FeeStats,
}

/// Agent-level statistics. Field names match the snake_case wire format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStats {
    #[serde(default)]
    pub registered: i64,
    #[serde(default)]
    pub active_30d: i64,
    #[serde(default)]
    pub directory_cards: i64,
    #[serde(default)]
    pub groups: i64,
}

/// Transaction-level statistics. Field names match the snake_case wire format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionStats {
    #[serde(default)]
    pub total: i64,
    #[serde(default)]
    pub settled: i64,
    #[serde(default)]
    pub by_type: HashMap<String, i64>,
}

/// Volume statistics. Field names match the snake_case wire format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeStats {
    #[serde(default)]
    pub total_usd: String,
    #[serde(default)]
    pub by_asset: HashMap<String, String>,
    #[serde(default)]
    pub by_network: HashMap<String, String>,
    #[serde(default)]
    pub last_24h_usd: String,
    #[serde(default)]
    pub last_30d_usd: String,
}

/// Fee statistics. Field names match the snake_case wire format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeeStats {
    #[serde(default)]
    pub total_usd: String,
    #[serde(default)]
    pub last_24h_usd: String,
    #[serde(default)]
    pub last_30d_usd: String,
}
