use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::ledger::LedgerType;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoneyAmount {
    pub asset: String,
    pub amount: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeAmount {
    pub amount: String,
    pub asset: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceQuote {
    pub base: String,
    pub quote: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    pub bid: String,
    pub ask: String,
    pub mid: String,
    pub volume_24h: String,
    pub change_24h: String,
    pub source: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceCandle {
    pub open: String,
    pub high: String,
    pub low: String,
    pub close: String,
    pub volume: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceHistory {
    pub base: String,
    pub quote: String,
    pub interval: String,
    pub candles: Vec<PriceCandle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GasEstimate {
    pub network: String,
    pub unit: String,
    pub slow: String,
    pub standard: String,
    pub fast: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_fee: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradePair {
    pub base: String,
    pub quote: String,
    pub networks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapQuote {
    pub quote_id: String,
    pub from: MoneyAmount,
    pub to: MoneyAmount,
    pub rate: String,
    pub price_impact: String,
    pub fee: FeeAmount,
    pub route: Vec<String>,
    pub expires_at: String,
    pub slippage_tolerance: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapExecuteRequest {
    pub quote_id: String,
    pub payment_authorization: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slippage_tolerance: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deadline: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapExecution {
    pub swap_id: String,
    pub quote_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    pub status: String,
    pub from: MoneyAmount,
    pub to: MoneyAmount,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ledger_entry: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeRoute {
    pub provider: String,
    pub from: MoneyAmount,
    pub to: MoneyAmount,
    pub estimated_time: String,
    pub fee: FeeAmount,
    pub min_amount: String,
    pub max_amount: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeQuote {
    pub quote_id: String,
    pub from: MoneyAmount,
    pub to: MoneyAmount,
    pub provider: String,
    pub fee: FeeAmount,
    pub estimated_time: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeExecuteRequest {
    pub quote_id: String,
    pub destination_address: String,
    pub payment_authorization: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeExecution {
    pub bridge_id: String,
    pub quote_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    pub status: String,
    pub from: MoneyAmount,
    pub to: MoneyAmount,
    pub provider: String,
    pub destination_address: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_tx_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub destination_tx_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ledger_entry: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeConfig {
    pub fee_id: String,
    pub scope: String,
    pub transaction_type: LedgerType,
    pub agents: Vec<String>,
    pub rate: String,
    pub effective_from: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effective_until: Option<String>,
    pub created_by: String,
    pub reason: String,
    pub revoked: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPaymentStatus {
    pub handle: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub updated_by: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminAuditEntry {
    pub audit_id: String,
    pub action: String,
    pub actor: String,
    pub timestamp: String,
    pub params: HashMap<String, String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemConfig {
    pub key: String,
    pub value: String,
    pub updated_by: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsSnapshot {
    pub timestamp: String,
    pub agents: AgentStats,
    pub transactions: TransactionStats,
    pub volume: VolumeStats,
    pub fees: FeeStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStats {
    pub registered: u64,
    pub active_30d: u64,
    pub directory_cards: u64,
    pub groups: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionStats {
    pub total: u64,
    pub settled: u64,
    pub by_type: HashMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeStats {
    pub total_usd: String,
    pub by_asset: HashMap<String, String>,
    pub by_network: HashMap<String, String>,
    pub last_24h_usd: String,
    pub last_30d_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeeStats {
    pub total_usd: String,
    pub last_24h_usd: String,
    pub last_30d_usd: String,
}
