//! Reputation, attestations, vouches, trust graph, and leaderboards.

use crate::auth::sign_canonical_payload;
use crate::crypto::canonical_payload;
use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    Attestation, AttestationCreate, GameLeaderboardQueryParams, GroupLeaderboardQueryParams,
    LeaderboardCategory, LeaderboardQueryParams, LeaderboardResponse, ReputationHistoryPoint,
    ReputationLeaderboardQueryParams, ReputationReview, ReputationReviewCreate, ReputationScore,
    ReputationVouch, ReputationVouchCreate, SellerLeaderboardQueryParams, TrustGraph,
    TrustGraphQueryParams, TrustScore,
};
use crate::util::encode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReputationHistoryResponse {
    pub history: Vec<ReputationHistoryPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReputationReviewsResponse {
    pub reviews: Vec<ReputationReview>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationsResponse {
    pub attestations: Vec<Attestation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VouchesResponse {
    pub vouches: Vec<ReputationVouch>,
}

#[derive(Clone)]
pub struct ReputationApi {
    http: HttpClient,
}

impl ReputationApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn get_score(&self, agent_id: &str) -> Result<ReputationScore> {
        let path = format!("/reputation/{}", encode(agent_id));
        self.http.get(&path, &[]).await
    }

    pub async fn get_history(&self, agent_id: &str) -> Result<ReputationHistoryResponse> {
        let path = format!("/reputation/{}/history", encode(agent_id));
        self.http.get(&path, &[]).await
    }

    pub async fn get_reviews(&self, agent_id: &str) -> Result<ReputationReviewsResponse> {
        let path = format!("/reputation/{}/reviews", encode(agent_id));
        self.http.get(&path, &[]).await
    }

    pub async fn get_attestations(&self, agent_id: &str) -> Result<AttestationsResponse> {
        let path = format!("/reputation/{}/attestations", encode(agent_id));
        self.http.get(&path, &[]).await
    }

    pub async fn create_review(&self, review: &ReputationReviewCreate) -> Result<ReputationReview> {
        let mut review = review.clone();
        if let Some(signer) = self.http.signer() {
            if review.signature.is_none() {
                if review.review_id.is_none() {
                    review.review_id = Some(next_reputation_id("rev"));
                }
                let payload = review_signature_payload(&review);
                review.signature = Some(sign_canonical_payload(signer.as_ref(), &payload).await?);
                if review.signer_public_key.is_none() {
                    review.signer_public_key = self.http.signing_public_key();
                }
            }
        }
        self.http.post("/reputation/reviews", Some(&review)).await
    }

    pub async fn create_attestation(&self, attestation: &AttestationCreate) -> Result<Attestation> {
        let mut attestation = attestation.clone();
        if let Some(signer) = self.http.signer() {
            if attestation.signature.is_none() {
                if attestation.attestation_id.is_none() {
                    attestation.attestation_id = Some(next_reputation_id("att"));
                }
                let payload = attestation_signature_payload(&attestation);
                attestation.signature =
                    Some(sign_canonical_payload(signer.as_ref(), &payload).await?);
                if attestation.signer_public_key.is_none() {
                    attestation.signer_public_key = self.http.signing_public_key();
                }
            }
        }
        self.http
            .post("/reputation/attestations", Some(&attestation))
            .await
    }

    pub async fn delete_attestation(&self, attestation_id: &str) -> Result<()> {
        match self.http.signer() {
            None => {
                let path = format!("/reputation/attestations/{}", encode(attestation_id));
                self.http.delete::<(), serde_json::Value>(&path, None).await
            }
            Some(signer) => {
                let payload = attestation_revoke_signature_payload(attestation_id);
                let signature = sign_canonical_payload(signer.as_ref(), &payload).await?;
                let path = format!(
                    "/reputation/attestations/{}?signature={}{}",
                    encode(attestation_id),
                    encode(&signature),
                    signer_public_key_query(self.http.signing_public_key())
                );
                self.http.delete::<(), serde_json::Value>(&path, None).await
            }
        }
    }

    pub async fn trust_graph(&self, params: Option<&TrustGraphQueryParams>) -> Result<TrustGraph> {
        let mut q: Vec<(String, String)> = Vec::new();
        if let Some(p) = params {
            if let Some(v) = p.limit {
                q.push(("limit".into(), v.to_string()));
            }
        }
        self.http.get("/reputation/trust/graph", &q).await
    }

    pub async fn get_trust(&self, agent_id: &str) -> Result<TrustScore> {
        let path = format!("/reputation/{}/trust", encode(agent_id));
        self.http.get(&path, &[]).await
    }

    pub async fn get_vouches(&self, agent_id: &str) -> Result<VouchesResponse> {
        let path = format!("/reputation/{}/vouches", encode(agent_id));
        self.http.get(&path, &[]).await
    }

    pub async fn get_given_vouches(&self, agent_id: &str) -> Result<VouchesResponse> {
        let path = format!("/reputation/{}/vouches/given", encode(agent_id));
        self.http.get(&path, &[]).await
    }

    pub async fn create_vouch(&self, vouch: &ReputationVouchCreate) -> Result<ReputationVouch> {
        let mut vouch = vouch.clone();
        if let Some(signer) = self.http.signer() {
            if vouch.signature.is_none() {
                if vouch.vouch_id.is_none() {
                    vouch.vouch_id = Some(next_reputation_id("vouch"));
                }
                let payload = vouch_signature_payload(&vouch);
                vouch.signature = Some(sign_canonical_payload(signer.as_ref(), &payload).await?);
                if vouch.signer_public_key.is_none() {
                    vouch.signer_public_key = self.http.signing_public_key();
                }
            }
        }
        self.http.post("/reputation/vouches", Some(&vouch)).await
    }

    pub async fn delete_vouch(&self, vouch_id: &str) -> Result<()> {
        match self.http.signer() {
            None => {
                let path = format!("/reputation/vouches/{}", encode(vouch_id));
                self.http.delete::<(), serde_json::Value>(&path, None).await
            }
            Some(signer) => {
                let payload = vouch_revoke_signature_payload(vouch_id);
                let signature = sign_canonical_payload(signer.as_ref(), &payload).await?;
                let path = format!(
                    "/reputation/vouches/{}?signature={}{}",
                    encode(vouch_id),
                    encode(&signature),
                    signer_public_key_query(self.http.signing_public_key())
                );
                self.http.delete::<(), serde_json::Value>(&path, None).await
            }
        }
    }

    /// Fetches a leaderboard, defaulting to the reputation board.
    pub async fn leaderboard(
        &self,
        category: Option<&LeaderboardCategory>,
        params: Option<&LeaderboardQueryParams>,
    ) -> Result<LeaderboardResponse> {
        let path = match category {
            Some(c) => format!("/leaderboards/{}", encode(c)),
            None => "/leaderboards/reputation".to_string(),
        };
        self.http.get(&path, &leaderboard_query(params)).await
    }

    pub async fn reputation_leaderboard(
        &self,
        params: Option<&ReputationLeaderboardQueryParams>,
    ) -> Result<LeaderboardResponse> {
        let mut q: Vec<(String, String)> = Vec::new();
        if let Some(p) = params {
            if let Some(v) = p.limit {
                q.push(("limit".into(), v.to_string()));
            }
            if let Some(v) = p.offset {
                q.push(("offset".into(), v.to_string()));
            }
            if let Some(v) = &p.period {
                q.push(("period".into(), v.clone()));
            }
            if let Some(v) = &p.category {
                q.push(("category".into(), v.clone()));
            }
        }
        self.http.get("/reputation/leaderboard", &q).await
    }

    pub async fn rising_leaderboard(
        &self,
        params: Option<&LeaderboardQueryParams>,
    ) -> Result<LeaderboardResponse> {
        self.http
            .get("/leaderboards/rising", &leaderboard_query(params))
            .await
    }

    pub async fn sellers_leaderboard(
        &self,
        params: Option<&SellerLeaderboardQueryParams>,
    ) -> Result<LeaderboardResponse> {
        let mut q: Vec<(String, String)> = Vec::new();
        if let Some(p) = params {
            if let Some(v) = p.limit {
                q.push(("limit".into(), v.to_string()));
            }
            if let Some(v) = p.offset {
                q.push(("offset".into(), v.to_string()));
            }
            if let Some(v) = &p.period {
                q.push(("period".into(), v.clone()));
            }
            if let Some(v) = &p.category {
                q.push(("category".into(), v.clone()));
            }
            if let Some(v) = &p.sort {
                q.push(("sort".into(), v.clone()));
            }
        }
        self.http.get("/leaderboards/sellers", &q).await
    }

    pub async fn games_leaderboard(
        &self,
        params: Option<&GameLeaderboardQueryParams>,
    ) -> Result<LeaderboardResponse> {
        let mut q: Vec<(String, String)> = Vec::new();
        if let Some(p) = params {
            if let Some(v) = p.limit {
                q.push(("limit".into(), v.to_string()));
            }
            if let Some(v) = p.offset {
                q.push(("offset".into(), v.to_string()));
            }
            if let Some(v) = &p.period {
                q.push(("period".into(), v.clone()));
            }
            if let Some(v) = &p.sort {
                q.push(("sort".into(), v.clone()));
            }
        }
        self.http.get("/leaderboards/games", &q).await
    }

    pub async fn groups_leaderboard(
        &self,
        params: Option<&GroupLeaderboardQueryParams>,
    ) -> Result<LeaderboardResponse> {
        let mut q: Vec<(String, String)> = Vec::new();
        if let Some(p) = params {
            if let Some(v) = p.limit {
                q.push(("limit".into(), v.to_string()));
            }
            if let Some(v) = p.offset {
                q.push(("offset".into(), v.to_string()));
            }
            if let Some(v) = &p.period {
                q.push(("period".into(), v.clone()));
            }
            if let Some(v) = &p.sort {
                q.push(("sort".into(), v.clone()));
            }
        }
        self.http.get("/leaderboards/groups", &q).await
    }

    pub async fn messages_leaderboard(
        &self,
        params: Option<&LeaderboardQueryParams>,
    ) -> Result<LeaderboardResponse> {
        self.http
            .get("/leaderboards/messages", &leaderboard_query(params))
            .await
    }

    pub async fn volume_leaderboard(
        &self,
        params: Option<&LeaderboardQueryParams>,
    ) -> Result<LeaderboardResponse> {
        self.http
            .get("/leaderboards/volume", &leaderboard_query(params))
            .await
    }
}

fn leaderboard_query(params: Option<&LeaderboardQueryParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = p.limit {
            q.push(("limit".into(), v.to_string()));
        }
        if let Some(v) = p.offset {
            q.push(("offset".into(), v.to_string()));
        }
        if let Some(v) = &p.period {
            q.push(("period".into(), v.clone()));
        }
    }
    q
}

fn review_signature_payload(review: &ReputationReviewCreate) -> String {
    canonical_payload(
        "reputation.review",
        serde_json::json!({
            "comment": review.comment.clone().unwrap_or_default(),
            "context": review.context.clone().unwrap_or_default(),
            "rating": review.rating,
            "reviewer": review.reviewer,
            "subject": review.subject,
            "transactionRef": review.transaction_ref,
        }),
    )
}

fn vouch_signature_payload(vouch: &ReputationVouchCreate) -> String {
    canonical_payload(
        "reputation.vouch",
        serde_json::json!({
            "comment": vouch.comment.clone().unwrap_or_default(),
            "context": vouch.context.clone().unwrap_or_default(),
            "subject": vouch.subject,
            "vouchId": vouch.vouch_id.clone().unwrap_or_default(),
            "voucher": vouch.voucher,
            "weight": vouch.weight,
        }),
    )
}

fn vouch_revoke_signature_payload(vouch_id: &str) -> String {
    canonical_payload(
        "reputation.vouch.revoke",
        serde_json::json!({ "vouchId": vouch_id }),
    )
}

fn attestation_signature_payload(attestation: &AttestationCreate) -> String {
    canonical_payload(
        "reputation.attestation",
        serde_json::json!({
            "agent": attestation.agent,
            "agentCryptoId": attestation.agent_crypto_id,
            "handle": attestation.handle,
            "platform": attestation.platform,
            "proofUrl": attestation.proof_url.clone().unwrap_or_default(),
        }),
    )
}

fn attestation_revoke_signature_payload(attestation_id: &str) -> String {
    canonical_payload(
        "reputation.attestation.revoke",
        serde_json::json!({ "attestationId": attestation_id }),
    )
}

// Builds the optional &signerPublicKey= query suffix for body-less revoke
// requests, presenting the signing key. Empty when there is no presented key.
fn signer_public_key_query(signer_public_key: Option<String>) -> String {
    match signer_public_key {
        Some(key) => format!("&signerPublicKey={}", encode(&key)),
        None => String::new(),
    }
}

fn next_reputation_id(prefix: &str) -> String {
    use rand::RngCore as _;
    let mut random = [0u8; 6];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let suffix: String = random.iter().map(|b| format!("{b:02x}")).collect();
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{prefix}_{}_{suffix}", radix36(now_ms))
}

fn radix36(mut value: u128) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if value == 0 {
        return "0".to_string();
    }
    let mut out = Vec::new();
    while value > 0 {
        out.push(DIGITS[(value % 36) as usize]);
        value /= 36;
    }
    out.reverse();
    String::from_utf8(out).expect("ascii digits")
}
