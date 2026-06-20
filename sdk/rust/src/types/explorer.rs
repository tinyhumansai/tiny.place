use std::collections::HashMap;

#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerFeeSummary {
    #[serde(default)]
    pub tx_id: String,
    #[serde(default)]
    pub amount: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rate: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerFeeDetail {
    #[serde(default)]
    pub tx_id: String,
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub amount_formatted: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rate: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerTransactionSummary {
    #[serde(default)]
    pub tx_id: String,
    #[serde(default)]
    pub visibility: crate::types::LedgerVisibility,
    #[serde(rename = "type", default)]
    pub transaction_type: crate::types::LedgerType,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub asset: Option<String>,
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub timestamp: String,
    #[serde(default)]
    pub on_chain_tx: String,
    #[serde(default)]
    pub status: crate::types::LedgerStatus,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub fee: Option<ExplorerFeeSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerParty {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub crypto_id: Option<String>,
    #[serde(default)]
    pub reputation: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerRelatedTransaction {
    #[serde(default)]
    pub tx_id: String,
    #[serde(rename = "type", default)]
    pub transaction_type: crate::types::LedgerType,
    #[serde(default)]
    pub relationship: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerTransactionDetail {
    #[serde(default)]
    pub tx_id: String,
    #[serde(default)]
    pub visibility: crate::types::LedgerVisibility,
    #[serde(rename = "type", default)]
    pub transaction_type: crate::types::LedgerType,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<ExplorerParty>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub to: Option<ExplorerParty>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub amount_formatted: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub asset: Option<String>,
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub timestamp: String,
    #[serde(default)]
    pub on_chain_tx: String,
    #[serde(default)]
    pub on_chain_verified: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub block_number: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub confirmations: Option<i64>,
    #[serde(default)]
    pub status: crate::types::LedgerStatus,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reference: Option<crate::types::LedgerReference>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub fee: Option<ExplorerFeeDetail>,
    #[serde(default)]
    pub related_transactions: Vec<ExplorerRelatedTransaction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerVerification {
    #[serde(default)]
    pub tx_id: String,
    #[serde(default)]
    pub on_chain_tx: String,
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub verified: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub block_number: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub block_timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub confirmations: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub explorer_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerVolumeCount {
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub volume_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerFeeCount {
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub total_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerCounterparty {
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub transaction_count: i64,
    #[serde(default)]
    pub volume_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerNetworkActivity {
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub volume_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerAgentSummary {
    #[serde(default)]
    pub total_transactions: i64,
    #[serde(default)]
    pub total_volume_usd: String,
    pub sent: ExplorerVolumeCount,
    pub received: ExplorerVolumeCount,
    pub fees_paid: ExplorerFeeCount,
    #[serde(default)]
    pub top_counterparties: Vec<ExplorerCounterparty>,
    #[serde(default)]
    pub by_type: HashMap<String, i64>,
    #[serde(default)]
    pub by_network: HashMap<String, ExplorerNetworkActivity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerAgentResponse {
    pub agent: ExplorerParty,
    pub summary: ExplorerAgentSummary,
    #[serde(default)]
    pub recent_transactions: Vec<ExplorerTransactionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerLedgerOverview {
    #[serde(default)]
    pub total_entries: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub latest_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub latest_timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerActivityWindow {
    #[serde(default)]
    pub transactions: i64,
    #[serde(default)]
    pub volume_usd: String,
    #[serde(default)]
    pub fees_usd: String,
    #[serde(default)]
    pub unique_agents: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerAllTimeOverview {
    #[serde(default)]
    pub volume_usd: String,
    #[serde(default)]
    pub fees_usd: String,
    #[serde(default)]
    pub registered_agents: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerNetworkOverview {
    #[serde(default)]
    pub transactions: i64,
    #[serde(default)]
    pub volume_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerOverview {
    #[serde(default)]
    pub timestamp: String,
    pub ledger: ExplorerLedgerOverview,
    pub last24h: ExplorerActivityWindow,
    pub all_time: ExplorerAllTimeOverview,
    #[serde(default)]
    pub by_network: HashMap<String, ExplorerNetworkOverview>,
    #[serde(default)]
    pub recent_transactions: Vec<ExplorerTransactionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerTransactionListResponse {
    #[serde(default)]
    pub transactions: Vec<ExplorerTransactionSummary>,
    #[serde(default)]
    pub total: i64,
    #[serde(default)]
    pub page: i64,
    #[serde(default)]
    pub page_size: i64,
}
