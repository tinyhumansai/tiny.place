use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EscrowStatus {
    Funded,
    Accepted,
    Delivered,
    RevisionRequested,
    Settled,
    Cancelled,
    Disputed,
    Resolved,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EscrowDisputeTier {
    Mediation,
    Arbitration,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EscrowDisputeStatus {
    Open,
    Proposed,
    Accepted,
    Escalated,
    Resolved,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EscrowEvidenceType {
    Message,
    Delivery,
    File,
    ExternalLink,
    Transaction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowTerms {
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deliverables: Option<Vec<String>>,
    pub deadline: String,
    pub max_revisions: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_release_after: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowMilestone {
    pub milestone_id: String,
    pub title: String,
    pub amount: String,
    pub deadline: String,
    pub status: String,
    pub revision_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowDelivery {
    pub delivery_id: String,
    pub submitted_by: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refs: Option<Vec<String>>,
    pub submitted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowExtension {
    pub extension_id: String,
    pub requested_by: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub deadline: String,
    pub status: String,
    pub requested_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowEvidence {
    pub evidence_id: String,
    pub dispute_id: String,
    pub submitted_by: String,
    #[serde(rename = "type")]
    pub evidence_type: EscrowEvidenceType,
    pub description: String,
    #[serde(rename = "ref", skip_serializing_if = "Option::is_none")]
    pub reference: Option<String>,
    pub submitted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowMediationProposal {
    pub proposed_at: String,
    pub resolution: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rationale: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowCouncilVote {
    pub agent: String,
    pub vote: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_pct: Option<f64>,
    pub round: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rationale: Option<String>,
    pub voted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowArbitrationOutcome {
    pub resolution: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_pct: Option<f64>,
    pub round: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rationale: Option<String>,
    pub resolved_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowDispute {
    pub dispute_id: String,
    pub escrow_id: String,
    pub tier: EscrowDisputeTier,
    pub opened_by: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence: Option<Vec<EscrowEvidence>>,
    pub status: EscrowDisputeStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposal: Option<EscrowMediationProposal>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mediation_accepted_by: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arbitration_paid_by: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arbitration_round: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub council: Option<Vec<EscrowCouncilVote>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arbitration_outcome: Option<EscrowArbitrationOutcome>,
    pub opened_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub escalated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Escrow {
    pub escrow_id: String,
    pub status: EscrowStatus,
    pub client: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_crypto_id: Option<String>,
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_crypto_id: Option<String>,
    pub amount: String,
    pub asset: String,
    pub network: String,
    pub terms: EscrowTerms,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub milestones: Option<Vec<EscrowMilestone>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deliveries: Option<Vec<EscrowDelivery>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extensions: Option<Vec<EscrowExtension>>,
    pub revision_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dispute: Option<EscrowDispute>,
    pub created_at: String,
    pub funded_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accepted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivered_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_chain_tx: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ledger_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_ledger_tx_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowMilestoneCreate {
    pub title: String,
    pub amount: String,
    pub deadline: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowCreateRequest {
    pub provider: String,
    pub amount: String,
    pub asset: String,
    pub network: String,
    pub terms: EscrowTerms,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub milestones: Option<Vec<EscrowMilestoneCreate>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowQueryParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<EscrowStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<u32>,
}
