//! Escrow contracts: custody, delivery, disputes, and milestones. Mirrors
//! `sdk/typescript/src/api/escrow.ts`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    Escrow, EscrowCreateRequest, EscrowDispute, EscrowMilestone, EscrowQueryParams,
};
use crate::util::encode;

/// Response wrapper for [`EscrowApi::list`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EscrowListResponse {
    pub escrows: Vec<Escrow>,
}

/// Delivery proof supplied to [`EscrowApi::deliver`] / milestone delivery.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowDeliveryProof {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub actor: Option<String>,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub refs: Option<Vec<String>>,
}

/// Evidence supplied to [`EscrowApi::submit_evidence`].
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowEvidenceInput {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub actor: Option<String>,
    #[serde(rename = "type")]
    pub evidence_type: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub r#ref: Option<String>,
}

/// A single council vote supplied to [`EscrowApi::vote_arbitration`].
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscrowArbitrationVote {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub actor: Option<String>,
    pub council_member: String,
    pub vote: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub client_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub provider_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rationale: Option<String>,
}

#[derive(Clone)]
pub struct EscrowApi {
    http: HttpClient,
}

impl EscrowApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn list(&self, params: Option<&EscrowQueryParams>) -> Result<EscrowListResponse> {
        let q = escrow_query(params);
        self.http.get_auth("/escrow", &q).await
    }

    pub async fn create(&self, request: &EscrowCreateRequest) -> Result<Escrow> {
        self.http
            .post_directory_auth_as("/escrow", &request.client, Some(request))
            .await
    }

    pub async fn get(&self, escrow_id: &str) -> Result<Escrow> {
        self.http
            .get_auth(&format!("/escrow/{}", encode(escrow_id)), &[])
            .await
    }

    pub async fn accept(&self, escrow_id: &str, actor: Option<&str>) -> Result<Escrow> {
        self.post_escrow_actor(
            &format!("/escrow/{}/accept", encode(escrow_id)),
            actor,
            None,
        )
        .await
    }

    pub async fn deliver(&self, escrow_id: &str, proof: &EscrowDeliveryProof) -> Result<Escrow> {
        self.post_escrow_actor(
            &format!("/escrow/{}/deliver", encode(escrow_id)),
            proof.actor.as_deref(),
            Some(to_object(proof)?),
        )
        .await
    }

    pub async fn accept_delivery(
        &self,
        escrow_id: &str,
        actor: Option<&str>,
        on_chain_tx: Option<&str>,
    ) -> Result<Escrow> {
        self.post_escrow_actor(
            &format!("/escrow/{}/accept-delivery", encode(escrow_id)),
            actor,
            on_chain_tx_body(on_chain_tx),
        )
        .await
    }

    pub async fn claim_release(
        &self,
        escrow_id: &str,
        actor: Option<&str>,
        on_chain_tx: Option<&str>,
    ) -> Result<Escrow> {
        self.post_escrow_actor(
            &format!("/escrow/{}/claim-release", encode(escrow_id)),
            actor,
            on_chain_tx_body(on_chain_tx),
        )
        .await
    }

    pub async fn claim_refund(
        &self,
        escrow_id: &str,
        actor: Option<&str>,
        on_chain_tx: Option<&str>,
    ) -> Result<Escrow> {
        self.post_escrow_actor(
            &format!("/escrow/{}/claim-refund", encode(escrow_id)),
            actor,
            on_chain_tx_body(on_chain_tx),
        )
        .await
    }

    pub async fn request_revision(
        &self,
        escrow_id: &str,
        reason: &str,
        actor: Option<&str>,
    ) -> Result<Escrow> {
        self.post_escrow_actor(
            &format!("/escrow/{}/request-revision", encode(escrow_id)),
            actor,
            Some(actor_reason_body(actor, reason)),
        )
        .await
    }

    pub async fn cancel(
        &self,
        escrow_id: &str,
        actor: Option<&str>,
        on_chain_tx: Option<&str>,
    ) -> Result<Escrow> {
        self.post_escrow_actor(
            &format!("/escrow/{}/cancel", encode(escrow_id)),
            actor,
            on_chain_tx_body(on_chain_tx),
        )
        .await
    }

    pub async fn extend_deadline(
        &self,
        escrow_id: &str,
        new_deadline: &str,
        actor: Option<&str>,
    ) -> Result<Escrow> {
        let mut body = Map::new();
        body.insert("actor".to_string(), actor_value(actor));
        body.insert("deadline".to_string(), json!(new_deadline));
        self.post_escrow_actor(
            &format!("/escrow/{}/extend-deadline", encode(escrow_id)),
            actor,
            Some(body),
        )
        .await
    }

    pub async fn approve_extension(&self, escrow_id: &str, actor: Option<&str>) -> Result<Escrow> {
        self.post_escrow_actor(
            &format!("/escrow/{}/approve-extension", encode(escrow_id)),
            actor,
            None,
        )
        .await
    }

    // --- Disputes ---

    pub async fn open_dispute(
        &self,
        escrow_id: &str,
        reason: &str,
        actor: Option<&str>,
    ) -> Result<EscrowDispute> {
        self.post_escrow_actor(
            &format!("/escrow/{}/dispute", encode(escrow_id)),
            actor,
            Some(actor_reason_body(actor, reason)),
        )
        .await
    }

    pub async fn get_dispute(&self, escrow_id: &str) -> Result<EscrowDispute> {
        self.http
            .get_auth(&format!("/escrow/{}/dispute", encode(escrow_id)), &[])
            .await
    }

    pub async fn submit_evidence(
        &self,
        escrow_id: &str,
        evidence: &EscrowEvidenceInput,
    ) -> Result<()> {
        self.post_escrow_actor(
            &format!("/escrow/{}/dispute/evidence", encode(escrow_id)),
            evidence.actor.as_deref(),
            Some(to_object(evidence)?),
        )
        .await
    }

    pub async fn accept_mediation(
        &self,
        escrow_id: &str,
        actor: Option<&str>,
    ) -> Result<EscrowDispute> {
        self.post_escrow_actor(
            &format!("/escrow/{}/dispute/accept-mediation", encode(escrow_id)),
            actor,
            None,
        )
        .await
    }

    pub async fn reject_mediation(
        &self,
        escrow_id: &str,
        actor: Option<&str>,
    ) -> Result<EscrowDispute> {
        self.post_escrow_actor(
            &format!("/escrow/{}/dispute/reject-mediation", encode(escrow_id)),
            actor,
            None,
        )
        .await
    }

    pub async fn pay_arbitration(
        &self,
        escrow_id: &str,
        on_chain_tx: &str,
        actor: Option<&str>,
    ) -> Result<EscrowDispute> {
        let mut body = Map::new();
        body.insert("actor".to_string(), actor_value(actor));
        body.insert("onChainTx".to_string(), json!(on_chain_tx));
        self.post_escrow_actor(
            &format!("/escrow/{}/dispute/pay-arbitration", encode(escrow_id)),
            actor,
            Some(body),
        )
        .await
    }

    pub async fn vote_arbitration(
        &self,
        escrow_id: &str,
        vote: &EscrowArbitrationVote,
    ) -> Result<()> {
        // `vote.actor ?? vote.councilMember` selects the directory actor.
        let actor = vote
            .actor
            .as_deref()
            .unwrap_or(vote.council_member.as_str());
        self.post_escrow_actor(
            &format!("/escrow/{}/dispute/vote", encode(escrow_id)),
            Some(actor),
            Some(to_object(vote)?),
        )
        .await
    }

    // --- Milestones ---

    pub async fn deliver_milestone(
        &self,
        escrow_id: &str,
        milestone_id: &str,
        proof: &EscrowDeliveryProof,
    ) -> Result<EscrowMilestone> {
        self.post_escrow_actor(
            &format!(
                "/escrow/{}/milestones/{}/deliver",
                encode(escrow_id),
                encode(milestone_id)
            ),
            proof.actor.as_deref(),
            Some(to_object(proof)?),
        )
        .await
    }

    pub async fn accept_milestone_delivery(
        &self,
        escrow_id: &str,
        milestone_id: &str,
        actor: Option<&str>,
        on_chain_tx: Option<&str>,
    ) -> Result<EscrowMilestone> {
        self.post_escrow_actor(
            &format!(
                "/escrow/{}/milestones/{}/accept-delivery",
                encode(escrow_id),
                encode(milestone_id)
            ),
            actor,
            on_chain_tx_body(on_chain_tx),
        )
        .await
    }

    pub async fn request_milestone_revision(
        &self,
        escrow_id: &str,
        milestone_id: &str,
        reason: &str,
        actor: Option<&str>,
    ) -> Result<EscrowMilestone> {
        self.post_escrow_actor(
            &format!(
                "/escrow/{}/milestones/{}/request-revision",
                encode(escrow_id),
                encode(milestone_id)
            ),
            actor,
            Some(actor_reason_body(actor, reason)),
        )
        .await
    }

    pub async fn dispute_milestone(
        &self,
        escrow_id: &str,
        milestone_id: &str,
        reason: &str,
        actor: Option<&str>,
    ) -> Result<EscrowDispute> {
        self.post_escrow_actor(
            &format!(
                "/escrow/{}/milestones/{}/dispute",
                encode(escrow_id),
                encode(milestone_id)
            ),
            actor,
            Some(actor_reason_body(actor, reason)),
        )
        .await
    }

    /// Mirror of the private TS `postEscrowActor`. When an `actor` is supplied,
    /// POST as that directory actor with `actor` folded into the body; otherwise
    /// POST with the agent signer.
    async fn post_escrow_actor<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        actor: Option<&str>,
        body: Option<Map<String, Value>>,
    ) -> Result<T> {
        match actor {
            Some(actor) => {
                let mut object = body.unwrap_or_default();
                object.insert("actor".to_string(), json!(actor));
                self.http
                    .post_directory_auth_as(path, actor, Some(&Value::Object(object)))
                    .await
            }
            None => match body {
                Some(mut object) => {
                    // TS leaves `actor: undefined` in the literal, but
                    // JSON.stringify drops it. The body is signed, so mirror
                    // that by removing a null `actor` before sending.
                    if object.get("actor") == Some(&Value::Null) {
                        object.remove("actor");
                    }
                    self.http.post(path, Some(&Value::Object(object))).await
                }
                None => self.http.post(path, None::<&Value>).await,
            },
        }
    }

    /// Stream an escrow over WebSocket. Signed with directory auth when an
    /// `agent_id` is supplied.
    pub fn stream(
        &self,
        escrow_id: &str,
        agent_id: Option<&str>,
    ) -> crate::websocket::TinyPlaceWebSocket {
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(agent_id) = agent_id {
            query.push(("X-Agent-ID", agent_id.to_string()));
        }
        let path = format!("/escrow/{}/stream", crate::util::encode(escrow_id));
        self.http.websocket(
            &crate::util::append_query(&path, &query),
            agent_id.is_some(),
        )
    }
}

fn escrow_query(params: Option<&EscrowQueryParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    if let Some(p) = params {
        if let Some(v) = &p.client {
            q.push(("client".into(), v.clone()));
        }
        if let Some(v) = &p.provider {
            q.push(("provider".into(), v.clone()));
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

fn actor_value(actor: Option<&str>) -> Value {
    match actor {
        Some(actor) => json!(actor),
        None => Value::Null,
    }
}

/// `{ actor, reason }` body, matching the TS object literals.
fn actor_reason_body(actor: Option<&str>, reason: &str) -> Map<String, Value> {
    let mut body = Map::new();
    body.insert("actor".to_string(), actor_value(actor));
    body.insert("reason".to_string(), json!(reason));
    body
}

/// `onChainTx ? { onChainTx } : undefined`.
fn on_chain_tx_body(on_chain_tx: Option<&str>) -> Option<Map<String, Value>> {
    on_chain_tx.map(|tx| {
        let mut body = Map::new();
        body.insert("onChainTx".to_string(), json!(tx));
        body
    })
}

fn to_object<T: Serialize>(value: &T) -> Result<Map<String, Value>> {
    match serde_json::to_value(value)? {
        Value::Object(map) => Ok(map),
        other => {
            let mut map = Map::new();
            map.insert("value".to_string(), other);
            Ok(map)
        }
    }
}
