use serde::{Deserialize, Serialize};

use crate::x402::X402PaymentMap;

#[allow(unused_imports)]
use super::*;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplacePrice {
    pub amount: String,
    pub asset: String,
    pub network: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub seller: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityListingQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    #[serde(flatten)]
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceCategory {
    #[serde(flatten)]
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductReview {
    #[serde(flatten)]
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityListing {
    #[serde(flatten)]
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityBid {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bidder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bidder_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub bidder_public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub price: Option<MarketplacePrice>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityOffer {
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
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductBuyRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<X402PaymentMap>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

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
    pub signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<X402PaymentMap>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}
