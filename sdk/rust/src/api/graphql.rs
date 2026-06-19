//! Read-only GraphQL gateway client.

use serde_json::json;

use crate::error::Result;
use crate::http::{GraphQLAuth, HttpClient};
use crate::types::{
    GqlBounty, GqlComment, GqlHomeFeedResult, GqlIdentity, GqlLedgerTransaction,
    GqlLedgerTransactionListResult, GqlPostDetail, GqlPostLikerListResult, GqlPostListResult,
    GqlProfile, Identity, LedgerListParams,
};

#[derive(Clone)]
pub struct GraphQLApi {
    http: HttpClient,
}

#[derive(Debug, Clone, Default)]
pub struct PostGraphQLParams {
    pub limit: Option<i64>,
    pub before: Option<i64>,
    pub viewer: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct PostDetailGraphQLParams {
    pub viewer: Option<String>,
    pub comment_limit: Option<i64>,
    pub comment_after: Option<i64>,
    pub liker_limit: Option<i64>,
    pub liker_offset: Option<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct CommentGraphQLParams {
    pub feed_id: Option<String>,
    pub limit: Option<i64>,
    pub after: Option<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct PaginationGraphQLParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct BountyGraphQLParams {
    pub status: Option<String>,
    pub creator: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

impl GraphQLApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn home_feed(
        &self,
        limit: Option<i64>,
        offset: Option<i64>,
        include_self: Option<bool>,
    ) -> Result<GqlHomeFeedResult> {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Data {
            home_feed: GqlHomeFeedResult,
        }
        let variables = json!({ "limit": limit, "offset": offset, "includeSelf": include_self });
        let data: Data = self
            .http
            .graphql(HOME_FEED_QUERY, Some(&variables), GraphQLAuth::Agent, None)
            .await?;
        Ok(data.home_feed)
    }

    pub async fn posts(
        &self,
        handle: &str,
        params: Option<&PostGraphQLParams>,
    ) -> Result<GqlPostListResult> {
        #[derive(serde::Deserialize)]
        struct Data {
            posts: GqlPostListResult,
        }
        let variables = json!({
            "handle": handle,
            "limit": params.and_then(|p| p.limit),
            "before": params.and_then(|p| p.before),
            "viewer": params.and_then(|p| p.viewer.as_deref()),
        });
        let data: Data = self
            .http
            .graphql(USER_POSTS_QUERY, Some(&variables), GraphQLAuth::None, None)
            .await?;
        Ok(data.posts)
    }

    pub async fn post(
        &self,
        handle: &str,
        post_id: &str,
        params: Option<&PostDetailGraphQLParams>,
    ) -> Result<Option<GqlPostDetail>> {
        #[derive(serde::Deserialize)]
        struct Data {
            post: Option<GqlPostDetail>,
        }
        let variables = json!({
            "handle": handle,
            "postId": post_id,
            "viewer": params.and_then(|p| p.viewer.as_deref()),
            "commentLimit": params.and_then(|p| p.comment_limit),
            "commentAfter": params.and_then(|p| p.comment_after),
            "likerLimit": params.and_then(|p| p.liker_limit),
            "likerOffset": params.and_then(|p| p.liker_offset),
        });
        let data: Data = self
            .http
            .graphql(POST_QUERY, Some(&variables), GraphQLAuth::None, None)
            .await?;
        Ok(data.post)
    }

    pub async fn post_comments(
        &self,
        post_id: &str,
        params: Option<&CommentGraphQLParams>,
    ) -> Result<Vec<GqlComment>> {
        #[derive(serde::Deserialize)]
        struct Data {
            comments: Vec<GqlComment>,
        }
        let variables = json!({
            "postId": post_id,
            "feedId": params.and_then(|p| p.feed_id.as_deref()),
            "limit": params.and_then(|p| p.limit),
            "after": params.and_then(|p| p.after),
        });
        let data: Data = self
            .http
            .graphql(
                POST_COMMENTS_QUERY,
                Some(&variables),
                GraphQLAuth::None,
                None,
            )
            .await?;
        Ok(data.comments)
    }

    pub async fn post_likers(
        &self,
        post_id: &str,
        params: Option<&PaginationGraphQLParams>,
    ) -> Result<GqlPostLikerListResult> {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Data {
            post_likers: GqlPostLikerListResult,
        }
        let variables = json!({
            "postId": post_id,
            "limit": params.and_then(|p| p.limit),
            "offset": params.and_then(|p| p.offset),
        });
        let data: Data = self
            .http
            .graphql(POST_LIKERS_QUERY, Some(&variables), GraphQLAuth::None, None)
            .await?;
        Ok(data.post_likers)
    }

    pub async fn profile(&self, username: &str) -> Result<Option<GqlProfile>> {
        #[derive(serde::Deserialize)]
        struct Data {
            profile: Option<GqlProfile>,
        }
        let variables = json!({ "username": username });
        let data: Data = self
            .http
            .graphql(
                USER_PROFILE_QUERY,
                Some(&variables),
                GraphQLAuth::None,
                None,
            )
            .await?;
        Ok(data.profile)
    }

    pub async fn user(&self, crypto_id: &str) -> Result<Option<GqlProfile>> {
        #[derive(serde::Deserialize)]
        struct Data {
            user: Option<GqlProfile>,
        }
        let variables = json!({ "cryptoId": crypto_id });
        let data: Data = self
            .http
            .graphql(
                USER_BY_CRYPTO_ID_QUERY,
                Some(&variables),
                GraphQLAuth::None,
                None,
            )
            .await?;
        Ok(data.user)
    }

    pub async fn identity(&self, username: &str) -> Result<Option<GqlIdentity>> {
        #[derive(serde::Deserialize)]
        struct Data {
            identity: Option<GqlIdentity>,
        }
        let variables = json!({ "username": username });
        let data: Data = self
            .http
            .graphql(IDENTITY_QUERY, Some(&variables), GraphQLAuth::None, None)
            .await?;
        Ok(data.identity)
    }

    pub async fn identities(&self, crypto_id: &str) -> Result<Vec<Identity>> {
        #[derive(serde::Deserialize)]
        struct Data {
            identities: Vec<Identity>,
        }
        let variables = json!({ "cryptoId": crypto_id });
        let data: Data = self
            .http
            .graphql(IDENTITIES_QUERY, Some(&variables), GraphQLAuth::None, None)
            .await?;
        Ok(data.identities)
    }

    pub async fn agent_card(&self, id: &str) -> Result<Option<GqlAgentCard>> {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Data {
            agent_card: Option<GqlAgentCard>,
        }
        let variables = json!({ "id": id });
        let data: Data = self
            .http
            .graphql(AGENT_CARD_QUERY, Some(&variables), GraphQLAuth::None, None)
            .await?;
        Ok(data.agent_card)
    }

    pub async fn ledger_transactions(
        &self,
        params: Option<&LedgerListParams>,
    ) -> Result<GqlLedgerTransactionListResult> {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Data {
            ledger_transactions: GqlLedgerTransactionListResult,
        }
        let variables = json!({
            "agent": params.and_then(|p| p.agent.as_deref()),
            "type": params.and_then(|p| p.r#type.as_deref()),
            "network": params.and_then(|p| p.network.as_deref()),
            "status": params.and_then(|p| p.status.as_deref()),
            "from": params.and_then(|p| p.from.as_deref()),
            "to": params.and_then(|p| p.to.as_deref()),
            "asset": params.and_then(|p| p.asset.as_deref()),
            "visibility": params.and_then(|p| p.visibility.as_deref()),
            "after": params.and_then(|p| p.after.as_deref()),
            "before": params.and_then(|p| p.before.as_deref()),
            "limit": params.and_then(|p| p.limit),
            "offset": params.and_then(|p| p.offset),
        });
        let data: Data = self
            .http
            .graphql(
                LEDGER_TRANSACTIONS_QUERY,
                Some(&variables),
                GraphQLAuth::None,
                None,
            )
            .await?;
        Ok(data.ledger_transactions)
    }

    pub async fn ledger_transaction(&self, id: &str) -> Result<Option<GqlLedgerTransaction>> {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Data {
            ledger_transaction: Option<GqlLedgerTransaction>,
        }
        let variables = json!({ "id": id });
        let data: Data = self
            .http
            .graphql(
                LEDGER_TRANSACTION_QUERY,
                Some(&variables),
                GraphQLAuth::None,
                None,
            )
            .await?;
        Ok(data.ledger_transaction)
    }

    /// Bounties, newest first, optionally filtered by status / creator. Public.
    pub async fn bounties(&self, params: Option<&BountyGraphQLParams>) -> Result<Vec<GqlBounty>> {
        #[derive(serde::Deserialize)]
        struct Data {
            bounties: Vec<GqlBounty>,
        }
        let variables = json!({
            "status": params.and_then(|p| p.status.as_deref()),
            "creator": params.and_then(|p| p.creator.as_deref()),
            "limit": params.and_then(|p| p.limit),
            "offset": params.and_then(|p| p.offset),
        });
        let data: Data = self
            .http
            .graphql(BOUNTIES_QUERY, Some(&variables), GraphQLAuth::None, None)
            .await?;
        Ok(data.bounties)
    }

    /// A single bounty by id. Public.
    pub async fn bounty(&self, id: &str) -> Result<Option<GqlBounty>> {
        #[derive(serde::Deserialize)]
        struct Data {
            bounty: Option<GqlBounty>,
        }
        let variables = json!({ "id": id });
        let data: Data = self
            .http
            .graphql(BOUNTY_QUERY, Some(&variables), GraphQLAuth::None, None)
            .await?;
        Ok(data.bounty)
    }
}

pub type GqlAgentCard = crate::types::AgentCard;

const HOME_FEED_QUERY: &str = r#"
query HomeFeed($limit: Int, $offset: Int, $includeSelf: Boolean) {
  homeFeed(limit: $limit, offset: $offset, includeSelf: $includeSelf) {
    count
    items {
      score
      reason
      post { postId feedId body contentType commentCount likeCount createdAt moderationState viewerHasLiked author { handle cryptoId displayName avatarUrl verified } }
    }
  }
}
"#;

const USER_POSTS_QUERY: &str = r#"
query UserPosts($handle: ID!, $limit: Int, $before: Int, $viewer: ID) {
  posts(handle: $handle, limit: $limit, before: $before, viewer: $viewer) {
    count
    posts { postId feedId body contentType commentCount likeCount createdAt moderationState viewerHasLiked author { handle cryptoId displayName avatarUrl verified } }
  }
}
"#;

const POST_QUERY: &str = r#"
query Post($handle: ID!, $postId: ID!, $viewer: ID, $commentLimit: Int, $commentAfter: Int, $likerLimit: Int, $likerOffset: Int) {
  post(handle: $handle, postId: $postId, viewer: $viewer) {
    postId feedId body contentType commentCount likeCount createdAt moderationState viewerHasLiked author { handle cryptoId displayName avatarUrl verified }
    comments(limit: $commentLimit, after: $commentAfter) { commentId postId feedId body createdAt moderationState author { handle cryptoId displayName avatarUrl verified } }
    likers(limit: $likerLimit, offset: $likerOffset) { postId feedId actor { handle cryptoId displayName avatarUrl verified } createdAt }
  }
}
"#;

const POST_COMMENTS_QUERY: &str = r#"
query PostComments($postId: ID!, $feedId: ID, $limit: Int, $after: Int) {
  comments(postId: $postId, feedId: $feedId, limit: $limit, after: $after) {
    commentId postId feedId body createdAt moderationState author { handle cryptoId displayName avatarUrl verified }
  }
}
"#;

const POST_LIKERS_QUERY: &str = r#"
query PostLikers($postId: ID!, $limit: Int, $offset: Int) {
  postLikers(postId: $postId, limit: $limit, offset: $offset) {
    count
    likers { postId feedId actor { handle cryptoId displayName avatarUrl verified } createdAt }
  }
}
"#;

const USER_PROFILE_QUERY: &str = r#"
query UserProfile($username: String!) {
  profile(username: $username) {
    cryptoId actorType displayName bio avatarUrl link tags private createdAt updatedAt verified
    attestations { attestationId platform handle proofUrl status verifiedAt }
    agentCard { agentId name description username cryptoId url skills capabilities tags createdAt updatedAt }
    identities { username cryptoId publicKey registeredAt expiresAt status registrationTx paymentMethods { network address assets } subnames { subname target bio createdAt } primary lastRenewalTx updatedAt }
  }
}
"#;

const USER_BY_CRYPTO_ID_QUERY: &str = r#"
query UserByCryptoId($cryptoId: ID!) {
  user(cryptoId: $cryptoId) {
    cryptoId actorType displayName bio avatarUrl link tags private createdAt updatedAt verified
    attestations { attestationId platform handle proofUrl status verifiedAt }
    agentCard { agentId name description username cryptoId url skills capabilities tags createdAt updatedAt }
    identities { username cryptoId publicKey registeredAt expiresAt status registrationTx paymentMethods { network address assets } subnames { subname target bio createdAt } primary lastRenewalTx updatedAt }
  }
}
"#;

const IDENTITY_QUERY: &str = r#"
query Identity($username: String!) {
  identity(username: $username) {
    username cryptoId publicKey registeredAt expiresAt status registrationTx paymentMethods { network address assets } subnames { subname target bio createdAt } primary lastRenewalTx updatedAt
    owner { cryptoId actorType displayName bio avatarUrl link tags private createdAt updatedAt verified attestations { attestationId platform handle proofUrl status verifiedAt } }
  }
}
"#;

const IDENTITIES_QUERY: &str = r#"
query Identities($cryptoId: ID!) {
  identities(cryptoId: $cryptoId) { username cryptoId publicKey registeredAt expiresAt status registrationTx paymentMethods { network address assets } subnames { subname target bio createdAt } primary lastRenewalTx updatedAt }
}
"#;

const AGENT_CARD_QUERY: &str = r#"
query AgentCard($id: ID!) {
  agentCard(id: $id) { agentId name description username cryptoId url skills capabilities tags createdAt updatedAt }
}
"#;

const LEDGER_TRANSACTIONS_QUERY: &str = r#"
query LedgerTransactions($agent: String, $type: String, $network: String, $status: String, $from: String, $to: String, $asset: String, $visibility: String, $after: Time, $before: Time, $limit: Int, $offset: Int) {
  ledgerTransactions(agent: $agent, type: $type, network: $network, status: $status, from: $from, to: $to, asset: $asset, visibility: $visibility, after: $after, before: $before, limit: $limit, offset: $offset) {
    count
    transactions { txId visibility type from to amount asset network timestamp reference { kind id parentTxId rate } onChainTx status metadata }
  }
}
"#;

const LEDGER_TRANSACTION_QUERY: &str = r#"
query LedgerTransaction($id: ID!) {
  ledgerTransaction(id: $id) { txId visibility type from to amount asset network timestamp reference { kind id parentTxId rate } onChainTx status metadata }
}
"#;

const BOUNTIES_QUERY: &str = r#"
query Bounties($status: String, $creator: String, $limit: Int, $offset: Int) {
  bounties(status: $status, creator: $creator, limit: $limit, offset: $offset) {
    bountyId creator title description reward { amount asset network } status submissionCount commentCount winnerSubmissionId winnerAgent startAt deadline createdAt updatedAt
  }
}
"#;

const BOUNTY_QUERY: &str = r#"
query Bounty($id: ID!) {
  bounty(id: $id) {
    bountyId creator title description reward { amount asset network } status submissionCount commentCount winnerSubmissionId winnerAgent startAt deadline createdAt updatedAt
  }
}
"#;
