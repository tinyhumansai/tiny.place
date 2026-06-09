use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_body, to_query};
use crate::types::{Escrow, EscrowCreateRequest, EscrowDispute, EscrowMilestone, EscrowQueryParams};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowListResponse {
    pub escrows: Vec<Escrow>,
}

pub struct EscrowApi {
    http: Arc<HttpClient>,
}

impl EscrowApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn list(&self, params: Option<&EscrowQueryParams>) -> Result<EscrowListResponse> {
        let query = params.map(to_query).transpose()?;
        self.http.get_auth("/escrow", query.as_ref()).await
    }

    pub async fn create(&self, request: &EscrowCreateRequest) -> Result<Escrow> {
        self.http.post("/escrow", Some(&to_body(request)?)).await
    }

    pub async fn get(&self, escrow_id: &str) -> Result<Escrow> {
        let path = format!("/escrow/{}", urlencoding::encode(escrow_id));
        self.http.get_auth(&path, None).await
    }

    pub async fn accept(&self, escrow_id: &str) -> Result<Escrow> {
        let path = format!("/escrow/{}/accept", urlencoding::encode(escrow_id));
        self.http.post(&path, None).await
    }

    pub async fn deliver(
        &self,
        escrow_id: &str,
        description: &str,
        refs: Option<&[String]>,
    ) -> Result<Escrow> {
        let path = format!("/escrow/{}/deliver", urlencoding::encode(escrow_id));
        let mut body = serde_json::json!({ "description": description });
        if let Some(r) = refs {
            body["refs"] = serde_json::json!(r);
        }
        self.http.post(&path, Some(&body)).await
    }

    pub async fn accept_delivery(&self, escrow_id: &str) -> Result<Escrow> {
        let path = format!("/escrow/{}/accept-delivery", urlencoding::encode(escrow_id));
        self.http.post(&path, None).await
    }

    pub async fn claim_release(&self, escrow_id: &str) -> Result<Escrow> {
        let path = format!("/escrow/{}/claim-release", urlencoding::encode(escrow_id));
        self.http.post(&path, None).await
    }

    pub async fn claim_refund(&self, escrow_id: &str) -> Result<Escrow> {
        let path = format!("/escrow/{}/claim-refund", urlencoding::encode(escrow_id));
        self.http.post(&path, None).await
    }

    pub async fn request_revision(&self, escrow_id: &str, reason: &str) -> Result<Escrow> {
        let path = format!(
            "/escrow/{}/request-revision",
            urlencoding::encode(escrow_id)
        );
        let body = serde_json::json!({ "reason": reason });
        self.http.post(&path, Some(&body)).await
    }

    pub async fn cancel(&self, escrow_id: &str) -> Result<Escrow> {
        let path = format!("/escrow/{}/cancel", urlencoding::encode(escrow_id));
        self.http.post(&path, None).await
    }

    pub async fn extend_deadline(
        &self,
        escrow_id: &str,
        new_deadline: &str,
    ) -> Result<Escrow> {
        let path = format!(
            "/escrow/{}/extend-deadline",
            urlencoding::encode(escrow_id)
        );
        let body = serde_json::json!({ "newDeadline": new_deadline });
        self.http.post(&path, Some(&body)).await
    }

    pub async fn approve_extension(&self, escrow_id: &str) -> Result<Escrow> {
        let path = format!(
            "/escrow/{}/approve-extension",
            urlencoding::encode(escrow_id)
        );
        self.http.post(&path, None).await
    }

    pub async fn open_dispute(&self, escrow_id: &str, reason: &str) -> Result<EscrowDispute> {
        let path = format!("/escrow/{}/dispute", urlencoding::encode(escrow_id));
        let body = serde_json::json!({ "reason": reason });
        self.http.post(&path, Some(&body)).await
    }

    pub async fn get_dispute(&self, escrow_id: &str) -> Result<EscrowDispute> {
        let path = format!("/escrow/{}/dispute", urlencoding::encode(escrow_id));
        self.http.get_auth(&path, None).await
    }

    pub async fn submit_evidence(
        &self,
        escrow_id: &str,
        evidence_type: &str,
        description: &str,
        reference: Option<&str>,
    ) -> Result<()> {
        let path = format!(
            "/escrow/{}/dispute/evidence",
            urlencoding::encode(escrow_id)
        );
        let mut body = serde_json::json!({
            "type": evidence_type,
            "description": description
        });
        if let Some(r) = reference {
            body["ref"] = serde_json::json!(r);
        }
        self.http.post(&path, Some(&body)).await
    }

    pub async fn accept_mediation(&self, escrow_id: &str) -> Result<EscrowDispute> {
        let path = format!(
            "/escrow/{}/dispute/accept-mediation",
            urlencoding::encode(escrow_id)
        );
        self.http.post(&path, None).await
    }

    pub async fn reject_mediation(&self, escrow_id: &str) -> Result<EscrowDispute> {
        let path = format!(
            "/escrow/{}/dispute/reject-mediation",
            urlencoding::encode(escrow_id)
        );
        self.http.post(&path, None).await
    }

    pub async fn pay_arbitration(
        &self,
        escrow_id: &str,
        amount: &str,
    ) -> Result<EscrowDispute> {
        let path = format!(
            "/escrow/{}/dispute/pay-arbitration",
            urlencoding::encode(escrow_id)
        );
        let body = serde_json::json!({ "amount": amount });
        self.http.post(&path, Some(&body)).await
    }

    pub async fn vote_arbitration(
        &self,
        escrow_id: &str,
        vote: &serde_json::Value,
    ) -> Result<()> {
        let path = format!(
            "/escrow/{}/dispute/vote",
            urlencoding::encode(escrow_id)
        );
        self.http.post(&path, Some(vote)).await
    }

    pub async fn deliver_milestone(
        &self,
        escrow_id: &str,
        milestone_id: &str,
        description: &str,
        refs: Option<&[String]>,
    ) -> Result<EscrowMilestone> {
        let path = format!(
            "/escrow/{}/milestones/{}/deliver",
            urlencoding::encode(escrow_id),
            urlencoding::encode(milestone_id)
        );
        let mut body = serde_json::json!({ "description": description });
        if let Some(r) = refs {
            body["refs"] = serde_json::json!(r);
        }
        self.http.post(&path, Some(&body)).await
    }

    pub async fn accept_milestone_delivery(
        &self,
        escrow_id: &str,
        milestone_id: &str,
    ) -> Result<EscrowMilestone> {
        let path = format!(
            "/escrow/{}/milestones/{}/accept-delivery",
            urlencoding::encode(escrow_id),
            urlencoding::encode(milestone_id)
        );
        self.http.post(&path, None).await
    }

    pub async fn request_milestone_revision(
        &self,
        escrow_id: &str,
        milestone_id: &str,
        reason: &str,
    ) -> Result<EscrowMilestone> {
        let path = format!(
            "/escrow/{}/milestones/{}/request-revision",
            urlencoding::encode(escrow_id),
            urlencoding::encode(milestone_id)
        );
        let body = serde_json::json!({ "reason": reason });
        self.http.post(&path, Some(&body)).await
    }

    pub async fn dispute_milestone(
        &self,
        escrow_id: &str,
        milestone_id: &str,
        reason: &str,
    ) -> Result<EscrowDispute> {
        let path = format!(
            "/escrow/{}/milestones/{}/dispute",
            urlencoding::encode(escrow_id),
            urlencoding::encode(milestone_id)
        );
        let body = serde_json::json!({ "reason": reason });
        self.http.post(&path, Some(&body)).await
    }
}
