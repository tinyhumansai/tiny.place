use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProductCategory {
    Dataset,
    Model,
    ApiKey,
    Report,
    Template,
    Tool,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProductStatus {
    Active,
    SoldOut,
    Delisted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum DeliveryMethod {
    Download,
    A2aTask,
    EncryptedMessage,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum IdentityListingType {
    Fixed,
    Auction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplacePrice {
    pub amount: String,
    pub asset: String,
    pub network: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub product_id: String,
    pub seller: String,
    pub seller_crypto_id: String,
    pub name: String,
    pub description: String,
    pub category: ProductCategory,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    pub price: MarketplacePrice,
    pub delivery_method: DeliveryMethod,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivery_details: Option<HashMap<String, serde_json::Value>>,
    pub status: ProductStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stock: Option<u64>,
    pub created_at: String,
    pub updated_at: String,
    pub sales_count: u64,
    pub rating: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductCreateRequest {
    pub name: String,
    pub description: String,
    pub category: ProductCategory,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    pub price: MarketplacePrice,
    pub delivery_method: DeliveryMethod,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivery_details: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stock: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductQueryParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seller: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductPurchase {
    pub purchase_id: String,
    pub product_id: String,
    pub buyer: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buyer_crypto_id: Option<String>,
    pub seller: String,
    pub price: MarketplacePrice,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ledger_tx_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivery: Option<HashMap<String, serde_json::Value>>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductReview {
    pub review_id: String,
    pub product_id: String,
    pub buyer: String,
    pub rating: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityListing {
    pub listing_id: String,
    #[serde(rename = "type")]
    pub listing_kind: String,
    pub name: String,
    pub seller: String,
    pub seller_crypto_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    pub price: MarketplacePrice,
    pub listing_type: IdentityListingType,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reserve_price: Option<MarketplacePrice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highest_bid: Option<IdentityBid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub winning_bid_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_due_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settlement_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityBid {
    pub bid_id: String,
    pub listing_id: String,
    pub bidder: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bidder_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bidder_public_key: Option<String>,
    pub price: MarketplacePrice,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment: Option<HashMap<String, String>>,
    pub status: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityOffer {
    pub offer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub listing_id: Option<String>,
    pub name: String,
    pub buyer: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buyer_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buyer_public_key: Option<String>,
    pub price: MarketplacePrice,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentitySale {
    pub sale_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub listing_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offer_id: Option<String>,
    pub name: String,
    pub seller: String,
    pub buyer: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buyer_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buyer_public_key: Option<String>,
    pub price: MarketplacePrice,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ledger_tx_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceCategory {
    pub category: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityFloor {
    pub length: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<MarketplacePrice>,
}
