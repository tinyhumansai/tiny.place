use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LedgerVisibility {
    Unshielded,
    Shielded,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[allow(non_camel_case_types)]
pub enum LedgerType {
    REGISTRATION,
    RENEWAL,
    SALE,
    PAYMENT,
    SUBSCRIPTION,
    GROUP_FEE,
    EVENT_TICKET,
    EVENT_REFUND,
    REVENUE_SHARE,
    ESCROW_FUND,
    ESCROW_RELEASE,
    ESCROW_REFUND,
    ARBITRATION_FEE,
    FEE,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[allow(non_camel_case_types)]
pub enum LedgerStatus {
    PENDING,
    SETTLED,
    FAILED,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerReference {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rate: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerTransaction {
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference: Option<LedgerReference>,
    pub on_chain_tx: String,
    pub status: LedgerStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerListParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub tx_type: Option<LedgerType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<LedgerStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<LedgerVisibility>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerVerifyRequest {
    pub on_chain_tx: String,
    pub network: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ledger_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerVerifyResult {
    pub verified: bool,
    pub network: String,
    pub matches_ledger: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_number: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirmations: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ledger_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
