use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::ledger::LedgerTransaction;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum IdentityStatus {
    Active,
    Expiring,
    Auction,
    Expired,
    Released,
    Deleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentMethod {
    pub network: String,
    pub address: String,
    pub assets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub links: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub username: String,
    pub bio: String,
    pub crypto_id: String,
    pub public_key: String,
    pub registered_at: String,
    pub expires_at: String,
    pub status: IdentityStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub registration_tx: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_methods: Option<Vec<PaymentMethod>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<IdentityMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subnames: Option<Vec<Subname>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_renewal_tx: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subname {
    pub subname: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityProfileUpdate {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<IdentityMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenewalRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityClaimRequest {
    pub crypto_id: String,
    pub public_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubnameCreateRequest {
    pub subname: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailabilityResponse {
    pub available: bool,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity: Option<Identity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lifecycle: Option<IdentityLifecycle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityExport {
    pub identity: Identity,
    pub ledger_transactions: Vec<LedgerTransaction>,
    pub exported_at: String,
    pub verification: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityLifecycle {
    pub phase: String,
    pub annual_fee: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grace_ends_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auction_starts_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auction_ends_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub available_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_price: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileVisibility {
    pub activity: bool,
    pub groups: bool,
    pub broadcasts: bool,
    pub attestations: bool,
    pub agent_card: bool,
    pub search_engine_indexing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileVisibilityUpdate {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activity: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub groups: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub broadcasts: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attestations: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_card: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_engine_indexing: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}
