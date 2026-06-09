use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_body};
use crate::types::{
    Attestation, AttestationCreate, LeaderboardResponse, ReputationHistoryPoint, ReputationReview,
    ReputationReviewCreate, ReputationScore,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryResponse {
    pub history: Vec<ReputationHistoryPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewListResponse {
    pub reviews: Vec<ReputationReview>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttestationListResponse {
    pub attestations: Vec<Attestation>,
}

pub struct ReputationApi {
    http: Arc<HttpClient>,
}

impl ReputationApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn get_score(&self, agent_id: &str) -> Result<ReputationScore> {
        let path = format!("/reputation/{}", urlencoding::encode(agent_id));
        self.http.get(&path, None).await
    }

    pub async fn get_history(&self, agent_id: &str) -> Result<HistoryResponse> {
        let path = format!("/reputation/{}/history", urlencoding::encode(agent_id));
        self.http.get(&path, None).await
    }

    pub async fn get_reviews(&self, agent_id: &str) -> Result<ReviewListResponse> {
        let path = format!("/reputation/{}/reviews", urlencoding::encode(agent_id));
        self.http.get(&path, None).await
    }

    pub async fn get_attestations(&self, agent_id: &str) -> Result<AttestationListResponse> {
        let path = format!(
            "/reputation/{}/attestations",
            urlencoding::encode(agent_id)
        );
        self.http.get(&path, None).await
    }

    pub async fn create_review(
        &self,
        review: &ReputationReviewCreate,
    ) -> Result<ReputationReview> {
        self.http
            .post("/reputation/reviews", Some(&to_body(review)?))
            .await
    }

    pub async fn create_attestation(
        &self,
        attestation: &AttestationCreate,
    ) -> Result<Attestation> {
        self.http
            .post("/reputation/attestations", Some(&to_body(attestation)?))
            .await
    }

    pub async fn delete_attestation(&self, attestation_id: &str) -> Result<()> {
        let path = format!(
            "/reputation/attestations/{}",
            urlencoding::encode(attestation_id)
        );
        self.http.delete(&path, None).await
    }

    pub async fn leaderboard(
        &self,
        category: Option<&str>,
        limit: Option<u32>,
        period: Option<&str>,
        sort: Option<&str>,
    ) -> Result<LeaderboardResponse> {
        let path = match category {
            Some(c) => format!("/leaderboards/{}", urlencoding::encode(c)),
            None => "/leaderboards/reputation".to_string(),
        };
        let mut query = serde_json::Map::new();
        if let Some(l) = limit {
            query.insert("limit".into(), serde_json::json!(l));
        }
        if let Some(p) = period {
            query.insert("period".into(), serde_json::json!(p));
        }
        if let Some(s) = sort {
            query.insert("sort".into(), serde_json::json!(s));
        }
        let q = if query.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(query))
        };
        self.http.get(&path, q.as_ref()).await
    }
}
