//! Marketplace API. Mirrors `sdk/typescript/src/api/marketplace.ts`.
//!
//! Covers products, identity listings, bids, offers, sales and browsing. The
//! on-chain Solana execution variants (`*WithSolanaPayment`) are intentionally
//! omitted from this port; only the plain REST methods and the x402
//! payment-map-building methods are provided.

use rand::RngCore as _;

use crate::auth::sign_fresh_canonical_payload;
use crate::crypto::canonical_payload;
use crate::error::{Error, Result};
use crate::http::HttpClient;
use crate::types::{
    IdentityBid, IdentityBuyRequest, IdentityFloor, IdentityListing, IdentityOffer,
    IdentityOfferAcceptRequest, IdentitySale, MarketplaceBrowseResponse, MarketplaceCategory,
    MarketplacePrice, Product, ProductBuyRequest, ProductCreateRequest, ProductPurchase,
    ProductQueryParams, ProductReview,
};
use crate::x402::{build_x402_payment_map, X402PaymentAuthorizationOptions, X402PaymentMap};

/// Options for building an x402 payment map alongside an identity offer.
#[derive(Debug, Clone, Default)]
pub struct IdentityOfferPaymentOptions {
    pub nonce: Option<String>,
    pub expires_at: Option<String>,
    pub expires_in_ms: Option<i64>,
    pub metadata: Option<std::collections::HashMap<String, String>>,
}

/// Result of creating an identity offer with a built x402 payment map.
#[derive(Debug, Clone)]
pub struct IdentityOfferPaymentResult {
    pub offer: IdentityOffer,
    pub payment: X402PaymentMap,
}

/// Options for building an x402 payment map alongside an identity bid.
#[derive(Debug, Clone, Default)]
pub struct IdentityBidPaymentOptions {
    pub nonce: Option<String>,
    pub expires_at: Option<String>,
    pub expires_in_ms: Option<i64>,
    pub metadata: Option<std::collections::HashMap<String, String>>,
    pub listing: Option<IdentityListing>,
}

/// Result of placing an identity bid with a built x402 payment map.
#[derive(Debug, Clone)]
pub struct IdentityBidPaymentResult {
    pub listing: IdentityListing,
    pub updated_listing: IdentityListing,
    pub payment: X402PaymentMap,
}

/// The marketplace namespace of the API.
#[derive(Clone)]
pub struct MarketplaceApi {
    http: HttpClient,
}

impl MarketplaceApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    // --- Products ---

    /// List products, optionally filtered by [`ProductQueryParams`].
    pub async fn list_products(
        &self,
        params: Option<&ProductQueryParams>,
    ) -> Result<ProductsResponse> {
        let query = product_query(params);
        self.http.get("/marketplace/products", &query).await
    }

    /// Create a product listing. Signs the canonical payload when a signer is
    /// configured and the request is not already signed.
    pub async fn create_product(&self, mut product: ProductCreateRequest) -> Result<Product> {
        if let Some(signer) = self.http.signer() {
            if product.signature.is_none() {
                if product.product_id.is_none() {
                    product.product_id = Some(next_marketplace_id("prod"));
                }
                let payload = product_signature_payload_create(&product);
                product.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
                if product.signer_public_key.is_none() {
                    product.signer_public_key = self.http.signing_public_key();
                }
            }
        }

        if let Some(seller) = product.seller.clone() {
            return self
                .http
                .post_directory_auth_as("/marketplace/products", &seller, Some(&product))
                .await;
        }
        self.http
            .post_directory_auth("/marketplace/products", Some(&product))
            .await
    }

    /// Fetch a single product by id.
    pub async fn get_product(&self, product_id: &str) -> Result<Product> {
        let path = format!("/marketplace/products/{}", crate::util::encode(product_id));
        self.http.get(&path, &[]).await
    }

    /// Update a product listing.
    pub async fn update_product(&self, product_id: &str, mut update: Product) -> Result<Product> {
        if let Some(signer) = self.http.signer() {
            if update.signature.is_none() {
                let payload = product_signature_payload(&update);
                update.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
                if update.signer_public_key.is_none() {
                    update.signer_public_key = self.http.signing_public_key();
                }
            }
        }

        let path = format!("/marketplace/products/{}", crate::util::encode(product_id));
        if !update.seller.is_empty() {
            return self
                .http
                .put_directory_auth_as(&path, &update.seller, Some(&update))
                .await;
        }
        self.http.put_directory_auth(&path, Some(&update)).await
    }

    /// Delete a product listing.
    pub async fn delete_product(&self, product_id: &str) -> Result<()> {
        let encoded = crate::util::encode(product_id);
        match self.http.signer() {
            None => {
                let path = format!("/marketplace/products/{encoded}");
                self.http
                    .delete_directory_auth::<(), serde_json::Value>(&path, None)
                    .await
            }
            Some(signer) => {
                let payload = product_delete_signature_payload(product_id);
                let signature = sign_fresh_canonical_payload(signer.as_ref(), &payload).await?;
                let path = format!(
                    "/marketplace/products/{encoded}?signature={}{}",
                    crate::util::encode(&signature),
                    marketplace_signer_query(self.http.signing_public_key().as_deref()),
                );
                self.http.delete::<(), serde_json::Value>(&path, None).await
            }
        }
    }

    /// Buy a product.
    pub async fn buy_product(
        &self,
        product_id: &str,
        request: ProductBuyRequest,
    ) -> Result<ProductPurchase> {
        let path = format!(
            "/marketplace/products/{}/buy",
            crate::util::encode(product_id)
        );
        // The buyer @handle is a resolution hint only. When absent, the buyer is
        // a handle-free wallet and the actor defaults to the connected signing
        // key.
        if let Some(buyer) = request.buyer.clone() {
            return self
                .http
                .post_directory_auth_as(&path, &buyer, Some(&request))
                .await;
        }
        self.http.post_directory_auth(&path, Some(&request)).await
    }

    /// Fetch the raw download response for a purchased product.
    pub async fn download_product(
        &self,
        product_id: &str,
        purchase_id: &str,
        actor_id: Option<&str>,
    ) -> Result<reqwest::Response> {
        let path = format!(
            "/marketplace/products/{}/download/{}",
            crate::util::encode(product_id),
            crate::util::encode(purchase_id),
        );
        match actor_id {
            Some(actor) => self.http.get_directory_auth_raw_as(&path, actor, &[]).await,
            None => self.http.get_directory_auth_raw(&path, &[]).await,
        }
    }

    /// Fetch the delivery payload for a product purchase.
    pub async fn get_product_delivery(
        &self,
        product_id: &str,
        purchase_id: &str,
        actor_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let path = format!(
            "/marketplace/products/{}/purchases/{}/delivery",
            crate::util::encode(product_id),
            crate::util::encode(purchase_id),
        );
        match actor_id {
            Some(actor) => self.http.get_directory_auth_as(&path, actor, &[]).await,
            None => self.http.get_directory_auth(&path, &[]).await,
        }
    }

    /// Update the delivery payload for a product purchase. When `actor_id` is
    /// not provided it defaults to a string `"actor"` field on `delivery`.
    pub async fn update_product_delivery(
        &self,
        product_id: &str,
        purchase_id: &str,
        delivery: serde_json::Value,
        actor_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let path = format!(
            "/marketplace/products/{}/purchases/{}/delivery",
            crate::util::encode(product_id),
            crate::util::encode(purchase_id),
        );
        let derived_actor = actor_id.map(str::to_string).or_else(|| {
            delivery
                .get("actor")
                .and_then(|v| v.as_str())
                .map(str::to_string)
        });
        match derived_actor {
            Some(actor) => {
                self.http
                    .post_directory_auth_as(&path, &actor, Some(&delivery))
                    .await
            }
            None => self.http.post_directory_auth(&path, Some(&delivery)).await,
        }
    }

    /// List the reviews for a product.
    pub async fn list_product_reviews(&self, product_id: &str) -> Result<ProductReviewsResponse> {
        let path = format!(
            "/marketplace/products/{}/reviews",
            crate::util::encode(product_id)
        );
        self.http.get(&path, &[]).await
    }

    /// Create a review for a product.
    pub async fn create_product_review(
        &self,
        product_id: &str,
        mut review: ProductReview,
    ) -> Result<ProductReview> {
        if let Some(signer) = self.http.signer() {
            if review.signature.is_none() {
                review.product_id = Some(product_id.to_string());
                if review.review_id.is_none() {
                    review.review_id = Some(next_marketplace_id("rev"));
                }
                let payload = product_review_signature_payload(&review);
                review.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
                if review.signer_public_key.is_none() {
                    review.signer_public_key = self.http.signing_public_key();
                }
            }
        }

        let path = format!(
            "/marketplace/products/{}/reviews",
            crate::util::encode(product_id)
        );
        if let Some(buyer) = review.buyer.clone() {
            return self
                .http
                .post_directory_auth_as(&path, &buyer, Some(&review))
                .await;
        }
        self.http.post(&path, Some(&review)).await
    }

    // --- Identity Listings ---

    /// List identity (`@handle`) listings.
    pub async fn list_identities(
        &self,
        limit: Option<i64>,
        status: Option<&str>,
    ) -> Result<IdentitiesResponse> {
        let mut query: Vec<(String, String)> = Vec::new();
        if let Some(limit) = limit {
            query.push(("limit".into(), limit.to_string()));
        }
        if let Some(status) = status {
            query.push(("status".into(), status.to_string()));
        }
        self.http.get("/marketplace/identities", &query).await
    }

    /// Create an identity listing.
    pub async fn create_identity_listing(
        &self,
        mut listing: IdentityListing,
    ) -> Result<IdentityListing> {
        if let Some(signer) = self.http.signer() {
            if listing.signature.is_none() {
                if listing.listing_id.is_none() {
                    listing.listing_id = Some(next_marketplace_id("listing"));
                }
                let payload = identity_listing_signature_payload(&listing);
                listing.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
                if listing.signer_public_key.is_none() {
                    listing.signer_public_key = self.http.signing_public_key();
                }
            }
        }

        if let Some(seller) = listing.seller.clone() {
            return self
                .http
                .post_directory_auth_as("/marketplace/identities", &seller, Some(&listing))
                .await;
        }
        self.http
            .post_directory_auth("/marketplace/identities", Some(&listing))
            .await
    }

    /// Delete (cancel) an identity listing.
    pub async fn delete_identity_listing(&self, listing_id: &str) -> Result<()> {
        let encoded = crate::util::encode(listing_id);
        match self.http.signer() {
            None => {
                let path = format!("/marketplace/identities/{encoded}");
                self.http
                    .delete_directory_auth::<(), serde_json::Value>(&path, None)
                    .await
            }
            Some(signer) => {
                let payload = identity_listing_cancel_signature_payload(listing_id);
                let signature = sign_fresh_canonical_payload(signer.as_ref(), &payload).await?;
                let path = format!(
                    "/marketplace/identities/{encoded}?signature={}{}",
                    crate::util::encode(&signature),
                    marketplace_signer_query(self.http.signing_public_key().as_deref()),
                );
                self.http.delete::<(), serde_json::Value>(&path, None).await
            }
        }
    }

    /// Buy an identity listing at its fixed price.
    pub async fn buy_identity_listing(
        &self,
        listing_id: &str,
        mut request: IdentityBuyRequest,
    ) -> Result<IdentitySale> {
        if let Some(signer) = self.http.signer() {
            if request.signature.is_none() {
                let payload = identity_buy_signature_payload(listing_id, &request);
                request.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
            }
        }

        let path = format!(
            "/marketplace/identities/{}/buy",
            crate::util::encode(listing_id)
        );
        if !request.buyer.is_empty() {
            return self
                .http
                .post_directory_auth_as(&path, &request.buyer, Some(&request))
                .await;
        }
        self.http.post_directory_auth(&path, Some(&request)).await
    }

    /// List the bids on an identity auction listing.
    pub async fn list_bids(&self, listing_id: &str) -> Result<BidsResponse> {
        let path = format!(
            "/marketplace/identities/{}/bids",
            crate::util::encode(listing_id)
        );
        self.http.get(&path, &[]).await
    }

    /// Place a bid on an identity auction listing.
    pub async fn place_bid(
        &self,
        listing_id: &str,
        mut bid: IdentityBid,
    ) -> Result<IdentityListing> {
        if let Some(signer) = self.http.signer() {
            if bid.signature.is_none() {
                bid.listing_id = Some(listing_id.to_string());
                if bid.bid_id.is_none() {
                    bid.bid_id = Some(next_marketplace_id("bid"));
                }
                let payload = identity_bid_signature_payload(&bid);
                bid.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
                if bid.signer_public_key.is_none() {
                    bid.signer_public_key = self.http.signing_public_key();
                }
            }
        }

        let path = format!(
            "/marketplace/identities/{}/bids",
            crate::util::encode(listing_id)
        );
        if let Some(bidder) = bid.bidder.clone() {
            return self
                .http
                .post_directory_auth_as(&path, &bidder, Some(&bid))
                .await;
        }
        self.http.post_directory_auth(&path, Some(&bid)).await
    }

    /// Place a bid, building and signing an x402 payment map for it. Mirrors the
    /// TS `placeBidWithSolanaPayment`, which only builds an x402 map (no on-chain
    /// transaction) and POSTs it.
    pub async fn place_bid_with_payment(
        &self,
        listing_id: &str,
        mut bid: IdentityBid,
        options: IdentityBidPaymentOptions,
    ) -> Result<IdentityBidPaymentResult> {
        let signer = self.http.signer().ok_or_else(|| {
            Error::InvalidArgument("placeBidWithPayment requires a signing key".into())
        })?;

        let bidder = bid.bidder.clone().ok_or_else(|| {
            Error::InvalidArgument("identity bid requires bidder and price.amount".into())
        })?;
        let price = bid
            .price
            .clone()
            .filter(|p| !p.amount.is_empty())
            .ok_or_else(|| {
                Error::InvalidArgument("identity bid requires bidder and price.amount".into())
            })?;

        let listing = match options.listing.clone() {
            Some(listing) => listing,
            None => self.identity_listing(listing_id).await?,
        };
        let bid_id = bid
            .bid_id
            .clone()
            .unwrap_or_else(|| next_marketplace_id("bid"));
        bid.bid_id = Some(bid_id.clone());
        bid.listing_id = Some(listing_id.to_string());

        let mut metadata = options.metadata.clone().unwrap_or_default();
        metadata.insert("bidId".into(), bid_id.clone());
        if let Some(name) = &listing.name {
            metadata.insert("identity".into(), name.clone());
        }
        metadata.insert("kind".into(), "identity-bid".into());
        metadata.insert("listingId".into(), listing_id.to_string());

        let payment = build_x402_payment_map(
            signer.as_ref(),
            X402PaymentAuthorizationOptions {
                scheme: Some("upto".into()),
                network: price.network.clone(),
                asset: price.asset.clone(),
                amount: price.amount.clone(),
                from: Some(bidder),
                to: listing.seller.clone().unwrap_or_default(),
                nonce: Some(
                    options
                        .nonce
                        .clone()
                        .unwrap_or_else(|| generate_marketplace_nonce("bid", &bid_id)),
                ),
                expires_at: options.expires_at.clone(),
                expires_in_ms: options.expires_in_ms,
                metadata: Some(metadata),
                public_key_base64: bid.bidder_public_key.clone(),
                ..Default::default()
            },
        )
        .await?;

        bid.payment = Some(payment.clone());
        let updated_listing = self.place_bid(listing_id, bid).await?;

        Ok(IdentityBidPaymentResult {
            listing,
            updated_listing,
            payment,
        })
    }

    /// Close an identity auction listing, settling the winning bid.
    pub async fn close_listing(
        &self,
        listing_id: &str,
        seller_id: Option<&str>,
        request: Option<&serde_json::Value>,
    ) -> Result<IdentitySale> {
        let path = format!(
            "/marketplace/identities/{}/close",
            crate::util::encode(listing_id)
        );
        match seller_id {
            Some(seller) => {
                self.http
                    .post_directory_auth_as(&path, seller, request)
                    .await
            }
            None => self.http.post_directory_auth(&path, request).await,
        }
    }

    /// Set a listing as the seller's default identity listing.
    pub async fn set_default_identity_listing(
        &self,
        listing_id: &str,
        request: Option<&serde_json::Value>,
        seller_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let path = format!(
            "/marketplace/identities/{}/default",
            crate::util::encode(listing_id)
        );
        match seller_id {
            Some(seller) => {
                self.http
                    .post_directory_auth_as(&path, seller, request)
                    .await
            }
            None => self.http.post_directory_auth(&path, request).await,
        }
    }

    /// Fetch the sale history for an identity name.
    pub async fn identity_sale_history(&self, name: &str) -> Result<IdentitySaleHistoryResponse> {
        let path = format!(
            "/marketplace/identities/history/{}",
            crate::util::encode(name)
        );
        self.http.get(&path, &[]).await
    }

    /// Fetch the floor price for identity names of a given length.
    pub async fn identity_floor(&self, length: Option<i64>) -> Result<IdentityFloor> {
        let mut query: Vec<(String, String)> = Vec::new();
        if let Some(length) = length {
            query.push(("length".into(), length.to_string()));
        }
        self.http.get("/marketplace/identities/floor", &query).await
    }

    // --- Offers ---

    /// List pending identity offers. Filter by `name` (the @handle an offer
    /// targets) or `buyer` (a buyer reviewing their own outstanding offers). The
    /// locked x402 payment authorization is redacted server-side, so listed
    /// offers never carry the signed credential.
    pub async fn list_offers(&self, params: Option<&OfferQueryParams>) -> Result<OffersResponse> {
        let query = offer_query(params);
        self.http.get("/marketplace/offers", &query).await
    }

    /// Create an identity offer.
    pub async fn create_offer(&self, mut offer: IdentityOffer) -> Result<IdentityOffer> {
        if let Some(signer) = self.http.signer() {
            if offer.signature.is_none() {
                if offer.offer_id.is_none() {
                    offer.offer_id = Some(next_marketplace_id("offer"));
                }
                let payload = identity_offer_signature_payload(&offer);
                offer.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
                if offer.signer_public_key.is_none() {
                    offer.signer_public_key = self.http.signing_public_key();
                }
            }
        }

        if let Some(buyer) = offer.buyer.clone() {
            return self
                .http
                .post_directory_auth_as("/marketplace/offers", &buyer, Some(&offer))
                .await;
        }
        self.http
            .post_directory_auth("/marketplace/offers", Some(&offer))
            .await
    }

    /// Create an identity offer, building and signing an x402 payment map for
    /// it. Mirrors the TS `createOfferWithSolanaPayment`, which only builds an
    /// x402 map (no on-chain transaction) and POSTs it.
    pub async fn create_offer_with_payment(
        &self,
        mut offer: IdentityOffer,
        options: IdentityOfferPaymentOptions,
    ) -> Result<IdentityOfferPaymentResult> {
        let signer = self.http.signer().ok_or_else(|| {
            Error::InvalidArgument("createOfferWithPayment requires a signing key".into())
        })?;

        let buyer = offer.buyer.clone().filter(|b| !b.is_empty());
        let name = offer.name.clone().filter(|n| !n.is_empty());
        let price = offer.price.clone().filter(|p| !p.amount.is_empty());
        let (buyer, name, price) = match (buyer, name, price) {
            (Some(buyer), Some(name), Some(price)) => (buyer, name, price),
            _ => {
                return Err(Error::InvalidArgument(
                    "identity offer requires buyer, name, and price.amount".into(),
                ))
            }
        };

        let offer_id = offer
            .offer_id
            .clone()
            .unwrap_or_else(|| next_marketplace_id("offer"));
        offer.offer_id = Some(offer_id.clone());

        let mut metadata = options.metadata.clone().unwrap_or_default();
        metadata.insert("kind".into(), "identity-offer".into());
        metadata.insert("name".into(), name.clone());
        metadata.insert("offerId".into(), offer_id.clone());

        let payment = build_x402_payment_map(
            signer.as_ref(),
            X402PaymentAuthorizationOptions {
                scheme: Some("upto".into()),
                network: price.network.clone(),
                asset: price.asset.clone(),
                amount: price.amount.clone(),
                from: Some(buyer),
                to: name,
                nonce: Some(
                    options
                        .nonce
                        .clone()
                        .unwrap_or_else(|| generate_marketplace_nonce("offer", &offer_id)),
                ),
                expires_at: options.expires_at.clone(),
                expires_in_ms: options.expires_in_ms,
                metadata: Some(metadata),
                public_key_base64: offer.buyer_public_key.clone(),
                ..Default::default()
            },
        )
        .await?;

        offer.payment = Some(payment.clone());
        let created = self.create_offer(offer).await?;

        Ok(IdentityOfferPaymentResult {
            offer: created,
            payment,
        })
    }

    /// Cancel an identity offer.
    pub async fn cancel_offer(&self, offer_id: &str) -> Result<()> {
        let encoded = crate::util::encode(offer_id);
        match self.http.signer() {
            None => {
                let path = format!("/marketplace/offers/{encoded}");
                self.http
                    .delete_directory_auth::<(), serde_json::Value>(&path, None)
                    .await
            }
            Some(signer) => {
                let payload = identity_offer_cancel_signature_payload(offer_id);
                let signature = sign_fresh_canonical_payload(signer.as_ref(), &payload).await?;
                let path = format!(
                    "/marketplace/offers/{encoded}?signature={}{}",
                    crate::util::encode(&signature),
                    marketplace_signer_query(self.http.signing_public_key().as_deref()),
                );
                self.http.delete::<(), serde_json::Value>(&path, None).await
            }
        }
    }

    /// Accept an identity offer.
    pub async fn accept_offer(
        &self,
        offer_id: &str,
        mut request: IdentityOfferAcceptRequest,
    ) -> Result<IdentitySale> {
        if let Some(signer) = self.http.signer() {
            if request.signature.is_none() {
                let payload = identity_offer_accept_signature_payload(offer_id, &request.seller);
                request.signature =
                    Some(sign_fresh_canonical_payload(signer.as_ref(), &payload).await?);
            }
        }

        let path = format!(
            "/marketplace/offers/{}/accept",
            crate::util::encode(offer_id)
        );
        if !request.seller.is_empty() {
            return self
                .http
                .post_directory_auth_as(&path, &request.seller, Some(&request))
                .await;
        }
        self.http.post_directory_auth(&path, Some(&request)).await
    }

    // --- Browsing ---

    /// Browse the combined marketplace (products + identity listings).
    pub async fn browse_marketplace(
        &self,
        params: Option<&ProductQueryParams>,
    ) -> Result<MarketplaceBrowseResponse> {
        let query = product_query(params);
        self.http.get("/marketplace", &query).await
    }

    /// List marketplace categories.
    pub async fn categories(&self) -> Result<CategoriesResponse> {
        self.http.get("/marketplace/categories", &[]).await
    }

    /// List featured marketplace items.
    pub async fn featured(&self) -> Result<FeaturedResponse> {
        self.http.get("/marketplace/featured", &[]).await
    }

    /// List recent identity sales.
    pub async fn recent(&self) -> Result<RecentSalesResponse> {
        self.http.get("/marketplace/recent", &[]).await
    }

    // --- internal ---

    async fn identity_listing(&self, listing_id: &str) -> Result<IdentityListing> {
        let listings = self.list_identities(None, None).await?;
        listings
            .identities
            .into_iter()
            .find(|candidate| candidate.listing_id.as_deref() == Some(listing_id))
            .ok_or_else(|| {
                Error::InvalidArgument(format!("Identity listing not found: {listing_id}"))
            })
    }

    /// Stream the marketplace over WebSocket (directory-authenticated).
    pub fn stream(
        &self,
        agent_id: &str,
        limit: Option<i64>,
    ) -> crate::websocket::TinyPlaceWebSocket {
        let mut query: Vec<(&str, String)> = vec![("X-Agent-ID", agent_id.to_string())];
        if let Some(limit) = limit {
            query.push(("limit", limit.to_string()));
        }
        self.http.websocket(
            &crate::util::append_query("/marketplace/stream", &query),
            true,
        )
    }
}

// --- response wrappers ------------------------------------------------------

/// `{ products }` response wrapper.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ProductsResponse {
    pub products: Vec<Product>,
}

/// `{ reviews }` response wrapper.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ProductReviewsResponse {
    pub reviews: Vec<ProductReview>,
}

/// `{ identities }` response wrapper.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct IdentitiesResponse {
    pub identities: Vec<IdentityListing>,
}

/// `{ bids }` response wrapper.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct BidsResponse {
    pub bids: Vec<IdentityBid>,
}

/// `{ offers }` response wrapper.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct OffersResponse {
    pub offers: Vec<IdentityOffer>,
}

/// `{ history }` response wrapper for identity sale history.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct IdentitySaleHistoryResponse {
    pub history: Option<Vec<IdentitySale>>,
}

/// `{ categories }` response wrapper.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct CategoriesResponse {
    pub categories: Vec<MarketplaceCategory>,
}

/// `{ items }` response wrapper for featured items.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct FeaturedResponse {
    pub items: Vec<serde_json::Value>,
}

/// `{ sales }` response wrapper for recent sales.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct RecentSalesResponse {
    pub sales: Vec<IdentitySale>,
}

/// Query params for [`MarketplaceApi::list_offers`].
#[derive(Debug, Clone, Default)]
pub struct OfferQueryParams {
    pub name: Option<String>,
    pub buyer: Option<String>,
    pub agent: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// --- identity-bidding helpers (port of identity-bidding.ts) -----------------

/// Compares two base-unit amount strings. Returns -1 if `a < b`, 0 if equal, 1
/// if `a > b`. Mirrors the backend's `store.CompareAmount`.
pub fn compare_amount(a: &str, b: &str) -> i32 {
    let left = a.parse::<i128>();
    let right = b.parse::<i128>();
    match (left, right) {
        (Ok(left), Ok(right)) => left.cmp(&right) as i32,
        _ => 0,
    }
}

/// Returns `amount` increased by 5%, rounded up, in base units — the backend's
/// minimum bid increment (`store.FivePercentIncrement`: `(amount*105 + 99) / 100`).
pub fn five_percent_increment(amount: &str) -> String {
    match amount.parse::<i128>() {
        Ok(value) => ((value * 105 + 99) / 100).to_string(),
        Err(_) => amount.to_string(),
    }
}

/// The minimum acceptable next bid for an identity auction listing, in base
/// units — the start price (or reserve, whichever is higher), then 5% above the
/// standing high bid. Matches the backend's `CreateIdentityBid` validation.
pub fn minimum_identity_bid(listing: &IdentityListing) -> String {
    let mut minimum = listing
        .price
        .as_ref()
        .map(|p| p.amount.clone())
        .unwrap_or_default();
    if let Some(reserve) = &listing.reserve_price {
        if compare_amount(&reserve.amount, &minimum) > 0 {
            minimum = reserve.amount.clone();
        }
    }
    if let Some(highest) = &listing.highest_bid {
        if let Some(price) = &highest.price {
            minimum = five_percent_increment(&price.amount);
        }
    }
    minimum
}

// --- canonical signature payloads -------------------------------------------

fn price_json(price: &Option<MarketplacePrice>) -> serde_json::Value {
    match price {
        Some(price) => serde_json::to_value(price).unwrap_or(serde_json::Value::Null),
        None => serde_json::Value::Null,
    }
}

fn product_signature_payload_create(product: &ProductCreateRequest) -> String {
    canonical_payload(
        "marketplace.product",
        serde_json::json!({
            "category": product.category,
            "deliveryMethod": product.delivery_method,
            "description": product.description,
            "name": product.name,
            "price": serde_json::to_value(&product.price).unwrap_or(serde_json::Value::Null),
            "productId": product.product_id.clone().unwrap_or_default(),
            "seller": product.seller.clone().unwrap_or_default(),
            "sellerCryptoId": product.seller_crypto_id.clone().unwrap_or_default(),
            "stock": product.stock,
            "tags": product.tags,
        }),
    )
}

fn product_signature_payload(product: &Product) -> String {
    canonical_payload(
        "marketplace.product",
        serde_json::json!({
            "category": product.category,
            "deliveryMethod": product.delivery_method,
            "description": product.description,
            "name": product.name,
            "price": serde_json::to_value(&product.price).unwrap_or(serde_json::Value::Null),
            "productId": product.product_id,
            "seller": product.seller,
            "sellerCryptoId": product.seller_crypto_id,
            "stock": product.stock,
            "tags": product.tags,
        }),
    )
}

fn product_delete_signature_payload(product_id: &str) -> String {
    canonical_payload(
        "marketplace.product.delete",
        serde_json::json!({ "productId": product_id }),
    )
}

fn product_review_signature_payload(review: &ProductReview) -> String {
    canonical_payload(
        "marketplace.product.review",
        serde_json::json!({
            "buyer": review.buyer.clone().unwrap_or_default(),
            "comment": review.comment.clone().unwrap_or_default(),
            "productId": review.product_id.clone().unwrap_or_default(),
            "rating": review.rating.unwrap_or(0.0),
            "reviewId": review.review_id.clone().unwrap_or_default(),
        }),
    )
}

fn identity_listing_signature_payload(listing: &IdentityListing) -> String {
    canonical_payload(
        "marketplace.identity.listing",
        serde_json::json!({
            "description": listing.description.clone().unwrap_or_default(),
            "listingId": listing.listing_id.clone().unwrap_or_default(),
            "listingType": listing.listing_type.clone().unwrap_or_default(),
            "name": listing.name.clone().unwrap_or_default(),
            "price": price_json(&listing.price),
            "seller": listing.seller.clone().unwrap_or_default(),
            "sellerCryptoId": listing.seller_crypto_id.clone().unwrap_or_default(),
            "tags": listing.tags,
        }),
    )
}

fn identity_listing_cancel_signature_payload(listing_id: &str) -> String {
    canonical_payload(
        "marketplace.identity.listing.cancel",
        serde_json::json!({ "listingId": listing_id }),
    )
}

fn identity_buy_signature_payload(listing_id: &str, request: &IdentityBuyRequest) -> String {
    canonical_payload(
        "marketplace.identity.buy",
        serde_json::json!({
            "buyer": request.buyer,
            "buyerCryptoId": request.buyer_crypto_id,
            "buyerPublicKey": request.buyer_public_key.clone().unwrap_or_default(),
            "listingId": listing_id,
        }),
    )
}

fn identity_bid_signature_payload(bid: &IdentityBid) -> String {
    canonical_payload(
        "marketplace.identity.bid",
        serde_json::json!({
            "bidId": bid.bid_id.clone().unwrap_or_default(),
            "bidder": bid.bidder.clone().unwrap_or_default(),
            "bidderCryptoId": bid.bidder_crypto_id.clone().unwrap_or_default(),
            "bidderPublicKey": bid.bidder_public_key.clone().unwrap_or_default(),
            "listingId": bid.listing_id.clone().unwrap_or_default(),
            "price": price_json(&bid.price),
        }),
    )
}

fn identity_offer_signature_payload(offer: &IdentityOffer) -> String {
    canonical_payload(
        "marketplace.identity.offer",
        serde_json::json!({
            "buyer": offer.buyer.clone().unwrap_or_default(),
            "buyerCryptoId": offer.buyer_crypto_id.clone().unwrap_or_default(),
            "buyerPublicKey": offer.buyer_public_key.clone().unwrap_or_default(),
            "listingId": offer.listing_id.clone().unwrap_or_default(),
            "name": offer.name.clone().unwrap_or_default(),
            "offerId": offer.offer_id.clone().unwrap_or_default(),
            "price": price_json(&offer.price),
        }),
    )
}

fn identity_offer_cancel_signature_payload(offer_id: &str) -> String {
    canonical_payload(
        "marketplace.identity.offer.cancel",
        serde_json::json!({ "offerId": offer_id }),
    )
}

fn identity_offer_accept_signature_payload(offer_id: &str, seller: &str) -> String {
    canonical_payload(
        "marketplace.identity.offer.accept",
        serde_json::json!({ "offerId": offer_id, "seller": seller }),
    )
}

// --- query helpers ----------------------------------------------------------

fn product_query(params: Option<&ProductQueryParams>) -> Vec<(String, String)> {
    let mut query: Vec<(String, String)> = Vec::new();
    let Some(params) = params else {
        return query;
    };
    if let Some(q) = &params.q {
        query.push(("q".into(), q.clone()));
    }
    if let Some(value) = &params.r#type {
        query.push(("type".into(), value.clone()));
    }
    if let Some(category) = &params.category {
        query.push(("category".into(), category.clone()));
    }
    if let Some(tags) = &params.tags {
        for tag in tags {
            query.push(("tags".into(), tag.clone()));
        }
    }
    if let Some(seller) = &params.seller {
        query.push(("seller".into(), seller.clone()));
    }
    if let Some(min_price) = &params.min_price {
        query.push(("minPrice".into(), min_price.clone()));
    }
    if let Some(max_price) = &params.max_price {
        query.push(("maxPrice".into(), max_price.clone()));
    }
    if let Some(sort_by) = &params.sort_by {
        query.push(("sortBy".into(), sort_by.clone()));
    }
    if let Some(limit) = params.limit {
        query.push(("limit".into(), limit.to_string()));
    }
    if let Some(offset) = params.offset {
        query.push(("offset".into(), offset.to_string()));
    }
    query
}

fn offer_query(params: Option<&OfferQueryParams>) -> Vec<(String, String)> {
    let mut query: Vec<(String, String)> = Vec::new();
    let Some(params) = params else {
        return query;
    };
    if let Some(name) = &params.name {
        query.push(("name".into(), name.clone()));
    }
    if let Some(buyer) = &params.buyer {
        query.push(("buyer".into(), buyer.clone()));
    }
    if let Some(agent) = &params.agent {
        query.push(("agent".into(), agent.clone()));
    }
    if let Some(status) = &params.status {
        query.push(("status".into(), status.clone()));
    }
    if let Some(limit) = params.limit {
        query.push(("limit".into(), limit.to_string()));
    }
    if let Some(offset) = params.offset {
        query.push(("offset".into(), offset.to_string()));
    }
    query
}

// --- id / nonce generation --------------------------------------------------

/// Builds the optional `&signerPublicKey=` query suffix for body-less requests,
/// presenting the signing key. Empty when there is no presented key.
fn marketplace_signer_query(signer_public_key: Option<&str>) -> String {
    match signer_public_key {
        Some(key) => format!("&signerPublicKey={}", crate::util::encode(key)),
        None => String::new(),
    }
}

fn next_marketplace_id(prefix: &str) -> String {
    let mut random = [0u8; 6];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let suffix = to_hex(&random);
    let now_ms = chrono::Utc::now().timestamp_millis().max(0) as u64;
    let timestamp = radix36(now_ms);
    format!("{prefix}_{timestamp}_{suffix}")
}

fn generate_marketplace_nonce(kind: &str, id: &str) -> String {
    let mut random = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let suffix = to_hex(&random);
    format!("{kind}_{id}_{suffix}")
}

fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// Base-36 encoding, matching JavaScript's `Number.prototype.toString(36)`.
fn radix36(mut value: u64) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if value == 0 {
        return "0".to_string();
    }
    let mut buf = Vec::new();
    while value > 0 {
        buf.push(DIGITS[(value % 36) as usize]);
        value /= 36;
    }
    buf.reverse();
    String::from_utf8(buf).expect("base36 digits are ascii")
}
