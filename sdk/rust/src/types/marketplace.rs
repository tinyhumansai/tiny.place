//! Marketplace types (products, identity listings, bids, offers, sales).
//! Mirrors `sdk/typescript/src/types/marketplace.ts`.

use std::collections::HashMap;

#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

/// Product category (`"dataset" | "model" | "api-key" | ...`).
pub type ProductCategory = String;

/// Product lifecycle status (`"active" | "sold-out" | "delisted"`).
pub type ProductStatus = String;

/// How a purchased product is delivered.
pub type DeliveryMethod = String;

/// Identity listing type (`"fixed" | "auction"`).
pub type IdentityListingType = String;

/// A price on the marketplace.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplacePrice {
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub network: String,
}

/// A product listing.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    #[serde(default)]
    pub product_id: String,
    #[serde(default)]
    pub seller: String,
    #[serde(default)]
    pub seller_crypto_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub category: ProductCategory,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub price: MarketplacePrice,
    #[serde(default)]
    pub delivery_method: DeliveryMethod,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub delivery_details: Option<HashMap<String, serde_json::Value>>,
    #[serde(default)]
    pub status: ProductStatus,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub stock: Option<i64>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub sales_count: i64,
    #[serde(default)]
    pub rating: f64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    /// The base64 Ed25519 key that signed this request, i.e. the actor's
    /// registered key.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signer_public_key: Option<String>,
}

/// Request body for creating a product.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductCreateRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub product_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub seller: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub seller_crypto_id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub category: ProductCategory,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub price: MarketplacePrice,
    #[serde(default)]
    pub delivery_method: DeliveryMethod,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub delivery_details: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub stock: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    /// Base64 Ed25519 signer key for the seller.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signer_public_key: Option<String>,
}

/// Query params for listing/searching products and the marketplace.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub r#type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub seller: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub min_price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sort_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

/// Combined marketplace browse response (products + identity listings).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceBrowseResponse {
    #[serde(default)]
    pub products: Vec<Product>,
    #[serde(default)]
    pub identities: Vec<IdentityListing>,
}

/// A completed product purchase.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductPurchase {
    #[serde(default)]
    pub purchase_id: String,
    #[serde(default)]
    pub product_id: String,
    #[serde(default)]
    pub buyer: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer_crypto_id: Option<String>,
    #[serde(default)]
    pub seller: String,
    #[serde(default)]
    pub price: MarketplacePrice,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ledger_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub delivery: Option<HashMap<String, serde_json::Value>>,
    #[serde(default)]
    pub created_at: String,
}

/// Request body for buying a product.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductBuyRequest {
    /// Buyer @handle, for resolution/display only. Optional: a buyer without a
    /// registered handle is authorized by their wallet signature, and the actor
    /// defaults to the connected signing key.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub delivery: Option<HashMap<String, serde_json::Value>>,
}

/// A product review.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductReview {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub review_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub product_id: Option<String>,
    /// Reviewer @handle, for resolution/display only; optional for handle-free
    /// buyers.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rating: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    /// Base64 Ed25519 signer key for the buyer.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signer_public_key: Option<String>,
}

/// Request body for buying an identity listing.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityBuyRequest {
    #[serde(default)]
    pub buyer: String,
    #[serde(default)]
    pub buyer_crypto_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer_public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

/// Request body for accepting an identity offer.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityOfferAcceptRequest {
    #[serde(default)]
    pub seller: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
}

/// An identity (`@handle`) listing.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityListing {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub listing_id: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none", default)]
    pub type_: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub seller: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub seller_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub price: Option<MarketplacePrice>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub listing_type: Option<IdentityListingType>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reserve_price: Option<MarketplacePrice>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub highest_bid: Option<IdentityBid>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub winning_bid_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_due_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub settlement_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    /// Base64 Ed25519 signer key for the seller.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signer_public_key: Option<String>,
}

/// A bid on an identity auction listing.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityBid {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bid_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub listing_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bidder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bidder_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bidder_public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub price: Option<MarketplacePrice>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    /// Base64 Ed25519 signer key for the bidder.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signer_public_key: Option<String>,
}

/// An offer to buy an identity (`@handle`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityOffer {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub listing_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer_public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub price: Option<MarketplacePrice>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signature: Option<String>,
    /// Base64 Ed25519 signer key for the buyer.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub signer_public_key: Option<String>,
}

/// A completed identity sale.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentitySale {
    #[serde(default)]
    pub sale_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub listing_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offer_id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub seller: String,
    #[serde(default)]
    pub buyer: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer_public_key: Option<String>,
    #[serde(default)]
    pub price: MarketplacePrice,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ledger_tx_id: Option<String>,
    #[serde(default)]
    pub created_at: String,
}

/// A marketplace category and its item count.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceCategory {
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub count: i64,
}

/// The current identity floor price for a given name length.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityFloor {
    #[serde(default)]
    pub length: i64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub price: Option<MarketplacePrice>,
}
