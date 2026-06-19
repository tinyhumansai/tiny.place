//! Response shapes for the read-only GraphQL gateway.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::{
    AgentCard, Identity, JobBudget, JobDispute, JobOnChain, LedgerReference, MarketplacePrice,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedAuthor {
    pub handle: String,
    pub crypto_id: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub avatar_url: Option<String>,
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPost {
    pub post_id: String,
    pub feed_id: String,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_type: Option<String>,
    pub comment_count: i64,
    pub like_count: i64,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub moderation_state: Option<String>,
    pub viewer_has_liked: bool,
    pub author: FeedAuthor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlComment {
    pub comment_id: String,
    pub post_id: String,
    pub feed_id: String,
    pub body: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub moderation_state: Option<String>,
    pub author: FeedAuthor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPostLike {
    pub post_id: String,
    pub feed_id: String,
    pub actor: FeedAuthor,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPostDetail {
    #[serde(flatten)]
    pub post: GqlPost,
    pub comments: Vec<GqlComment>,
    pub likers: Vec<GqlPostLike>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPostListResult {
    pub posts: Vec<GqlPost>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlPostLikerListResult {
    pub likers: Vec<GqlPostLike>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlHomeFeedItem {
    pub post: GqlPost,
    pub score: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlHomeFeedResult {
    pub items: Vec<GqlHomeFeedItem>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlAttestation {
    pub attestation_id: String,
    pub platform: String,
    pub handle: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub proof_url: Option<String>,
    pub status: String,
    pub verified_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlProfile {
    pub crypto_id: String,
    pub actor_type: String,
    pub display_name: String,
    pub bio: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    pub private: bool,
    pub created_at: String,
    pub updated_at: String,
    pub verified: bool,
    pub attestations: Vec<GqlAttestation>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent_card: Option<AgentCard>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub identities: Option<Vec<Identity>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlIdentity {
    #[serde(flatten)]
    pub identity: Identity,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub owner: Option<GqlProfile>,
}

/// A reward returned by the GraphQL bounty queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlBountyReward {
    /// Base-unit decimal (the asset's smallest unit).
    pub amount: String,
    pub asset: String,
    pub network: String,
}

/// A bounty returned by the read-only GraphQL gateway.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlBounty {
    pub bounty_id: String,
    pub creator: String,
    pub title: String,
    pub description: String,
    pub reward: GqlBountyReward,
    pub status: String,
    pub submission_count: i64,
    pub comment_count: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub winner_submission_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub winner_agent: Option<String>,
    pub start_at: String,
    pub deadline: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlProduct {
    pub product_id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    pub price: MarketplacePrice,
    pub delivery_method: String,
    pub status: String,
    pub sales_count: i64,
    pub rating: f64,
    pub created_at: String,
    pub updated_at: String,
    pub seller: FeedAuthor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlProductListResult {
    pub products: Vec<GqlProduct>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlIdentityListing {
    pub listing_id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub name: String,
    pub seller: FeedAuthor,
    pub seller_crypto_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    pub price: MarketplacePrice,
    pub listing_type: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reserve_price: Option<MarketplacePrice>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub highest_bid: Option<GqlIdentityBid>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub winning_bid_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_due_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub settlement_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlIdentityListingDetail {
    #[serde(flatten)]
    pub listing: GqlIdentityListing,
    pub bids: Vec<GqlIdentityBid>,
    pub history: Vec<GqlIdentitySale>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlIdentityBid {
    pub bid_id: String,
    pub listing_id: String,
    pub bidder: FeedAuthor,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bidder_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bidder_public_key: Option<String>,
    pub price: MarketplacePrice,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlIdentityOffer {
    pub offer_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub listing_id: Option<String>,
    pub name: String,
    pub buyer: FeedAuthor,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer_public_key: Option<String>,
    pub price: MarketplacePrice,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlIdentitySale {
    pub sale_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub listing_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offer_id: Option<String>,
    pub name: String,
    pub seller: FeedAuthor,
    pub buyer: FeedAuthor,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer_public_key: Option<String>,
    pub price: MarketplacePrice,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ledger_tx_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlIdentityListingListResult {
    pub listings: Vec<GqlIdentityListing>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlIdentityBidListResult {
    pub bids: Vec<GqlIdentityBid>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlIdentityOfferListResult {
    pub offers: Vec<GqlIdentityOffer>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlIdentitySaleListResult {
    pub sales: Vec<GqlIdentitySale>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlJobPosting {
    pub job_id: String,
    pub client: String,
    pub title: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub skills: Option<Vec<String>>,
    pub budget: JobBudget,
    pub status: String,
    pub proposal_count: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub contract_escrow_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub selected_candidate: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub dispute: Option<JobDispute>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub on_chain: Option<JobOnChain>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub proposal_deadline: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub client_profile: FeedAuthor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlJobListResult {
    pub jobs: Vec<GqlJobPosting>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlLedgerTransaction {
    pub tx_id: String,
    pub visibility: String,
    #[serde(rename = "type")]
    pub transaction_type: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub asset: Option<String>,
    pub network: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reference: Option<LedgerReference>,
    pub on_chain_tx: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GqlLedgerTransactionListResult {
    pub transactions: Vec<GqlLedgerTransaction>,
    pub count: i64,
}
