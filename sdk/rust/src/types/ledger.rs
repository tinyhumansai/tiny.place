#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap; // sibling types share a flat namespace, like the TS barrel

/// `"unshielded" | "shielded"`.
pub type LedgerVisibility = String;

/// One of the ledger transaction types (e.g. `REGISTRATION`, `SALE`, `FEE`).
pub type LedgerType = String;

/// `"PENDING" | "SETTLED" | "FAILED"`.
pub type LedgerStatus = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerReference {
    #[serde(default)]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub parent_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rate: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerTransaction {
    #[serde(default)]
    pub tx_id: String,
    #[serde(default)]
    pub visibility: LedgerVisibility,
    #[serde(rename = "type", default)]
    pub transaction_type: LedgerType,
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
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reference: Option<LedgerReference>,
    #[serde(default)]
    pub on_chain_tx: String,
    #[serde(default)]
    pub status: LedgerStatus,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerListParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub r#type: Option<LedgerType>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub network: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<LedgerStatus>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub after: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub asset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub visibility: Option<LedgerVisibility>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerVerifyRequest {
    #[serde(default)]
    pub on_chain_tx: String,
    #[serde(default)]
    pub network: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ledger_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub asset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerVerifyResult {
    #[serde(default)]
    pub verified: bool,
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub matches_ledger: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub block_number: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub block_timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub confirmations: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ledger_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
}
