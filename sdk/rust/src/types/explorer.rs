use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::ledger::{LedgerReference, LedgerStatus, LedgerType, LedgerVisibility};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerFeeSummary {
    pub tx_id: String,
    pub amount: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rate: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerFeeDetail {
    pub tx_id: String,
    pub amount: String,
    pub amount_formatted: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rate: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerTransactionSummary {
    pub tx_id: String,
    pub visibility: LedgerVisibility,
    #[serde(rename = "type")]
    pub tx_type: LedgerType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset: Option<String>,
    pub network: String,
    pub timestamp: String,
    pub on_chain_tx: String,
    pub status: LedgerStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fee: Option<ExplorerFeeSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerParty {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crypto_id: Option<String>,
    pub reputation: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerRelatedTransaction {
    pub tx_id: String,
    #[serde(rename = "type")]
    pub tx_type: LedgerType,
    pub relationship: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerTransactionDetail {
    pub tx_id: String,
    pub visibility: LedgerVisibility,
    #[serde(rename = "type")]
    pub tx_type: LedgerType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<ExplorerParty>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<ExplorerParty>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount_formatted: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset: Option<String>,
    pub network: String,
    pub timestamp: String,
    pub on_chain_tx: String,
    pub on_chain_verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_number: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirmations: Option<u64>,
    pub status: LedgerStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference: Option<LedgerReference>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fee: Option<ExplorerFeeDetail>,
    pub related_transactions: Vec<ExplorerRelatedTransaction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerVerification {
    pub tx_id: String,
    pub on_chain_tx: String,
    pub network: String,
    pub verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_number: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirmations: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explorer_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerVolumeCount {
    pub count: u64,
    pub volume_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerFeeCount {
    pub count: u64,
    pub total_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerCounterparty {
    pub username: String,
    pub transaction_count: u64,
    pub volume_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerNetworkActivity {
    pub count: u64,
    pub volume_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerAgentSummary {
    pub total_transactions: u64,
    pub total_volume_usd: String,
    pub sent: ExplorerVolumeCount,
    pub received: ExplorerVolumeCount,
    pub fees_paid: ExplorerFeeCount,
    pub top_counterparties: Vec<ExplorerCounterparty>,
    pub by_type: HashMap<String, u64>,
    pub by_network: HashMap<String, ExplorerNetworkActivity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerAgentResponse {
    pub agent: ExplorerParty,
    pub summary: ExplorerAgentSummary,
    pub recent_transactions: Vec<ExplorerTransactionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerLedgerOverview {
    pub total_entries: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerActivityWindow {
    pub transactions: u64,
    pub volume_usd: String,
    pub fees_usd: String,
    pub unique_agents: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerAllTimeOverview {
    pub volume_usd: String,
    pub fees_usd: String,
    pub registered_agents: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerNetworkOverview {
    pub transactions: u64,
    pub volume_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerOverview {
    pub timestamp: String,
    pub ledger: ExplorerLedgerOverview,
    pub last_24h: ExplorerActivityWindow,
    pub all_time: ExplorerAllTimeOverview,
    pub by_network: HashMap<String, ExplorerNetworkOverview>,
    pub recent_transactions: Vec<ExplorerTransactionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerTransactionListResponse {
    pub transactions: Vec<ExplorerTransactionSummary>,
    pub total: u64,
    pub page: u64,
    pub page_size: u64,
}
