//! Endpoint tests for the remaining API namespaces: reputation,
//! explorer, admin, moderation, and stats. Each test points the
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
    AttestationCreate, FeeConfig, FeeResolveParams, FeedbackCreate, FeedbackListParams,
    FeedbackStatusUpdate, FeedbackVoteRequest, LeaderboardQueryParams, ModerationAction,
    ModerationReportCreate, ReputationReviewCreate, ReputationVouchCreate, TrustGraphQueryParams,
};

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
