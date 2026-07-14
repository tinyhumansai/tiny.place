//! Compatibility wrapper for jobs-board endpoints used by OpenHuman.

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{JobCreateRequest, JobQueryParams, ProposalCreateRequest};
use crate::util::encode;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

#[derive(Clone)]
pub struct JobsApi {
    http: HttpClient,
}

impl JobsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn get(&self, job_id: &str) -> Result<serde_json::Value> {
        self.http
            .get(&format!("/jobs/{}", encode(job_id)), &[])
            .await
    }

    pub async fn list(&self, params: Option<&JobQueryParams>) -> Result<serde_json::Value> {
        self.http.get("/jobs", &job_query(params)).await
    }

    pub async fn create(&self, request: &JobCreateRequest) -> Result<serde_json::Value> {
        self.http.post_directory_auth("/jobs", Some(request)).await
    }

    pub async fn cancel(&self, job_id: &str, actor: &str) -> Result<serde_json::Value> {
        let body = serde_json::json!({ "actor": actor });
        self.http
            .post_directory_auth_as(
                &format!("/jobs/{}/cancel", encode(job_id)),
                actor,
                Some(&body),
            )
            .await
    }

    pub async fn apply(
        &self,
        job_id: &str,
        request: &ProposalCreateRequest,
    ) -> Result<serde_json::Value> {
        self.http
            .post_directory_auth_as(
                &format!("/jobs/{}/proposals", encode(job_id)),
                &request.candidate,
                Some(request),
            )
            .await
    }

    pub async fn list_proposals(
        &self,
        job_id: &str,
        actor: &str,
        params: Option<&ProposalQueryParams>,
    ) -> Result<serde_json::Value> {
        let query = proposal_query(params);
        self.http
            .get_directory_auth_as(
                &format!("/jobs/{}/proposals", encode(job_id)),
                actor,
                &query,
            )
            .await
    }

    pub async fn get_proposal(
        &self,
        job_id: &str,
        proposal_id: &str,
        actor: &str,
    ) -> Result<serde_json::Value> {
        self.http
            .get_directory_auth_as(
                &format!("/jobs/{}/proposals/{}", encode(job_id), encode(proposal_id)),
                actor,
                &[],
            )
            .await
    }

    pub async fn shortlist_proposal(
        &self,
        job_id: &str,
        proposal_id: &str,
        actor: &str,
    ) -> Result<serde_json::Value> {
        self.post_proposal_action(
            job_id,
            proposal_id,
            actor,
            "shortlist",
            serde_json::json!({}),
        )
        .await
    }

    pub async fn withdraw_proposal(
        &self,
        job_id: &str,
        proposal_id: &str,
        actor: &str,
    ) -> Result<serde_json::Value> {
        self.post_proposal_action(
            job_id,
            proposal_id,
            actor,
            "withdraw",
            serde_json::json!({}),
        )
        .await
    }

    pub async fn select(
        &self,
        job_id: &str,
        actor: &str,
        proposal_id: &str,
        network: Option<&str>,
    ) -> Result<serde_json::Value> {
        let body = serde_json::json!({ "proposalId": proposal_id, "network": network });
        self.http
            .post_directory_auth_as(
                &format!("/jobs/{}/select", encode(job_id)),
                actor,
                Some(&body),
            )
            .await
    }

    pub async fn open_dispute(
        &self,
        job_id: &str,
        actor: &str,
        reason: &str,
    ) -> Result<serde_json::Value> {
        let body = serde_json::json!({ "actor": actor, "reason": reason });
        self.http
            .post_directory_auth_as(
                &format!("/jobs/{}/dispute", encode(job_id)),
                actor,
                Some(&body),
            )
            .await
    }

    pub async fn adjudicate_dispute(&self, job_id: &str, actor: &str) -> Result<serde_json::Value> {
        let body = serde_json::json!({ "actor": actor });
        self.http
            .post_directory_auth_as(
                &format!("/jobs/{}/dispute/adjudicate", encode(job_id)),
                actor,
                Some(&body),
            )
            .await
    }

    async fn post_proposal_action(
        &self,
        job_id: &str,
        proposal_id: &str,
        actor: &str,
        action: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value> {
        self.http
            .post_directory_auth_as(
                &format!(
                    "/jobs/{}/proposals/{}/{}",
                    encode(job_id),
                    encode(proposal_id),
                    action
                ),
                actor,
                Some(&body),
            )
            .await
    }
}

fn job_query(params: Option<&JobQueryParams>) -> Vec<(String, String)> {
    let mut query = Vec::new();
    if let Some(p) = params {
        push_opt(&mut query, "q", p.q.as_deref());
        push_opt(&mut query, "skill", p.skill.as_deref());
        push_opt(&mut query, "status", p.status.as_deref());
        push_opt(&mut query, "client", p.client.as_deref());
        push_opt(&mut query, "provider", p.provider.as_deref());
        push_i64(&mut query, "limit", p.limit);
        push_i64(&mut query, "offset", p.offset);
    }
    query
}

fn proposal_query(params: Option<&ProposalQueryParams>) -> Vec<(String, String)> {
    let mut query = Vec::new();
    if let Some(p) = params {
        push_opt(&mut query, "status", p.status.as_deref());
        push_i64(&mut query, "limit", p.limit);
        push_i64(&mut query, "offset", p.offset);
    }
    query
}

fn push_opt(query: &mut Vec<(String, String)>, key: &str, value: Option<&str>) {
    if let Some(value) = value {
        query.push((key.to_string(), value.to_string()));
    }
}

fn push_i64(query: &mut Vec<(String, String)>, key: &str, value: Option<i64>) {
    if let Some(value) = value {
        query.push((key.to_string(), value.to_string()));
    }
}
