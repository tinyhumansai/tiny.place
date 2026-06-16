//! Public feedback board (`/feedback`). Mirrors `sdk/typescript/src/api/feedback.ts`.

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    FeedbackCreate, FeedbackItem, FeedbackListParams, FeedbackListResponse, FeedbackStatusUpdate,
    FeedbackVoteRequest,
};
use crate::util::encode;

#[derive(Clone)]
pub struct FeedbackApi {
    http: HttpClient,
}

impl FeedbackApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// List public feedback items.
    pub async fn list(&self, params: Option<&FeedbackListParams>) -> Result<FeedbackListResponse> {
        self.http.get("/feedback", &list_query(params)).await
    }

    /// List feedback items including admin-only states (operator key required).
    pub async fn list_admin(
        &self,
        params: Option<&FeedbackListParams>,
    ) -> Result<FeedbackListResponse> {
        self.http.get_admin("/feedback", &list_query(params)).await
    }

    /// Fetch a single feedback item by id.
    pub async fn get(&self, feedback_id: &str) -> Result<FeedbackItem> {
        self.http
            .get(&format!("/feedback/{}", encode(feedback_id)), &[])
            .await
    }

    /// Submit a new feedback item, signed as `feedback.author`.
    pub async fn create(&self, feedback: FeedbackCreate) -> Result<FeedbackItem> {
        let author = feedback.author.clone();
        self.http
            .post_directory_auth_as("/feedback", &author, Some(&feedback))
            .await
    }

    /// Vote on a feedback item, signed as `vote.voter`.
    pub async fn vote(&self, feedback_id: &str, vote: FeedbackVoteRequest) -> Result<FeedbackItem> {
        let voter = vote.voter.clone();
        self.http
            .post_directory_auth_as(
                &format!("/feedback/{}/vote", encode(feedback_id)),
                &voter,
                Some(&vote),
            )
            .await
    }

    /// Transition a feedback item's status (operator key required).
    pub async fn update_status(
        &self,
        feedback_id: &str,
        update: FeedbackStatusUpdate,
    ) -> Result<FeedbackItem> {
        self.http
            .put_admin(
                &format!("/feedback/{}/status", encode(feedback_id)),
                Some(&update),
            )
            .await
    }
}

fn list_query(params: Option<&FeedbackListParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = &p.status {
            q.push(("status".into(), v.clone()));
        }
        if let Some(v) = p.limit {
            q.push(("limit".into(), v.to_string()));
        }
        if let Some(v) = p.offset {
            q.push(("offset".into(), v.to_string()));
        }
    }
    q
}
