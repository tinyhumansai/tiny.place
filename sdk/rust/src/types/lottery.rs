#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

/// Lifecycle state of a lottery round. Exactly one round is `open` at a time.
pub type LotteryRoundStatus = String;

/// Binds a round to its on-chain escrow vault and settlement program.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotteryEscrow {
    #[serde(default)]
    pub vault: String,
    #[serde(default)]
    pub contract: String,
}

/// One drawn winner of a settled round: `rank` 1 = first drawn = largest prize.
/// Amounts are USDC base-unit strings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotteryWinner {
    #[serde(default)]
    pub rank: i64,
    #[serde(default)]
    pub owner: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub crypto_id: Option<String>,
    #[serde(default)]
    pub tickets: i64,
    #[serde(default)]
    pub payout_micros: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tx_hash: Option<String>,
}

/// A snapshot of one owner's ticket count in a round.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotteryHolding {
    #[serde(default)]
    pub owner: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub crypto_id: Option<String>,
    #[serde(default)]
    pub tickets: i64,
}

/// Canonical record of a single 24h pooled pot. Amounts are USDC base-unit
/// strings (6 decimals). `secret`, `holdings`, and `winners` are populated only
/// once the round is settled.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotteryRound {
    #[serde(default)]
    pub round_id: String,
    #[serde(default)]
    pub status: LotteryRoundStatus,
    #[serde(default)]
    pub ticket_price_micros: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub network: String,
    pub escrow: LotteryEscrow,
    #[serde(default)]
    pub fee_bps: i64,
    #[serde(default)]
    pub decay_bps: i64,
    #[serde(default)]
    pub winner_fraction_bps: i64,
    #[serde(default)]
    pub max_winners: i64,
    #[serde(default)]
    pub min_participants: i64,
    #[serde(default)]
    pub pot_micros: String,
    #[serde(default)]
    pub ticket_count: i64,
    #[serde(default)]
    pub participant_count: i64,
    #[serde(default)]
    pub seed_commit: String,
    #[serde(default)]
    pub opened_at: String,
    #[serde(default)]
    pub cutoff_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub settled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub secret: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub holdings: Option<Vec<LotteryHolding>>,
    #[serde(default)]
    pub winners: Vec<LotteryWinner>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rake_micros: Option<String>,
    #[serde(default)]
    pub settlement_tx_hashes: Vec<String>,
    #[serde(default)]
    pub updated_at: String,
}

/// The `GET /lottery` response: the current open round plus the caller's
/// holdings in it (when an `X-Agent-ID` is supplied).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotteryView {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub round: Option<LotteryRound>,
    #[serde(default)]
    pub holdings: i64,
}

/// Filters for a paged listing of past rounds (`GET /lottery/rounds`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotteryRoundQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<LotteryRoundStatus>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

/// Wrapper for the `GET /lottery/rounds` listing response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotteryRoundsResponse {
    #[serde(default)]
    pub rounds: Vec<LotteryRound>,
}

/// Body of `POST /lottery/buy`. `amountMicros` must be a whole multiple of the
/// round's ticket price. `payment` carries the x402 authorization on the retried
/// paid request; `paymentAuthorization` is retained only for older callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotteryBuyRequest {
    #[serde(default)]
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub crypto_id: Option<String>,
    #[serde(default)]
    pub amount_micros: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_authorization: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<crate::types::CommercePaymentPayload>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tx_hash: Option<String>,
}

/// Response to a settled `POST /lottery/buy`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotteryBuyResponse {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub round: Option<LotteryRound>,
    #[serde(default)]
    pub tickets: i64,
    #[serde(default)]
    pub holdings: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tx_hash: Option<String>,
}

/// Body of `POST /lottery/rounds/{roundId}/draw`, an operator-only action.
/// `operator` defaults server-side from the `X-Agent-ID` header.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotteryDrawRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub operator: Option<String>,
}
