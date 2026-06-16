//! Endpoint tests for the remaining API namespaces: rooms, lottery, reputation,
//! explorer, admin, moderation, stats, and artifacts. Each test points the
//! client at a catch-all mock, invokes one public method, and asserts the
//! request method + path. Response bodies are permissive — the goal is to
//! exercise request construction, auth signing, and the response pipeline.

mod common;

use common::*;
use serde_json::json;

use tinyplace::api::admin::{AuditQueryParams, SuspendAgentParams};
use tinyplace::api::explorer::ExplorerTransactionQueryParams;
use tinyplace::api::moderation::{
    ModerationActionsQueryParams, ModerationAppealCreate, ModerationStatusUpdate,
};
use tinyplace::types::{
    ArtifactCreateRequest, ArtifactQueryParams, ArtifactRecipientUpdate, AttestationCreate,
    FeeConfig, FeeResolveParams, FeedbackCreate, FeedbackListParams, FeedbackStatusUpdate,
    FeedbackVoteRequest, GameActionRequest, GameEmergencyWithdrawalRequest, GameJoinRequest,
    GameLeaveRequest, GameOperatorRequest, GameRoom, GameRoomQueryParams, GameSettleRequest,
    LeaderboardQueryParams, LotteryBuyRequest, LotteryDrawRequest, LotteryRoundQueryParams,
    ModerationAction, ModerationReportCreate, ReputationReviewCreate, ReputationVouchCreate,
    TrustGraphQueryParams,
};

// --- RoomsApi ---

#[tokio::test]
async fn rooms_list() {
    let server = any_ok(json!({"rooms": []})).await;
    let client = client_for(&server);
    let _ = client
        .rooms
        .list(Some(&GameRoomQueryParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/rooms"));
}

#[tokio::test]
async fn rooms_create() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let room: GameRoom = serde_json::from_value(json!({
        "roomId": "r1",
        "game": "poker",
        "variant": "nlhe",
        "name": "Table 1",
        "creator": "@alice",
        "stakes": {"smallBlind": "1", "bigBlind": "2", "asset": "USDC", "network": "solana"},
        "buyIn": {"min": "100", "max": "200"},
        "escrow": {"contract": "c", "network": "solana"},
        "seats": 6,
        "players": [],
        "observerCount": 0,
        "speed": "normal",
        "timeouts": {"decision": 30, "disconnectGrace": 60},
        "rake": {"rate": "0.05", "cap": "10"},
        "handNumber": 0,
        "status": "open",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z"
    }))
    .unwrap();
    let _ = client.rooms.create(&room, Some("@alice")).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/rooms"));
}

#[tokio::test]
async fn rooms_get() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.rooms.get("r1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/rooms/r1"));
}

#[tokio::test]
async fn rooms_join() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .rooms
        .join("r1", Some(&GameJoinRequest::default()), Some("@alice"))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/rooms/r1/join"));
}

#[tokio::test]
async fn rooms_leave() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .rooms
        .leave("r1", Some(&GameLeaveRequest::default()), Some("@alice"))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/rooms/r1/leave"));
}

#[tokio::test]
async fn rooms_close() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .rooms
        .close("r1", Some(&GameOperatorRequest::default()), Some("@op"))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/rooms/r1/close"));
}

#[tokio::test]
async fn rooms_emergency_withdrawal() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let body: GameEmergencyWithdrawalRequest = serde_json::from_value(json!({
        "agentId": "@alice",
        "requestTxHash": "0xabc"
    }))
    .unwrap();
    let _ = client
        .rooms
        .emergency_withdrawal("r1", &body, Some("@op"))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/rooms/r1/emergency-withdrawals"));
}

#[tokio::test]
async fn rooms_action() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let body: GameActionRequest = serde_json::from_value(json!({
        "agentId": "@alice",
        "action": "call"
    }))
    .unwrap();
    let _ = client.rooms.action("r1", &body, Some("@alice")).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/rooms/r1/action"));
}

#[tokio::test]
async fn rooms_timeout() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .rooms
        .timeout("r1", Some(&GameOperatorRequest::default()), Some("@op"))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/rooms/r1/timeout"));
}

#[tokio::test]
async fn rooms_list_hands() {
    let server = any_ok(json!({"hands": []})).await;
    let client = client_for(&server);
    let _ = client.rooms.list_hands("r1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/rooms/r1/hands"));
}

#[tokio::test]
async fn rooms_start_hand() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .rooms
        .start_hand("r1", Some(&GameOperatorRequest::default()), Some("@op"))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/rooms/r1/hands"));
}

#[tokio::test]
async fn rooms_get_hand() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.rooms.get_hand("r1", "h1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/rooms/r1/hands/h1"));
}

#[tokio::test]
async fn rooms_collusion_report() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.rooms.collusion_report("r1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/rooms/r1/collusion"));
}

#[tokio::test]
async fn rooms_settle_hand() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let body: GameSettleRequest = serde_json::from_value(json!({
        "operator": "@op",
        "winners": [],
        "txHash": "0xabc"
    }))
    .unwrap();
    let _ = client
        .rooms
        .settle_hand("r1", "h1", &body, Some("@op"))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/rooms/r1/hands/h1/settle"));
}

// --- LotteryApi ---

#[tokio::test]
async fn lottery_current() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.lottery.current(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/lottery"));
}

#[tokio::test]
async fn lottery_list_rounds() {
    let server = any_ok(json!({"rounds": []})).await;
    let client = client_for(&server);
    let _ = client
        .lottery
        .list_rounds(Some(&LotteryRoundQueryParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/lottery/rounds"));
}

#[tokio::test]
async fn lottery_get_round() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.lottery.get_round("rd1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/lottery/rounds/rd1"));
}

#[tokio::test]
async fn lottery_holdings() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.lottery.holdings(Some("@alice")).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/lottery/holdings"));
}

#[tokio::test]
async fn lottery_buy() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let request: LotteryBuyRequest = serde_json::from_value(json!({
        "agentId": "@alice",
        "amountMicros": "1000000"
    }))
    .unwrap();
    let _ = client.lottery.buy(&request, Some("@alice")).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/lottery/buy"));
}

#[tokio::test]
async fn lottery_draw() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .lottery
        .draw("rd1", Some(&LotteryDrawRequest::default()), Some("@op"))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/lottery/rounds/rd1/draw"));
}

// --- ReputationApi ---

#[tokio::test]
async fn reputation_get_score() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.reputation.get_score("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/reputation/"));
}

#[tokio::test]
async fn reputation_get_history() {
    let server = any_ok(json!({"history": []})).await;
    let client = client_for(&server);
    let _ = client.reputation.get_history("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/history"));
}

#[tokio::test]
async fn reputation_get_reviews() {
    let server = any_ok(json!({"reviews": []})).await;
    let client = client_for(&server);
    let _ = client.reputation.get_reviews("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/reviews"));
}

#[tokio::test]
async fn reputation_get_attestations() {
    let server = any_ok(json!({"attestations": []})).await;
    let client = client_for(&server);
    let _ = client.reputation.get_attestations("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/attestations"));
}

#[tokio::test]
async fn reputation_create_review() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let review: ReputationReviewCreate = serde_json::from_value(json!({
        "reviewer": "@alice",
        "subject": "@bob",
        "rating": 5.0,
        "transactionRef": "tx1"
    }))
    .unwrap();
    let _ = client.reputation.create_review(&review).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/reputation/reviews"));
}

#[tokio::test]
async fn reputation_create_attestation() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let attestation: AttestationCreate = serde_json::from_value(json!({
        "agent": "@alice",
        "agentCryptoId": "cid",
        "platform": "github",
        "handle": "alice"
    }))
    .unwrap();
    let _ = client.reputation.create_attestation(&attestation).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/reputation/attestations"));
}

#[tokio::test]
async fn reputation_delete_attestation() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.reputation.delete_attestation("att1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("/reputation/attestations/att1"));
}

#[tokio::test]
async fn reputation_trust_graph() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .reputation
        .trust_graph(Some(&TrustGraphQueryParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/reputation/trust/graph"));
}

#[tokio::test]
async fn reputation_get_trust() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.reputation.get_trust("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/trust"));
}

#[tokio::test]
async fn reputation_get_vouches() {
    let server = any_ok(json!({"vouches": []})).await;
    let client = client_for(&server);
    let _ = client.reputation.get_vouches("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/vouches"));
}

#[tokio::test]
async fn reputation_get_given_vouches() {
    let server = any_ok(json!({"vouches": []})).await;
    let client = client_for(&server);
    let _ = client.reputation.get_given_vouches("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/vouches/given"));
}

#[tokio::test]
async fn reputation_create_vouch() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let vouch: ReputationVouchCreate = serde_json::from_value(json!({
        "voucher": "@alice",
        "subject": "@bob",
        "weight": 1.0
    }))
    .unwrap();
    let _ = client.reputation.create_vouch(&vouch).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/reputation/vouches"));
}

#[tokio::test]
async fn reputation_delete_vouch() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.reputation.delete_vouch("vouch1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("/reputation/vouches/vouch1"));
}

#[tokio::test]
async fn reputation_leaderboard() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.reputation.leaderboard(None, None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/leaderboards/reputation"));
}

#[tokio::test]
async fn reputation_reputation_leaderboard() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.reputation.reputation_leaderboard(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/reputation/leaderboard"));
}

#[tokio::test]
async fn reputation_rising_leaderboard() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .reputation
        .rising_leaderboard(Some(&LeaderboardQueryParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/leaderboards/rising"));
}

#[tokio::test]
async fn reputation_sellers_leaderboard() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.reputation.sellers_leaderboard(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/leaderboards/sellers"));
}

#[tokio::test]
async fn reputation_games_leaderboard() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.reputation.games_leaderboard(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/leaderboards/games"));
}

#[tokio::test]
async fn reputation_groups_leaderboard() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.reputation.groups_leaderboard(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/leaderboards/groups"));
}

#[tokio::test]
async fn reputation_messages_leaderboard() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .reputation
        .messages_leaderboard(Some(&LeaderboardQueryParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/leaderboards/messages"));
}

#[tokio::test]
async fn reputation_volume_leaderboard() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .reputation
        .volume_leaderboard(Some(&LeaderboardQueryParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/leaderboards/volume"));
}

// --- ExplorerApi ---

#[tokio::test]
async fn explorer_root() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.explorer.root().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/explorer"));
}

#[tokio::test]
async fn explorer_overview() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.explorer.overview().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/explorer/overview"));
}

#[tokio::test]
async fn explorer_list_transactions() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .explorer
        .list_transactions(Some(&ExplorerTransactionQueryParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/explorer/transactions"));
}

#[tokio::test]
async fn explorer_get_transaction() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.explorer.get_transaction("tx1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/explorer/transactions/tx1"));
}

#[tokio::test]
async fn explorer_verify_transaction() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.explorer.verify_transaction("tx1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/explorer/transactions/tx1/verify"));
}

#[tokio::test]
async fn explorer_get_agent() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.explorer.get_agent("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/explorer/agents/"));
}

// --- AdminApi (admin auth, configured by client_for) ---

#[tokio::test]
async fn admin_list_fees() {
    let server = any_ok(json!({"fees": []})).await;
    let client = client_for(&server);
    let _ = client.admin.list_fees().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/admin/fees"));
}

#[tokio::test]
async fn admin_create_fee() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let fee: FeeConfig = serde_json::from_value(json!({
        "feeId": "f1",
        "scope": "global",
        "transactionType": "transfer",
        "agents": [],
        "rate": "0.01",
        "effectiveFrom": "2026-01-01T00:00:00Z",
        "createdBy": "@admin",
        "reason": "default",
        "revoked": false,
        "updatedAt": "2026-01-01T00:00:00Z"
    }))
    .unwrap();
    let _ = client.admin.create_fee(&fee).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/admin/fees"));
}

#[tokio::test]
async fn admin_get_fee() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.admin.get_fee("f1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/admin/fees/f1"));
}

#[tokio::test]
async fn admin_update_fee() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let fee: FeeConfig = serde_json::from_value(json!({
        "feeId": "f1",
        "scope": "global",
        "transactionType": "transfer",
        "agents": [],
        "rate": "0.02",
        "effectiveFrom": "2026-01-01T00:00:00Z",
        "createdBy": "@admin",
        "reason": "update",
        "revoked": false,
        "updatedAt": "2026-01-01T00:00:00Z"
    }))
    .unwrap();
    let _ = client.admin.update_fee("f1", &fee).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "PUT");
    assert!(req.url.path().contains("/admin/fees/f1"));
}

#[tokio::test]
async fn admin_delete_fee() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.admin.delete_fee("f1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("/admin/fees/f1"));
}

#[tokio::test]
async fn admin_resolve_fee() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.admin.resolve_fee(&FeeResolveParams::default()).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/admin/fees/resolve"));
}

#[tokio::test]
async fn admin_get_agent_status() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.admin.get_agent_status("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/admin/agents/"));
    assert!(req.url.path().contains("/status"));
}

#[tokio::test]
async fn admin_suspend_agent() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .admin
        .suspend_agent("@alice", &SuspendAgentParams::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/suspend"));
}

#[tokio::test]
async fn admin_unsuspend_agent() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.admin.unsuspend_agent("@alice").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/unsuspend"));
}

#[tokio::test]
async fn admin_flag_agent() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.admin.flag_agent("@alice", &json!({})).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/flag"));
}

#[tokio::test]
async fn admin_get_config() {
    let server = any_ok(json!({"config": {}})).await;
    let client = client_for(&server);
    let _ = client.admin.get_config().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/admin/config"));
}

#[tokio::test]
async fn admin_set_config() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.admin.set_config("key1", "value1", None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "PUT");
    assert!(req.url.path().contains("/admin/config/key1"));
}

#[tokio::test]
async fn admin_audit() {
    let server = any_ok(json!({"audit": []})).await;
    let client = client_for(&server);
    let _ = client.admin.audit(Some(&AuditQueryParams::default())).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/admin/audit"));
}

#[tokio::test]
async fn admin_fee_metrics() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.admin.fee_metrics(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/admin/metrics/fees"));
}

// --- ModerationApi ---

#[tokio::test]
async fn moderation_get_constitution() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.moderation.get_constitution().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/constitution"));
}

#[tokio::test]
async fn moderation_create_report() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let report: ModerationReportCreate = serde_json::from_value(json!({
        "reporter": "@alice",
        "contentType": "channel-message",
        "contentId": "m1",
        "ruleViolated": "spam"
    }))
    .unwrap();
    let _ = client.moderation.create_report(&report).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/moderation/reports"));
}

#[tokio::test]
async fn moderation_get_report() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.moderation.get_report("rep1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/moderation/reports/rep1"));
}

#[tokio::test]
async fn moderation_update_report_status() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .moderation
        .update_report_status("rep1", &ModerationStatusUpdate::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "PUT");
    assert!(req.url.path().contains("/moderation/reports/rep1/status"));
}

#[tokio::test]
async fn moderation_list_actions() {
    let server = any_ok(json!({"actions": []})).await;
    let client = client_for(&server);
    let _ = client
        .moderation
        .list_actions(Some(&ModerationActionsQueryParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/moderation/actions"));
}

#[tokio::test]
async fn moderation_create_action() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let action: ModerationAction = serde_json::from_value(json!({
        "actionId": "a1",
        "action": "warn",
        "target": "@bob",
        "ruleViolated": "spam",
        "constitutionVersion": "1.0",
        "createdAt": "2026-01-01T00:00:00Z"
    }))
    .unwrap();
    let _ = client.moderation.create_action(&action).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/moderation/actions"));
}

#[tokio::test]
async fn moderation_create_appeal() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .moderation
        .create_appeal(&ModerationAppealCreate::default(), Some("@bob"))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/moderation/appeals"));
}

#[tokio::test]
async fn moderation_get_appeal() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.moderation.get_appeal("ap1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/moderation/appeals/ap1"));
}

#[tokio::test]
async fn moderation_update_appeal_status() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .moderation
        .update_appeal_status("ap1", &ModerationStatusUpdate::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "PUT");
    assert!(req.url.path().contains("/moderation/appeals/ap1/status"));
}

// --- StatsApi ---

#[tokio::test]
async fn stats_overview() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.stats.overview().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/stats"));
}

#[tokio::test]
async fn stats_agents() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.stats.agents().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/stats/agents"));
}

#[tokio::test]
async fn stats_transactions() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.stats.transactions().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/stats/transactions"));
}

#[tokio::test]
async fn stats_volume() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.stats.volume().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/stats/volume"));
}

#[tokio::test]
async fn stats_fees() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.stats.fees().await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/stats/fees"));
}

// --- ArtifactsApi ---

#[tokio::test]
async fn artifacts_list() {
    let server = any_ok(json!({"artifacts": []})).await;
    let client = client_for(&server);
    let _ = client
        .artifacts
        .list(Some(&ArtifactQueryParams::default()), Some("@alice"))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/artifacts"));
}

#[tokio::test]
async fn artifacts_create() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .artifacts
        .create(&ArtifactCreateRequest::default(), Some("@alice"))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/artifacts"));
}

#[tokio::test]
async fn artifacts_get() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.artifacts.get("art1", Some("@alice")).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/artifacts/art1"));
}

#[tokio::test]
async fn artifacts_remove() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.artifacts.remove("art1", Some("@alice")).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "DELETE");
    assert!(req.url.path().contains("/artifacts/art1"));
}

#[tokio::test]
async fn artifacts_download() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.artifacts.download("art1", Some("@alice")).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/artifacts/art1/download"));
}

#[tokio::test]
async fn artifacts_update_recipients() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .artifacts
        .update_recipients("art1", &ArtifactRecipientUpdate::default(), Some("@alice"))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "PUT");
    assert!(req.url.path().contains("/artifacts/art1/recipients"));
}

// --- FeedbackApi ---

#[tokio::test]
async fn feedback_list() {
    let server = any_ok(json!({"feedback": []})).await;
    let client = client_for(&server);
    let _ = client
        .feedback
        .list(Some(&FeedbackListParams::default()))
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/feedback"));
}

#[tokio::test]
async fn feedback_list_admin() {
    let server = any_ok(json!({"feedback": []})).await;
    let client = client_for(&server);
    let _ = client.feedback.list_admin(None).await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/feedback"));
}

#[tokio::test]
async fn feedback_get() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client.feedback.get("fb1").await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "GET");
    assert!(req.url.path().contains("/feedback/fb1"));
}

#[tokio::test]
async fn feedback_create() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .feedback
        .create(FeedbackCreate {
            author: "@alice".into(),
            title: "Bug".into(),
            description: "Something broke".into(),
            ..Default::default()
        })
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/feedback"));
}

#[tokio::test]
async fn feedback_vote() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .feedback
        .vote(
            "fb1",
            FeedbackVoteRequest {
                voter: "@alice".into(),
                ..Default::default()
            },
        )
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert!(req.url.path().contains("/feedback/fb1/vote"));
}

#[tokio::test]
async fn feedback_update_status() {
    let server = any_empty_ok().await;
    let client = client_for(&server);
    let _ = client
        .feedback
        .update_status("fb1", FeedbackStatusUpdate::default())
        .await;
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "PUT");
    assert!(req.url.path().contains("/feedback/fb1/status"));
}
