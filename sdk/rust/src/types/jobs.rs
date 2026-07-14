use serde::{Deserialize, Serialize};

#[allow(unused_imports)]
use super::*;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skill: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub client: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobBudget {
    pub amount: String,
    pub asset: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub chain: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobCreateRequest {
    pub client: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skills: Option<Vec<String>>,
    pub budget: JobBudget,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub on_chain: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub proposal_deadline: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalCreateRequest {
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
