#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap; // sibling types share a flat namespace, like the TS barrel

pub type EscrowStatus = String;
pub type EscrowDisputeTier = String;
pub type EscrowDisputeStatus = String;
pub type EscrowEvidenceType = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowTerms {
    #[serde(default)]
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub deliverables: Option<Vec<String>>,
    #[serde(default)]
    pub deadline: String,
    #[serde(default)]
    pub max_revisions: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub auto_release_after: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowMilestone {
    #[serde(default)]
    pub milestone_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub deadline: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub revision_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowDelivery {
    #[serde(default)]
    pub delivery_id: String,
    #[serde(default)]
    pub submitted_by: String,
    #[serde(default)]
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub refs: Option<Vec<String>>,
    #[serde(default)]
    pub submitted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowExtension {
    #[serde(default)]
    pub extension_id: String,
    #[serde(default)]
    pub requested_by: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub deadline: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub requested_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowEvidence {
    #[serde(default)]
    pub evidence_id: String,
    #[serde(default)]
    pub dispute_id: String,
    #[serde(default)]
    pub submitted_by: String,
    #[serde(rename = "type", default)]
    pub evidence_type: EscrowEvidenceType,
    #[serde(default)]
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub r#ref: Option<String>,
    #[serde(default)]
    pub submitted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowMediationProposal {
    #[serde(default)]
    pub proposed_at: String,
    #[serde(default)]
    pub resolution: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub client_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub provider_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rationale: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowCouncilVote {
    #[serde(default)]
    pub agent: String,
    #[serde(default)]
    pub vote: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub client_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub provider_pct: Option<f64>,
    #[serde(default)]
    pub round: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rationale: Option<String>,
    #[serde(default)]
    pub voted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowArbitrationOutcome {
    #[serde(default)]
    pub resolution: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub client_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub provider_pct: Option<f64>,
    #[serde(default)]
    pub round: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rationale: Option<String>,
    #[serde(default)]
    pub resolved_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowDispute {
    #[serde(default)]
    pub dispute_id: String,
    #[serde(default)]
    pub escrow_id: String,
    #[serde(default)]
    pub tier: EscrowDisputeTier,
    #[serde(default)]
    pub opened_by: String,
    #[serde(default)]
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub evidence: Option<Vec<EscrowEvidence>>,
    #[serde(default)]
    pub status: EscrowDisputeStatus,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub proposal: Option<EscrowMediationProposal>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub mediation_accepted_by: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub arbitration_paid_by: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub arbitration_round: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub council: Option<Vec<EscrowCouncilVote>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub arbitration_outcome: Option<EscrowArbitrationOutcome>,
    #[serde(default)]
    pub opened_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub escalated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub resolved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Escrow {
    #[serde(default)]
    pub escrow_id: String,
    #[serde(default)]
    pub status: EscrowStatus,
    #[serde(default)]
    pub client: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub client_crypto_id: Option<String>,
    #[serde(default)]
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub provider_crypto_id: Option<String>,
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub network: String,
    pub terms: EscrowTerms,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub milestones: Option<Vec<EscrowMilestone>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub deliveries: Option<Vec<EscrowDelivery>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub extensions: Option<Vec<EscrowExtension>>,
    #[serde(default)]
    pub revision_count: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub dispute: Option<EscrowDispute>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub funded_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub accepted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub delivered_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub resolved_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cancelled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub on_chain_tx: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ledger_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub release_ledger_tx_id: Option<String>,
}

/// A milestone as supplied at escrow creation
/// (`Omit<EscrowMilestone, "milestoneId" | "status" | "revisionCount">`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowMilestoneInput {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub deadline: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowCreateRequest {
    #[serde(default)]
    pub client: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub client_crypto_id: Option<String>,
    #[serde(default)]
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub provider_crypto_id: Option<String>,
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub network: String,
    pub terms: EscrowTerms,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub milestones: Option<Vec<EscrowMilestoneInput>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_authorization: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub client: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<EscrowStatus>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}
