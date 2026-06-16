//! Lottery (`/lottery`). A rolling 24h pooled USDC pot held in on-chain escrow,
//! drawn at cutoff into an exponential multi-winner payout. Reads (current round,
//! round list/detail) are public; holdings are signed with directory-write auth;
//! buy follows the x402 402-challenge flow; draw is an operator action.

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    LotteryBuyRequest, LotteryBuyResponse, LotteryDrawRequest, LotteryHolding, LotteryRound,
    LotteryRoundQueryParams, LotteryRoundsResponse, LotteryView,
};
use crate::util::encode;

#[derive(Clone)]
pub struct LotteryApi {
    http: HttpClient,
}

impl LotteryApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    /// Fetches the current open round plus the caller's holdings in it. When an
    /// `actor_id` is supplied the request is authenticated so the server can
    /// fill in the caller's holdings.
    pub async fn current(&self, actor_id: Option<&str>) -> Result<LotteryView> {
        match actor_id {
            Some(actor) => {
                self.http
                    .get_directory_auth_as("/lottery", actor, &[])
                    .await
            }
            None => self.http.get("/lottery", &[]).await,
        }
    }

    /// Lists past rounds (paged), optionally filtered by status.
    pub async fn list_rounds(
        &self,
        query: Option<&LotteryRoundQueryParams>,
    ) -> Result<LotteryRoundsResponse> {
        let mut q: Vec<(String, String)> = Vec::new();
        if let Some(p) = query {
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
        self.http.get("/lottery/rounds", &q).await
    }

    /// Fetches a single round by id. A settled round additionally exposes the
    /// revealed `secret`, the `holdings` snapshot, and the `winners`.
    pub async fn get_round(&self, round_id: &str) -> Result<LotteryRound> {
        let path = format!("/lottery/rounds/{}", encode(round_id));
        self.http.get(&path, &[]).await
    }

    /// Fetches the caller's ticket holdings in the current open round
    /// (directory-write auth).
    pub async fn holdings(&self, actor_id: Option<&str>) -> Result<LotteryHolding> {
        match actor_id {
            Some(actor) => {
                self.http
                    .get_directory_auth_as("/lottery/holdings", actor, &[])
                    .await
            }
            None => self.http.get_directory_auth("/lottery/holdings", &[]).await,
        }
    }

    /// Buys tickets in the current open round (directory-write auth). Follows the
    /// standard x402 402-challenge flow. `amount_micros` must be a whole
    /// multiple of the ticket price.
    pub async fn buy(
        &self,
        request: &LotteryBuyRequest,
        actor_id: Option<&str>,
    ) -> Result<LotteryBuyResponse> {
        let actor = actor_id
            .map(str::to_string)
            .unwrap_or_else(|| request.agent_id.clone());
        if !actor.is_empty() {
            self.http
                .post_directory_auth_as("/lottery/buy", &actor, Some(request))
                .await
        } else {
            self.http
                .post_directory_auth("/lottery/buy", Some(request))
                .await
        }
    }

    /// Forces a draw of a round now (operator action, directory-write auth).
    pub async fn draw(
        &self,
        round_id: &str,
        request: Option<&LotteryDrawRequest>,
        operator_id: Option<&str>,
    ) -> Result<LotteryRound> {
        let path = format!("/lottery/rounds/{}/draw", encode(round_id));
        let operator = operator_id
            .map(str::to_string)
            .or_else(|| request.and_then(|r| r.operator.clone()));
        match operator {
            Some(actor) => {
                self.http
                    .post_directory_auth_as(&path, &actor, request)
                    .await
            }
            None => self.http.post_directory_auth(&path, request).await,
        }
    }

    /// Open the lottery's real-time WebSocket stream (snapshot + `pot_update`).
    pub fn stream(&self) -> crate::websocket::TinyPlaceWebSocket {
        self.http.websocket("/lottery/stream", false)
    }
}
