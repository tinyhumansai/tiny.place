//! Identity registry types. Mirrors `sdk/typescript/src/types/identity.ts`.

#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

/// Lifecycle status of a registered name.
pub type IdentityStatus = String;

/// A payment method advertised on an identity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentMethod {
    pub network: String,
    pub address: String,
    pub assets: Vec<String>,
}

/// A registered `@handle` identity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub username: String,
    pub crypto_id: String,
    pub public_key: String,
    pub registered_at: String,
    pub expires_at: String,
    pub status: IdentityStatus,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub registration_tx: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_methods: Option<Vec<PaymentMethod>>,
    /// Whether this name is the owner wallet's assigned/primary handle. At most
    /// one name per wallet is primary; a primary name is locked from sale.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub primary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub subnames: Option<Vec<Subname>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<std::collections::HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_renewal_tx: Option<String>,
    pub updated_at: String,
}

/// A subname under a registered identity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subname {
    pub subname: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bio: Option<String>,
    pub created_at: String,
}

/// Request body for renewing a name.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenewalRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<std::collections::HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

/// Request body for claiming a name.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityClaimRequest {
    pub crypto_id: String,
    pub public_key: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<std::collections::HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

/// Request body for a direct, no-payment transfer of a `@handle` to another
/// wallet. `crypto_id`/`public_key` identify the recipient; `signature` is the
/// CURRENT owner's authorization over the `identity.transfer` payload.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityTransferRequest {
    pub crypto_id: String,
    pub public_key: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

/// Request body for creating a subname.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubnameCreateRequest {
    pub subname: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

/// Availability lookup response for a name.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailabilityResponse {
    pub available: bool,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub identity: Option<Identity>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub lifecycle: Option<IdentityLifecycle>,
}

/// A signed export of an identity and its ledger history.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityExport {
    pub identity: Identity,
    pub ledger_transactions: Vec<crate::types::LedgerTransaction>,
    pub exported_at: String,
    pub verification: std::collections::HashMap<String, String>,
}

/// Lifecycle phase detail for a name.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityLifecycle {
    pub phase: String,
    pub annual_fee: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub grace_ends_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub auction_starts_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub auction_ends_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub available_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub current_price: Option<String>,
}

/// Profile visibility flags for an identity.
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

/// Partial update for [`ProfileVisibility`].
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileVisibilityUpdate {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub activity: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub groups: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub broadcasts: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub attestations: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent_card: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub search_engine_indexing: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}
