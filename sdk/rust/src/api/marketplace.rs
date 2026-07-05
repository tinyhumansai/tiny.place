//! Compatibility wrapper for marketplace endpoints used by OpenHuman.

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    IdentityBid, IdentityBuyRequest, IdentityListing, MarketplaceCategory, Product,
    ProductBuyRequest, ProductQueryParams, ProductReview,
};
use crate::util::encode;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub buyer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct IdentityBidPaymentOptions;

#[derive(Debug, Clone, Default)]
pub struct IdentityOfferPaymentOptions;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductsResponse {
    #[serde(default)]
    pub products: Vec<Product>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoriesResponse {
    #[serde(default)]
    pub categories: Vec<MarketplaceCategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeaturedResponse {
    #[serde(default)]
    pub items: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductReviewsResponse {
    #[serde(default)]
    pub reviews: Vec<ProductReview>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentitiesResponse {
    #[serde(default)]
    pub identities: Vec<IdentityListing>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BidsResponse {
    #[serde(default)]
    pub bids: Vec<IdentityBid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffersResponse {
    #[serde(default)]
    pub offers: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentSalesResponse {
    #[serde(default)]
    pub sales: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentitySaleHistoryResponse {
    #[serde(default)]
    pub history: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityBidResult {
    #[serde(default)]
    pub updated_listing: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityOfferResult {
    #[serde(default)]
    pub offer: serde_json::Value,
}

#[derive(Clone)]
pub struct MarketplaceApi {
    http: HttpClient,
}

impl MarketplaceApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn identity_floor(&self, length: Option<i64>) -> Result<serde_json::Value> {
        let mut query = Vec::new();
        push_i64(&mut query, "length", length);
        self.http.get("/marketplace/identities/floor", &query).await
    }

    pub async fn identity_sale_history(&self, name: &str) -> Result<IdentitySaleHistoryResponse> {
        self.http
            .get(
                &format!("/marketplace/identities/{}/history", encode(name)),
                &[],
            )
            .await
    }

    pub async fn list_bids(&self, listing_id: &str) -> Result<BidsResponse> {
        self.http
            .get(
                &format!("/marketplace/identity-listings/{}/bids", encode(listing_id)),
                &[],
            )
            .await
    }

    pub async fn list_identities(
        &self,
        limit: Option<i64>,
        status: Option<&str>,
    ) -> Result<IdentitiesResponse> {
        let mut query = Vec::new();
        push_i64(&mut query, "limit", limit);
        push_opt(&mut query, "status", status);
        self.http
            .get("/marketplace/identity-listings", &query)
            .await
    }

    pub async fn list_offers(&self, params: Option<&OfferQueryParams>) -> Result<OffersResponse> {
        self.http
            .get("/marketplace/identity-offers", &offer_query(params))
            .await
    }

    pub async fn recent(&self) -> Result<RecentSalesResponse> {
        self.http.get("/marketplace/recent", &[]).await
    }

    pub async fn buy_product(
        &self,
        product_id: &str,
        request: ProductBuyRequest,
    ) -> Result<serde_json::Value> {
        self.http
            .post_directory_auth(
                &format!("/marketplace/products/{}/buy", encode(product_id)),
                Some(&request),
            )
            .await
    }

    pub async fn buy_identity_listing(
        &self,
        listing_id: &str,
        request: IdentityBuyRequest,
    ) -> Result<serde_json::Value> {
        self.http
            .post_directory_auth(
                &format!("/marketplace/identity-listings/{}/buy", encode(listing_id)),
                Some(&request),
            )
            .await
    }

    pub async fn place_bid_with_payment(
        &self,
        listing_id: &str,
        bid: IdentityBid,
        _options: IdentityBidPaymentOptions,
    ) -> Result<IdentityBidResult> {
        self.http
            .post_directory_auth(
                &format!("/marketplace/identity-listings/{}/bids", encode(listing_id)),
                Some(&bid),
            )
            .await
    }

    pub async fn create_offer_with_payment(
        &self,
        offer: crate::types::IdentityOffer,
        _options: IdentityOfferPaymentOptions,
    ) -> Result<IdentityOfferResult> {
        self.http
            .post_directory_auth("/marketplace/identity-offers", Some(&offer))
            .await
    }

    pub async fn browse_marketplace(
        &self,
        params: Option<&ProductQueryParams>,
    ) -> Result<ProductsResponse> {
        self.list_products(params).await
    }

    pub async fn categories(&self) -> Result<CategoriesResponse> {
        self.http.get("/marketplace/categories", &[]).await
    }

    pub async fn featured(&self) -> Result<FeaturedResponse> {
        self.http.get("/marketplace/featured", &[]).await
    }

    pub async fn get_product(&self, product_id: &str) -> Result<Product> {
        self.http
            .get(
                &format!("/marketplace/products/{}", encode(product_id)),
                &[],
            )
            .await
    }

    pub async fn list_product_reviews(&self, product_id: &str) -> Result<ProductReviewsResponse> {
        self.http
            .get(
                &format!("/marketplace/products/{}/reviews", encode(product_id)),
                &[],
            )
            .await
    }

    pub async fn list_products(
        &self,
        params: Option<&ProductQueryParams>,
    ) -> Result<ProductsResponse> {
        self.http
            .get("/marketplace/products", &product_query(params))
            .await
    }
}

fn product_query(params: Option<&ProductQueryParams>) -> Vec<(String, String)> {
    let mut query = Vec::new();
    if let Some(p) = params {
        push_opt(&mut query, "q", p.q.as_deref());
        push_opt(&mut query, "category", p.category.as_deref());
        push_opt(&mut query, "seller", p.seller.as_deref());
        push_opt(&mut query, "status", p.status.as_deref());
        push_i64(&mut query, "limit", p.limit);
        push_i64(&mut query, "offset", p.offset);
    }
    query
}

fn offer_query(params: Option<&OfferQueryParams>) -> Vec<(String, String)> {
    let mut query = Vec::new();
    if let Some(p) = params {
        push_opt(&mut query, "name", p.name.as_deref());
        push_opt(&mut query, "buyer", p.buyer.as_deref());
        push_opt(&mut query, "status", p.status.as_deref());
        push_i64(&mut query, "limit", p.limit);
        push_i64(&mut query, "offset", p.offset);
    }
    query
}

fn push_opt(query: &mut Vec<(String, String)>, key: &str, value: Option<&str>) {
    if let Some(value) = value {
        query.push((key.to_string(), value.to_string()));
    }
}

fn push_i64(query: &mut Vec<(String, String)>, key: &str, value: Option<i64>) {
    if let Some(value) = value {
        query.push((key.to_string(), value.to_string()));
    }
}
