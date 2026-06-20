import type { HttpClient } from "../http.js";
import type { SigningKey } from "../auth.js";
import { signFreshCanonicalPayload } from "../auth.js";
import { canonicalPayload } from "../crypto.js";
import {
  buildX402PaymentMap,
  type X402PaymentMap,
  type X402PaymentMapOptions,
} from "../x402.js";
import {
  executeSolanaX402Payment,
  SOLANA_USDC_MINT,
  type SolanaX402PaymentExecution,
  type SolanaX402PaymentExecutionOptions,
} from "../solana.js";
import type { TinyPlaceWebSocket } from "../websocket.js";
import type {
  IdentityBid,
  IdentityBuyRequest,
  IdentityFloor,
  IdentityListing,
  IdentityOffer,
  IdentityOfferAcceptRequest,
  IdentitySale,
  MarketplaceBrowseResponse,
  MarketplaceCategory,
  Product,
  ProductBuyRequest,
  ProductCreateRequest,
  ProductPurchase,
  ProductQueryParams,
  ProductReview,
} from "../types/index.js";
import { listField } from "../safe.js";

export interface ProductSolanaPurchaseOptions
  extends Omit<SolanaX402PaymentExecutionOptions, "payment" | "signer"> {
  nonce?: string;
  expiresAt?: string;
  expiresInMs?: number;
  metadata?: Record<string, string>;
}

export interface ProductSolanaPurchaseResult {
  purchase: ProductPurchase;
  payment: SolanaX402PaymentExecution;
  product: Product;
}

export interface IdentitySolanaPurchaseOptions
  extends Omit<SolanaX402PaymentExecutionOptions, "payment" | "signer"> {
  nonce?: string;
  expiresAt?: string;
  expiresInMs?: number;
  metadata?: Record<string, string>;
}

export interface IdentitySolanaPurchaseResult {
  sale: IdentitySale;
  payment: SolanaX402PaymentExecution;
  listing: IdentityListing;
}

export interface IdentityOfferPaymentOptions
  extends Pick<
    X402PaymentMapOptions,
    "nonce" | "expiresAt" | "expiresInMs" | "metadata"
  > {}

export interface IdentityOfferPaymentResult {
  offer: IdentityOffer;
  payment: X402PaymentMap;
}

export interface IdentityBidPaymentOptions
  extends Pick<
    X402PaymentMapOptions,
    "nonce" | "expiresAt" | "expiresInMs" | "metadata"
  > {
  listing?: IdentityListing;
}

export interface IdentityBidPaymentResult {
  listing: IdentityListing;
  updatedListing: IdentityListing;
  payment: X402PaymentMap;
}

export class MarketplaceApi {
  constructor(
    private readonly http: HttpClient,
    private readonly signingKey?: SigningKey,
    private readonly wsFactory?: (
      path: string,
      options?: { directoryAuth?: boolean },
    ) => TinyPlaceWebSocket,
    private readonly publicKeyBase64?: string,
  ) {}

  // --- Products ---

  listProducts(
    params?: ProductQueryParams,
  ): Promise<{ products: Array<Product> }> {
    return this.http
      .get<{ products: Array<Product> | null }>(
        "/marketplace/products",
        params as Record<string, unknown>,
      )
      .then((result) => ({ products: listField<Product>(result, "products") }));
  }

  async createProduct(product: ProductCreateRequest): Promise<Product> {
    if (this.signingKey && !product.signature) {
      product = {
        ...product,
        productId: product.productId ?? nextMarketplaceId("prod"),
      };
      product.signature = await signFreshCanonicalPayload(
        this.signingKey,
        productSignaturePayload(product),
      );
      // Present the signer so the backend can authorize a delegated session key
      // (the signature above is verified against it). For the seller's own key
      // this is simply the registered key.
      product.signerPublicKey ??= this.publicKeyBase64;
    }

    if (product.seller) {
      return this.http.postDirectoryAuthAs<Product>(
        "/marketplace/products",
        product.seller,
        product,
      );
    }

    return this.http.postDirectoryAuth<Product>(
      "/marketplace/products",
      product,
    );
  }

  getProduct(productId: string): Promise<Product> {
    return this.http.get<Product>(
      `/marketplace/products/${encodeURIComponent(productId)}`,
    );
  }

  async updateProduct(productId: string, update: Product): Promise<Product> {
    if (this.signingKey && !update.signature) {
      update = {
        ...update,
        signature: await signFreshCanonicalPayload(
          this.signingKey,
          productSignaturePayload(update),
        ),
        signerPublicKey: update.signerPublicKey ?? this.publicKeyBase64,
      };
    }

    if (update.seller) {
      return this.http.putDirectoryAuthAs<Product>(
        `/marketplace/products/${encodeURIComponent(productId)}`,
        update.seller,
        update,
      );
    }

    return this.http.putDirectoryAuth<Product>(
      `/marketplace/products/${encodeURIComponent(productId)}`,
      update,
    );
  }

  async deleteProduct(productId: string): Promise<void> {
    if (!this.signingKey) {
      return this.http.deleteDirectoryAuth<void>(
        `/marketplace/products/${encodeURIComponent(productId)}`,
      );
    }

    const signature = await signFreshCanonicalPayload(
      this.signingKey,
      productDeleteSignaturePayload(productId),
    );
    return this.http.deletePublic<void>(
      `/marketplace/products/${encodeURIComponent(productId)}?signature=${encodeURIComponent(signature)}${marketplaceSignerQuery(this.publicKeyBase64)}`,
    );
  }

  buyProduct(
    productId: string,
    request: ProductBuyRequest,
  ): Promise<ProductPurchase> {
    const path = `/marketplace/products/${encodeURIComponent(productId)}/buy`;
    // The buyer @handle is a resolution hint only. When absent, the buyer is a
    // handle-free wallet and the actor defaults to the connected signing key.
    if (request.buyer) {
      return this.http.postDirectoryAuthAs<ProductPurchase>(
        path,
        request.buyer,
        request,
      );
    }
    return this.http.postDirectoryAuth<ProductPurchase>(path, request);
  }

  async buyProductWithSolanaPayment(
    productId: string,
    request: Omit<ProductBuyRequest, "payment"> & { payment?: never },
    options: ProductSolanaPurchaseOptions,
  ): Promise<ProductSolanaPurchaseResult> {
    if (!this.signingKey) {
      throw new Error("buyProductWithSolanaPayment requires a signing key");
    }

    const product = await this.getProduct(productId);
    const payment = await executeSolanaX402Payment({
      ...options,
      mint: options.mint ?? SOLANA_USDC_MINT,
      signer: this.signingKey,
      payment: {
        scheme: "exact",
        network: product.price.network,
        asset: product.price.asset,
        amount: product.price.amount,
        from: request.buyer,
        to: product.seller,
        nonce: options.nonce ?? generateMarketplaceNonce("product", productId),
        expiresAt: options.expiresAt,
        expiresInMs: options.expiresInMs,
        metadata: {
          productId,
          kind: "product",
          ...options.metadata,
        },
      },
    });
    const purchase = await this.buyProduct(productId, {
      ...request,
      payment: payment.payment,
    });

    return { product, purchase, payment };
  }

  downloadProduct(
    productId: string,
    purchaseId: string,
    actorId?: string,
  ): Promise<Response> {
    if (actorId) {
      return this.http.getDirectoryAuthRawAs(
        `/marketplace/products/${encodeURIComponent(productId)}/download/${encodeURIComponent(purchaseId)}`,
        actorId,
      );
    }
    return this.http.getDirectoryAuthRaw(
      `/marketplace/products/${encodeURIComponent(productId)}/download/${encodeURIComponent(purchaseId)}`,
    );
  }

  getProductDelivery(
    productId: string,
    purchaseId: string,
    actorId?: string,
  ): Promise<Record<string, unknown>> {
    if (actorId) {
      return this.http.getDirectoryAuthAs<Record<string, unknown>>(
        `/marketplace/products/${encodeURIComponent(productId)}/purchases/${encodeURIComponent(purchaseId)}/delivery`,
        actorId,
      );
    }
    return this.http.getDirectoryAuth<Record<string, unknown>>(
      `/marketplace/products/${encodeURIComponent(productId)}/purchases/${encodeURIComponent(purchaseId)}/delivery`,
    );
  }

  updateProductDelivery(
    productId: string,
    purchaseId: string,
    delivery: Record<string, unknown>,
    actorId =
      typeof delivery["actor"] === "string" ? delivery["actor"] : undefined,
  ): Promise<Record<string, unknown>> {
    if (actorId) {
      return this.http.postDirectoryAuthAs<Record<string, unknown>>(
        `/marketplace/products/${encodeURIComponent(productId)}/purchases/${encodeURIComponent(purchaseId)}/delivery`,
        actorId,
        delivery,
      );
    }
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/marketplace/products/${encodeURIComponent(productId)}/purchases/${encodeURIComponent(purchaseId)}/delivery`,
      delivery,
    );
  }

  listProductReviews(
    productId: string,
  ): Promise<{ reviews: Array<ProductReview> }> {
    return this.http
      .get<{ reviews: Array<ProductReview> | null }>(
        `/marketplace/products/${encodeURIComponent(productId)}/reviews`,
      )
      .then((result) => ({ reviews: listField<ProductReview>(result, "reviews") }));
  }

  async createProductReview(
    productId: string,
    review: Partial<ProductReview>,
  ): Promise<ProductReview> {
    if (this.signingKey && !review.signature) {
      review = {
        ...review,
        productId,
        reviewId: review.reviewId ?? nextMarketplaceId("rev"),
      };
      review.signature = await signFreshCanonicalPayload(
        this.signingKey,
        productReviewSignaturePayload(review),
      );
      review.signerPublicKey ??= this.publicKeyBase64;
    }

    if (review.buyer) {
      return this.http.postDirectoryAuthAs<ProductReview>(
        `/marketplace/products/${encodeURIComponent(productId)}/reviews`,
        review.buyer,
        review,
      );
    }

    return this.http.post<ProductReview>(
      `/marketplace/products/${encodeURIComponent(productId)}/reviews`,
      review,
    );
  }

  // --- Identity Listings ---

  listIdentities(params?: {
    limit?: number;
    status?: string;
  }): Promise<{ identities: Array<IdentityListing> }> {
    return this.http
      .get<{ identities: Array<IdentityListing> | null }>(
        "/marketplace/identities",
        params as Record<string, unknown>,
      )
      .then((result) => ({
        identities: listField<IdentityListing>(result, "identities"),
      }));
  }

  async createIdentityListing(
    listing: Partial<IdentityListing>,
  ): Promise<IdentityListing> {
    if (this.signingKey && !listing.signature) {
      listing = {
        ...listing,
        listingId: listing.listingId ?? nextMarketplaceId("listing"),
      };
      listing.signature = await signFreshCanonicalPayload(
        this.signingKey,
        identityListingSignaturePayload(listing),
      );
      listing.signerPublicKey ??= this.publicKeyBase64;
    }

    if (listing.seller) {
      return this.http.postDirectoryAuthAs<IdentityListing>(
        "/marketplace/identities",
        listing.seller,
        listing,
      );
    }

    return this.http.postDirectoryAuth<IdentityListing>(
      "/marketplace/identities",
      listing,
    );
  }

  async deleteIdentityListing(listingId: string): Promise<void> {
    if (!this.signingKey) {
      return this.http.deleteDirectoryAuth<void>(
        `/marketplace/identities/${encodeURIComponent(listingId)}`,
      );
    }

    const signature = await signFreshCanonicalPayload(
      this.signingKey,
      identityListingCancelSignaturePayload(listingId),
    );
    return this.http.delete<void>(
      `/marketplace/identities/${encodeURIComponent(listingId)}?signature=${encodeURIComponent(signature)}${marketplaceSignerQuery(this.publicKeyBase64)}`,
    );
  }

  async buyIdentityListing(
    listingId: string,
    request: IdentityBuyRequest,
  ): Promise<IdentitySale> {
    if (this.signingKey && !request.signature) {
      request = {
        ...request,
        signature: await signFreshCanonicalPayload(
          this.signingKey,
          identityBuySignaturePayload(listingId, request),
        ),
      };
    }

    if (request.buyer) {
      return this.http.postDirectoryAuthAs<IdentitySale>(
        `/marketplace/identities/${encodeURIComponent(listingId)}/buy`,
        request.buyer,
        request,
      );
    }

    return this.http.postDirectoryAuth<IdentitySale>(
      `/marketplace/identities/${encodeURIComponent(listingId)}/buy`,
      request,
    );
  }

  async buyIdentityListingWithSolanaPayment(
    listingId: string,
    request: Omit<IdentityBuyRequest, "payment"> & { payment?: never },
    options: IdentitySolanaPurchaseOptions,
  ): Promise<IdentitySolanaPurchaseResult> {
    if (!this.signingKey) {
      throw new Error("buyIdentityListingWithSolanaPayment requires a signing key");
    }

    const listings = await this.listIdentities();
    const listing = listings.identities.find(
      (candidate) => candidate.listingId === listingId,
    );
    if (!listing) {
      throw new Error(`Identity listing not found: ${listingId}`);
    }

    const payment = await executeSolanaX402Payment({
      ...options,
      mint: options.mint ?? SOLANA_USDC_MINT,
      signer: this.signingKey,
      payment: {
        scheme: "exact",
        network: listing.price.network,
        asset: listing.price.asset,
        amount: listing.price.amount,
        from: request.buyer,
        to: listing.seller,
        nonce: options.nonce ?? generateMarketplaceNonce("identity", listingId),
        expiresAt: options.expiresAt,
        expiresInMs: options.expiresInMs,
        metadata: {
          listingId,
          identity: listing.name,
          kind: "identity-listing",
          ...options.metadata,
        },
      },
    });
    const sale = await this.buyIdentityListing(listingId, {
      ...request,
      payment: payment.payment,
    });

    return { listing, sale, payment };
  }

  listBids(listingId: string): Promise<{ bids: Array<IdentityBid> }> {
    return this.http
      .get<{ bids: Array<IdentityBid> | null }>(
        `/marketplace/identities/${encodeURIComponent(listingId)}/bids`,
      )
      .then((result) => ({ bids: listField<IdentityBid>(result, "bids") }));
  }

  async placeBid(
    listingId: string,
    bid: Partial<IdentityBid>,
  ): Promise<IdentityListing> {
    if (this.signingKey && !bid.signature) {
      bid = {
        ...bid,
        listingId,
        bidId: bid.bidId ?? nextMarketplaceId("bid"),
      };
      bid.signature = await signFreshCanonicalPayload(
        this.signingKey,
        identityBidSignaturePayload(bid),
      );
      bid.signerPublicKey ??= this.publicKeyBase64;
    }

    if (bid.bidder) {
      return this.http.postDirectoryAuthAs<IdentityListing>(
        `/marketplace/identities/${encodeURIComponent(listingId)}/bids`,
        bid.bidder,
        bid,
      );
    }

    return this.http.postDirectoryAuth<IdentityListing>(
      `/marketplace/identities/${encodeURIComponent(listingId)}/bids`,
      bid,
    );
  }

  async placeBidWithSolanaPayment(
    listingId: string,
    bid: Partial<IdentityBid>,
    options: IdentityBidPaymentOptions = {},
  ): Promise<IdentityBidPaymentResult> {
    if (!this.signingKey) {
      throw new Error("placeBidWithSolanaPayment requires a signing key");
    }
    if (!bid.bidder || !bid.price?.amount) {
      throw new Error("identity bid requires bidder and price.amount");
    }

    const listing = options.listing ?? (await this.identityListing(listingId));
    const bidId = bid.bidId ?? nextMarketplaceId("bid");
    const prepared = {
      ...bid,
      listingId,
      bidId,
    };
    const payment = await buildX402PaymentMap(this.signingKey, {
      scheme: "upto",
      network: bid.price.network,
      asset: bid.price.asset,
      amount: bid.price.amount,
      from: bid.bidder,
      to: listing.seller,
      nonce: options.nonce ?? generateMarketplaceNonce("bid", bidId),
      expiresAt: options.expiresAt,
      expiresInMs: options.expiresInMs,
      metadata: {
        bidId,
        identity: listing.name,
        kind: "identity-bid",
        listingId,
        ...options.metadata,
      },
    });
    const updatedListing = await this.placeBid(listingId, {
      ...prepared,
      payment,
    });

    return { listing, updatedListing, payment };
  }

  closeListing(
    listingId: string,
    sellerId?: string,
    request?: Record<string, unknown>,
  ): Promise<IdentitySale> {
    if (sellerId) {
      return this.http.postDirectoryAuthAs<IdentitySale>(
        `/marketplace/identities/${encodeURIComponent(listingId)}/close`,
        sellerId,
        request,
      );
    }
    return this.http.postDirectoryAuth<IdentitySale>(
      `/marketplace/identities/${encodeURIComponent(listingId)}/close`,
      request,
    );
  }

  setDefaultIdentityListing(
    listingId: string,
    request?: Record<string, unknown>,
    sellerId?: string,
  ): Promise<Record<string, unknown>> {
    if (sellerId) {
      return this.http.postDirectoryAuthAs<Record<string, unknown>>(
        `/marketplace/identities/${encodeURIComponent(listingId)}/default`,
        sellerId,
        request,
      );
    }
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/marketplace/identities/${encodeURIComponent(listingId)}/default`,
      request,
    );
  }

  identitySaleHistory(
    name: string,
  ): Promise<{ history: Array<IdentitySale> | null }> {
    return this.http
      .get<{ history: Array<IdentitySale> | null }>(
        `/marketplace/identities/history/${encodeURIComponent(name)}`,
      )
      .then((result) => ({ history: listField<IdentitySale>(result, "history") }));
  }

  identityFloor(length?: number): Promise<IdentityFloor> {
    return this.http.get<IdentityFloor>(
      "/marketplace/identities/floor",
      length != null ? { length } : undefined,
    );
  }

  // --- Offers ---

  /**
   * Lists pending identity offers. Filter by `name` (the @handle an offer
   * targets — a seller reviewing incoming offers) or `buyer` (a buyer reviewing
   * their own outstanding offers). The locked x402 payment authorization is
   * redacted server-side, so listed offers never carry the signed credential.
   */
  listOffers(params?: {
    name?: string;
    buyer?: string;
    agent?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ offers: Array<IdentityOffer> }> {
    return this.http
      .get<{ offers: Array<IdentityOffer> | null }>(
        "/marketplace/offers",
        params as Record<string, unknown>,
      )
      .then((result) => ({ offers: listField<IdentityOffer>(result, "offers") }));
  }

  async createOffer(offer: Partial<IdentityOffer>): Promise<IdentityOffer> {
    if (this.signingKey && !offer.signature) {
      offer = {
        ...offer,
        offerId: offer.offerId ?? nextMarketplaceId("offer"),
      };
      offer.signature = await signFreshCanonicalPayload(
        this.signingKey,
        identityOfferSignaturePayload(offer),
      );
      offer.signerPublicKey ??= this.publicKeyBase64;
    }

    if (offer.buyer) {
      return this.http.postDirectoryAuthAs<IdentityOffer>(
        "/marketplace/offers",
        offer.buyer,
        offer,
      );
    }

    return this.http.postDirectoryAuth<IdentityOffer>(
      "/marketplace/offers",
      offer,
    );
  }

  async createOfferWithSolanaPayment(
    offer: Partial<IdentityOffer>,
    options: IdentityOfferPaymentOptions = {},
  ): Promise<IdentityOfferPaymentResult> {
    if (!this.signingKey) {
      throw new Error("createOfferWithSolanaPayment requires a signing key");
    }
    if (!offer.buyer || !offer.name || !offer.price?.amount) {
      throw new Error("identity offer requires buyer, name, and price.amount");
    }

    const buyer = offer.buyer;
    const name = offer.name;
    const price = offer.price;
    const offerId = offer.offerId ?? nextMarketplaceId("offer");
    const prepared = {
      ...offer,
      offerId,
    };
    const payment = await buildX402PaymentMap(this.signingKey, {
      scheme: "upto",
      network: price.network,
      asset: price.asset,
      amount: price.amount,
      from: buyer,
      to: name,
      nonce: options.nonce ?? generateMarketplaceNonce("offer", offerId),
      expiresAt: options.expiresAt,
      expiresInMs: options.expiresInMs,
      metadata: {
        kind: "identity-offer",
        name,
        offerId,
        ...options.metadata,
      },
    });
    const created = await this.createOffer({
      ...prepared,
      payment,
    });

    return { offer: created, payment };
  }

  async cancelOffer(offerId: string): Promise<void> {
    if (!this.signingKey) {
      return this.http.deleteDirectoryAuth<void>(
        `/marketplace/offers/${encodeURIComponent(offerId)}`,
      );
    }

    const signature = await signFreshCanonicalPayload(
      this.signingKey,
      identityOfferCancelSignaturePayload(offerId),
    );
    return this.http.delete<void>(
      `/marketplace/offers/${encodeURIComponent(offerId)}?signature=${encodeURIComponent(signature)}${marketplaceSignerQuery(this.publicKeyBase64)}`,
    );
  }

  async acceptOffer(
    offerId: string,
    request: IdentityOfferAcceptRequest,
  ): Promise<IdentitySale> {
    if (this.signingKey && !request.signature) {
      request = {
        ...request,
        signature: await signFreshCanonicalPayload(
          this.signingKey,
          identityOfferAcceptSignaturePayload(offerId, request.seller),
        ),
      };
    }

    if (request.seller) {
      return this.http.postDirectoryAuthAs<IdentitySale>(
        `/marketplace/offers/${encodeURIComponent(offerId)}/accept`,
        request.seller,
        request,
      );
    }

    return this.http.postDirectoryAuth<IdentitySale>(
      `/marketplace/offers/${encodeURIComponent(offerId)}/accept`,
      request,
    );
  }

  // --- Browsing ---

  browseMarketplace(
    params?: ProductQueryParams,
  ): Promise<MarketplaceBrowseResponse> {
    return this.http
      .get<MarketplaceBrowseResponse>(
        "/marketplace",
        params as Record<string, unknown>,
      )
      .then((result) => ({
        products: listField<Product>(result, "products"),
        identities: listField<IdentityListing>(result, "identities"),
      }));
  }

  categories(): Promise<{ categories: Array<MarketplaceCategory> }> {
    return this.http
      .get<{ categories: Array<MarketplaceCategory> | null }>(
        "/marketplace/categories",
      )
      .then((result) => ({
        categories: listField<MarketplaceCategory>(result, "categories"),
      }));
  }

  featured(): Promise<{ items: Array<unknown> }> {
    return this.http
      .get<{ items: Array<unknown> | null }>("/marketplace/featured")
      .then((result) => ({ items: listField<unknown>(result, "items") }));
  }

  recent(): Promise<{ sales: Array<IdentitySale> }> {
    return this.http
      .get<{ sales: Array<IdentitySale> | null }>("/marketplace/recent")
      .then((result) => ({ sales: listField<IdentitySale>(result, "sales") }));
  }

  stream(
    agentId: string,
    params?: { limit?: number },
  ): TinyPlaceWebSocket | undefined {
    if (!this.signingKey || !this.publicKeyBase64) {
      return undefined;
    }
    const query = new URLSearchParams({ "X-Agent-ID": agentId });
    if (params?.limit != null) {
      query.set("limit", String(params.limit));
    }
    return this.wsFactory?.(`/marketplace/stream?${query.toString()}`, {
      directoryAuth: true,
    });
  }

  private async identityListing(listingId: string): Promise<IdentityListing> {
    const listings = await this.listIdentities();
    const listing = listings.identities.find(
      (candidate) => candidate.listingId === listingId,
    );
    if (!listing) {
      throw new Error(`Identity listing not found: ${listingId}`);
    }
    return listing;
  }
}

function productSignaturePayload(
  product: ProductCreateRequest | Product,
): string {
  return canonicalPayload("marketplace.product", {
    category: product.category,
    deliveryMethod: product.deliveryMethod,
    description: product.description,
    name: product.name,
    price: product.price,
    productId: product.productId ?? "",
    seller: product.seller ?? "",
    sellerCryptoId: product.sellerCryptoId ?? "",
    stock: product.stock ?? null,
    tags: product.tags ?? null,
  });
}

function productDeleteSignaturePayload(productId: string): string {
  return canonicalPayload("marketplace.product.delete", {
    productId,
  });
}

function productReviewSignaturePayload(review: Partial<ProductReview>): string {
  return canonicalPayload("marketplace.product.review", {
    buyer: review.buyer ?? "",
    comment: review.comment ?? "",
    productId: review.productId ?? "",
    rating: review.rating ?? 0,
    reviewId: review.reviewId ?? "",
  });
}

function identityListingSignaturePayload(
  listing: Partial<IdentityListing>,
): string {
  return canonicalPayload("marketplace.identity.listing", {
    description: listing.description ?? "",
    listingId: listing.listingId ?? "",
    listingType: listing.listingType ?? "",
    name: listing.name ?? "",
    price: listing.price ?? null,
    seller: listing.seller ?? "",
    sellerCryptoId: listing.sellerCryptoId ?? "",
    tags: listing.tags ?? null,
  });
}

function identityListingCancelSignaturePayload(listingId: string): string {
  return canonicalPayload("marketplace.identity.listing.cancel", {
    listingId,
  });
}

function identityBuySignaturePayload(
  listingId: string,
  request: IdentityBuyRequest,
): string {
  return canonicalPayload("marketplace.identity.buy", {
    buyer: request.buyer,
    buyerCryptoId: request.buyerCryptoId,
    buyerPublicKey: request.buyerPublicKey ?? "",
    listingId,
  });
}

function identityBidSignaturePayload(bid: Partial<IdentityBid>): string {
  return canonicalPayload("marketplace.identity.bid", {
    bidId: bid.bidId ?? "",
    bidder: bid.bidder ?? "",
    bidderCryptoId: bid.bidderCryptoId ?? "",
    bidderPublicKey: bid.bidderPublicKey ?? "",
    listingId: bid.listingId ?? "",
    price: bid.price ?? null,
  });
}

function identityOfferSignaturePayload(offer: Partial<IdentityOffer>): string {
  return canonicalPayload("marketplace.identity.offer", {
    buyer: offer.buyer ?? "",
    buyerCryptoId: offer.buyerCryptoId ?? "",
    buyerPublicKey: offer.buyerPublicKey ?? "",
    listingId: offer.listingId ?? "",
    name: offer.name ?? "",
    offerId: offer.offerId ?? "",
    price: offer.price ?? null,
  });
}

function identityOfferCancelSignaturePayload(offerId: string): string {
  return canonicalPayload("marketplace.identity.offer.cancel", {
    offerId,
  });
}

function identityOfferAcceptSignaturePayload(
  offerId: string,
  seller: string,
): string {
  return canonicalPayload("marketplace.identity.offer.accept", {
    offerId,
    seller,
  });
}

// Builds the optional &signerPublicKey= query suffix for body-less revoke
// requests, so the backend can authorize a delegated session key acting on the
// owner's behalf. Empty when there is no presented key.
function marketplaceSignerQuery(signerPublicKey: string | undefined): string {
  return signerPublicKey
    ? `&signerPublicKey=${encodeURIComponent(signerPublicKey)}`
    : "";
}

function nextMarketplaceId(prefix: string): string {
  const random = new Uint8Array(6);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}

function generateMarketplaceNonce(kind: string, id: string): string {
  const random = new Uint8Array(12);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${kind}_${id}_${suffix}`;
}
