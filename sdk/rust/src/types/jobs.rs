// Jobs marketplace types — a hiring layer over escrow. See the backend spec
// docs/spec/jobs-marketplace.md.

#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

pub type JobStatus = String;
pub type ProposalStatus = String;
pub type DisputeOutcome = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobBudget {
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub asset: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub chain: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobOnChain {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub vault: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub job_pda_commit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub funding_tx_sig: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobDisputeVote {
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub outcome: DisputeOutcome,
    #[serde(default)]
    pub split_bps: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reasoning: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobDispute {
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub opened_by: String,
    #[serde(default)]
    pub opened_at: String,
    #[serde(default)]
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub outcome: Option<DisputeOutcome>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub split_bps: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub judge_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub presided: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reasoning: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub jury: Option<Vec<JobDisputeVote>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub resolved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobPosting {
    #[serde(default)]
    pub job_id: String,
    #[serde(default)]
    pub client: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skills: Option<Vec<String>>,
    pub budget: JobBudget,
    #[serde(default)]
    pub status: JobStatus,
    #[serde(default)]
    pub proposal_count: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub contract_escrow_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub selected_candidate: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub dispute: Option<JobDispute>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub on_chain: Option<JobOnChain>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub proposal_deadline: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Proposal {
    #[serde(default)]
    pub proposal_id: String,
    #[serde(default)]
    pub job_id: String,
    #[serde(default)]
    pub candidate: String,
    #[serde(default)]
    pub cover_letter: String,
    #[serde(default)]
    pub bid_amount: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub estimated_delivery: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub past_work: Option<Vec<String>>,
    #[serde(default)]
    pub status: ProposalStatus,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobCreateRequest {
    #[serde(default)]
    pub client: String,
    #[serde(default)]
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skills: Option<Vec<String>>,
    pub budget: JobBudget,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub on_chain: Option<JobOnChain>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub proposal_deadline: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalCreateRequest {
    #[serde(default)]
    pub candidate: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cover_letter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bid_amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub estimated_delivery: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub past_work: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub client: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<JobStatus>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skill: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectCandidateResult {
    pub job: JobPosting,
    #[serde(default)]
    pub contract_escrow_id: String,
}
