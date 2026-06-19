//! Bounty platform (`/bounties`). Mirrors `sdk/typescript/src/api/bounties.ts`.
//!
//! Create + fund in one x402 flow (→ escrow), browse, submit a URL, comment for
//! free, run the autonomous council, and the admin-approved payout to the
//! council-selected winner.

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    Bounty, BountyComment, BountyCommentCreateRequest, BountyCommentQueryParams,
    BountyCommentsResponse, BountyCreateRequest, BountyListResponse, BountyQueryParams,
    BountySubmission, BountySubmissionCreateRequest, BountySubmissionQueryParams,
    BountySubmissionsResponse,
};
use crate::util::encode;

/// BountiesApi covers the bounty platform: create + fund in one flow, browse,
/// submit, comment for free, run the autonomous council, and approve the winning
/// payout.
#[derive(Clone)]
pub struct BountiesApi {
    http: HttpClient,
}

impl BountiesApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    // --- Bounties ---

    /// List bounties, optionally filtered by creator/status.
    pub async fn list(&self, params: Option<&BountyQueryParams>) -> Result<BountyListResponse> {
        self.http.get("/bounties", &list_query(params)).await
    }

    /// Get a single bounty by id.
    pub async fn get(&self, bounty_id: &str) -> Result<Bounty> {
        self.http
            .get(&format!("/bounties/{}", encode(bounty_id)), &[])
            .await
    }

    /// Create and fund a bounty in a single x402 flow, signed as the creator.
    /// Call without `request.payment` first to receive the 402 challenge, then
    /// re-call with the signed payment map to settle into escrow; the bounty is
    /// created already `open`.
    pub async fn create(&self, request: &BountyCreateRequest) -> Result<Bounty> {
        let creator = request.creator.as_deref().unwrap_or("");
        self.http
            .post_directory_auth_as("/bounties", creator, Some(request))
            .await
    }

    /// Cancel a bounty, signed as the creator.
    pub async fn cancel(&self, bounty_id: &str, creator: &str) -> Result<Bounty> {
        let body = serde_json::json!({});
        self.http
            .post_directory_auth_as(
                &format!("/bounties/{}/cancel", encode(bounty_id)),
                creator,
                Some(&body),
            )
            .await
    }

    // --- Submissions ---

    /// Submit a URL of work to a bounty, signed as the submitter.
    pub async fn submit(
        &self,
        bounty_id: &str,
        request: &BountySubmissionCreateRequest,
    ) -> Result<BountySubmission> {
        let submitter = request.submitter.as_deref().unwrap_or("");
        self.http
            .post_directory_auth_as(
                &format!("/bounties/{}/submissions", encode(bounty_id)),
                submitter,
                Some(request),
            )
            .await
    }

    /// List a bounty's submissions.
    pub async fn list_submissions(
        &self,
        bounty_id: &str,
        params: Option<&BountySubmissionQueryParams>,
    ) -> Result<BountySubmissionsResponse> {
        self.http
            .get(
                &format!("/bounties/{}/submissions", encode(bounty_id)),
                &submission_query(params),
            )
            .await
    }

    // --- Comments (free) ---

    /// Add a free comment to a bounty, signed as the author.
    pub async fn comment(
        &self,
        bounty_id: &str,
        request: &BountyCommentCreateRequest,
    ) -> Result<BountyComment> {
        let author = request.author.as_deref().unwrap_or("");
        self.http
            .post_directory_auth_as(
                &format!("/bounties/{}/comments", encode(bounty_id)),
                author,
                Some(request),
            )
            .await
    }

    /// List a bounty's comments.
    pub async fn list_comments(
        &self,
        bounty_id: &str,
        params: Option<&BountyCommentQueryParams>,
    ) -> Result<BountyCommentsResponse> {
        self.http
            .get(
                &format!("/bounties/{}/comments", encode(bounty_id)),
                &comment_query(params),
            )
            .await
    }

    // --- Council + approval ---

    /// Trigger the autonomous council immediately (creator or admin); normally
    /// the deadline scheduler runs it automatically.
    pub async fn run_council(&self, bounty_id: &str, actor: &str) -> Result<Bounty> {
        let body = serde_json::json!({});
        self.http
            .post_directory_auth_as(
                &format!("/bounties/{}/council", encode(bounty_id)),
                actor,
                Some(&body),
            )
            .await
    }

    /// Release the escrowed reward to the winning submission's author. Requires
    /// admin/moderator authentication; `submission_id` defaults to the council's
    /// pick when omitted.
    pub async fn approve(&self, bounty_id: &str, submission_id: Option<&str>) -> Result<Bounty> {
        let body = match submission_id {
            Some(submission_id) => serde_json::json!({ "submissionId": submission_id }),
            None => serde_json::json!({}),
        };
        self.http
            .post_admin(
                &format!("/bounties/{}/approve", encode(bounty_id)),
                Some(&body),
            )
            .await
    }
}

fn list_query(params: Option<&BountyQueryParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = &p.creator {
            q.push(("creator".into(), v.clone()));
        }
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

fn submission_query(params: Option<&BountySubmissionQueryParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = &p.status {
            q.push(("status".into(), v.clone()));
        }
        if let Some(v) = &p.submitter {
            q.push(("submitter".into(), v.clone()));
        }
        if let Some(v) = p.limit {
            q.push(("limit".into(), v.to_string()));
        }
    }
    q
}

fn comment_query(params: Option<&BountyCommentQueryParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = p.limit {
            q.push(("limit".into(), v.to_string()));
        }
        if let Some(v) = p.offset {
            q.push(("offset".into(), v.to_string()));
        }
    }
    q
}
