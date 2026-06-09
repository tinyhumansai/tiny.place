use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_body, to_query};
use crate::types::{
    IdentityBid, IdentityListing, IdentityOffer, IdentitySale, LedgerTransaction,
    MarketplaceCategory, Product, ProductCreateRequest, ProductQueryParams, ProductReview,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductListResponse {
    pub products: Vec<Product>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewListResponse {
    pub reviews: Vec<ProductReview>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityListingListResponse {
    pub listings: Vec<IdentityListing>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BidListResponse {
    pub bids: Vec<IdentityBid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleHistoryResponse {
    pub sales: Vec<IdentitySale>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FloorResponse {
    pub floor_price: String,
    pub asset_per_length: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryListResponse {
    pub categories: Vec<MarketplaceCategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeaturedResponse {
    pub featured: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentResponse {
    pub recent: Vec<IdentitySale>,
}

pub struct MarketplaceApi {
    http: Arc<HttpClient>,
}

impl MarketplaceApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn list_products(
        &self,
        params: Option<&ProductQueryParams>,
    ) -> Result<ProductListResponse> {
        let query = params.map(to_query).transpose()?;
        self.http
            .get("/marketplace/products", query.as_ref())
            .await
    }

    pub async fn create_product(&self, product: &ProductCreateRequest) -> Result<Product> {
        self.http
            .post("/marketplace/products", Some(&to_body(product)?))
            .await
    }

    pub async fn get_product(&self, product_id: &str) -> Result<Product> {
        let path = format!(
            "/marketplace/products/{}",
            urlencoding::encode(product_id)
        );
        self.http.get(&path, None).await
    }

    pub async fn update_product(
        &self,
        product_id: &str,
        update: &serde_json::Value,
    ) -> Result<Product> {
        let path = format!(
            "/marketplace/products/{}",
            urlencoding::encode(product_id)
        );
        self.http.put(&path, Some(update)).await
    }

    pub async fn delete_product(&self, product_id: &str) -> Result<()> {
        let path = format!(
            "/marketplace/products/{}",
            urlencoding::encode(product_id)
        );
        self.http.delete(&path, None).await
    }

    pub async fn buy_product(
        &self,
        product_id: &str,
        payment: &HashMap<String, String>,
    ) -> Result<LedgerTransaction> {
        let path = format!(
            "/marketplace/products/{}/buy",
            urlencoding::encode(product_id)
        );
        self.http.post(&path, Some(&to_body(payment)?)).await
    }

    pub async fn download_product(
        &self,
        product_id: &str,
        purchase_id: &str,
    ) -> Result<serde_json::Value> {
        let path = format!(
            "/marketplace/products/{}/download/{}",
            urlencoding::encode(product_id),
            urlencoding::encode(purchase_id)
        );
        self.http.get_auth(&path, None).await
    }

    pub async fn list_product_reviews(
        &self,
        product_id: &str,
    ) -> Result<ReviewListResponse> {
        let path = format!(
            "/marketplace/products/{}/reviews",
            urlencoding::encode(product_id)
        );
        self.http.get(&path, None).await
    }

    pub async fn create_product_review(
        &self,
        product_id: &str,
        review: &serde_json::Value,
    ) -> Result<ProductReview> {
        let path = format!(
            "/marketplace/products/{}/reviews",
            urlencoding::encode(product_id)
        );
        self.http.post(&path, Some(review)).await
    }

    pub async fn list_identities(
        &self,
        limit: Option<u32>,
        status: Option<&str>,
    ) -> Result<IdentityListingListResponse> {
        let mut query = serde_json::Map::new();
        if let Some(l) = limit {
            query.insert("limit".into(), serde_json::json!(l));
        }
        if let Some(s) = status {
            query.insert("status".into(), serde_json::json!(s));
        }
        let q = if query.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(query))
        };
        self.http.get("/marketplace/identities", q.as_ref()).await
    }

    pub async fn create_identity_listing(
        &self,
        listing: &serde_json::Value,
    ) -> Result<IdentityListing> {
        self.http
            .post("/marketplace/identities", Some(listing))
            .await
    }

    pub async fn delete_identity_listing(&self, listing_id: &str) -> Result<()> {
        let path = format!(
            "/marketplace/identities/{}",
            urlencoding::encode(listing_id)
        );
        self.http.delete(&path, None).await
    }

    pub async fn buy_identity_listing(
        &self,
        listing_id: &str,
        payment: &HashMap<String, String>,
    ) -> Result<LedgerTransaction> {
        let path = format!(
            "/marketplace/identities/{}/buy",
            urlencoding::encode(listing_id)
        );
        self.http.post(&path, Some(&to_body(payment)?)).await
    }

    pub async fn list_bids(&self, listing_id: &str) -> Result<BidListResponse> {
        let path = format!(
            "/marketplace/identities/{}/bids",
            urlencoding::encode(listing_id)
        );
        self.http.get(&path, None).await
    }

    pub async fn place_bid(
        &self,
        listing_id: &str,
        bid: &serde_json::Value,
    ) -> Result<IdentityBid> {
        let path = format!(
            "/marketplace/identities/{}/bids",
            urlencoding::encode(listing_id)
        );
        self.http.post(&path, Some(bid)).await
    }

    pub async fn close_listing(&self, listing_id: &str) -> Result<IdentitySale> {
        let path = format!(
            "/marketplace/identities/{}/close",
            urlencoding::encode(listing_id)
        );
        self.http.post(&path, None).await
    }

    pub async fn identity_sale_history(&self, name: &str) -> Result<SaleHistoryResponse> {
        let path = format!(
            "/marketplace/identities/history/{}",
            urlencoding::encode(name)
        );
        self.http.get(&path, None).await
    }

    pub async fn identity_floor(&self, length: Option<u32>) -> Result<FloorResponse> {
        let query = length.map(|l| serde_json::json!({ "length": l }));
        self.http
            .get("/marketplace/identities/floor", query.as_ref())
            .await
    }

    pub async fn create_offer(
        &self,
        offer: &serde_json::Value,
    ) -> Result<IdentityOffer> {
        self.http.post("/marketplace/offers", Some(offer)).await
    }

    pub async fn cancel_offer(&self, offer_id: &str) -> Result<()> {
        let path = format!(
            "/marketplace/offers/{}",
            urlencoding::encode(offer_id)
        );
        self.http.delete(&path, None).await
    }

    pub async fn accept_offer(&self, offer_id: &str) -> Result<IdentitySale> {
        let path = format!(
            "/marketplace/offers/{}/accept",
            urlencoding::encode(offer_id)
        );
        self.http.post(&path, None).await
    }

    pub async fn categories(&self) -> Result<CategoryListResponse> {
        self.http.get("/marketplace/categories", None).await
    }

    pub async fn featured(&self) -> Result<FeaturedResponse> {
        self.http.get("/marketplace/featured", None).await
    }

    pub async fn recent(&self) -> Result<RecentResponse> {
        self.http.get("/marketplace/recent", None).await
    }
}
