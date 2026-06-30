//! Bounty platform (`/bounties`). Mirrors `sdk/typescript/src/api/bounties.ts`.
//!
//! Create + fund in one x402 flow (→ escrow), browse, submit a URL, comment for
//! free, run the autonomous council, and the admin-approved payout to the
//! council-selected winner.

use crate::error::{Error, Result};
use crate::http::HttpClient;
use crate::solana::{
    build_delegated_payment_header_from_challenge, payment_challenge,
    ChallengeDelegatedPaymentOptions, RpcRequest,
};
use crate::types::{
    Bounty, BountyComment, BountyCommentCreateRequest, BountyCommentQueryParams,
    BountyCommentsResponse, BountyCreateRequest, BountyListResponse, BountyQueryParams,
    BountySubmission, BountySubmissionCreateRequest, BountySubmissionQueryParams,
    BountySubmissionsResponse,
};
use crate::util::encode;

/// Options for funding a bounty through the delegated (gasless facilitator)
/// Solana settlement path. The fee payer and payment terms are read from the
/// 402 challenge; only the SPL transfer details and RPC transport are supplied.
pub struct SolanaBountyPaymentOptions {
    /// The agent's Solana secret key (32-byte seed or 64-byte key); signs the
    /// SPL `TransferChecked` as the transfer authority.
    pub secret_key: Vec<u8>,
    /// Token decimals (USDC/CASH = 6). Defaults to 6.
    pub decimals: Option<u8>,
    /// JSON-RPC transport for blockhash + token-account lookups. When omitted, a
    /// direct reqwest transport against `rpc_url` is used.
    pub rpc: Option<RpcRequest>,
    /// Solana RPC URL used to build the default transport when `rpc` is unset.
    pub rpc_url: Option<String>,
    /// Override the SPL mint (defaults to the challenge `asset`).
    pub mint: Option<String>,
    /// Override the payer's source token account (defaults to the agent's ATA).
    pub source_token_account: Option<String>,
    /// Override the payee's destination token account (defaults to its ATA).
    pub destination_token_account: Option<String>,
}

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

    /// Create and fund a bounty via the **standard x402 sponsored (gasless
    /// facilitator)** Solana settlement path. Mirrors the TS/Python flow: the
    /// first call (no `payment`) returns the 402 challenge, from which the
    /// facilitator fee payer (`accepts[].extra.feePayer`, surfaced on the parsed
    /// challenge as `metadata.feePayer`) and payment terms are read; this builds
    /// the payer-signed `[ComputeUnitLimit, ComputeUnitPrice, TransferChecked]`
    /// transaction (fee payer = facilitator, agent = transfer authority), wraps
    /// it in the standard x402 `PaymentPayload` envelope, and re-posts the bounty
    /// with the envelope in the `PAYMENT-SIGNATURE` header (no body `payment`
    /// map) to settle into escrow. USDC-only.
    pub async fn create_with_solana_payment(
        &self,
        request: &BountyCreateRequest,
        options: SolanaBountyPaymentOptions,
    ) -> Result<Bounty> {
        // A signer is required for the directory-auth on the funded create call.
        self.http
            .signer()
            .ok_or_else(|| Error::Signing("a signer is required for a Solana payment".into()))?;
        let creator = request.creator.as_deref().unwrap_or("");

        // First call without payment to receive the 402 challenge.
        let challenge = match self.create(request).await {
            Ok(bounty) => return Ok(bounty),
            Err(error) => payment_challenge(error)?,
        };

        // Build the standard PAYMENT-SIGNATURE header from the challenge.
        let (header_name, header_value) = build_delegated_payment_header_from_challenge(
            &challenge,
            ChallengeDelegatedPaymentOptions {
                secret_key: options.secret_key,
                decimals: options.decimals,
                rpc: options.rpc,
                rpc_url: options.rpc_url,
                mint: options.mint,
                source_token_account: options.source_token_account,
                destination_token_account: options.destination_token_account,
            },
        )
        .await?;

        // Re-post the bounty with the payment in the header and NO body
        // `payment` map.
        let mut funded = request.clone();
        funded.payment = None;
        let headers: crate::auth::Headers = vec![(header_name, header_value)];
        self.http
            .post_directory_auth_as_with_headers("/bounties", creator, Some(&funded), &headers)
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
