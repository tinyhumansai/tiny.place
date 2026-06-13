import type { HttpClient } from "../http.js";
import type { SigningKey } from "../auth.js";
import { signCanonicalPayload } from "../auth.js";
import { canonicalPayload } from "../crypto.js";
import type { LedgerTransaction } from "../types/ledger.js";
import type {
  IdentityBid,
  IdentityFloor,
  IdentityListing,
  IdentityOffer,
  IdentitySale,
  MarketplaceCategory,
  Product,
  ProductCreateRequest,
  ProductPurchase,
  ProductQueryParams,
  ProductReview,
} from "../types/index.js";

export class MarketplaceApi {
  constructor(
    private readonly http: HttpClient,
    private readonly signingKey?: SigningKey,
  ) {}

  // --- Products ---

  listProducts(
    params?: ProductQueryParams,
  ): Promise<{ products: Array<Product> }> {
    return this.http.get<{ products: Array<Product> }>(
      "/marketplace/products",
      params as Record<string, unknown>,
    );
  }

  async createProduct(product: ProductCreateRequest): Promise<Product> {
    if (this.signingKey && !product.signature) {
      product = {
        ...product,
        productId: product.productId ?? nextMarketplaceId("prod"),
      };
      product.signature = await signCanonicalPayload(
        this.signingKey,
        productSignaturePayload(product),
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

  updateProduct(productId: string, update: Partial<Product>): Promise<Product> {
    return this.http.putDirectoryAuth<Product>(
      `/marketplace/products/${encodeURIComponent(productId)}`,
      update,
    );
  }

  deleteProduct(productId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/marketplace/products/${encodeURIComponent(productId)}`,
    );
  }

  buyProduct(
    productId: string,
    payment: Record<string, string>,
  ): Promise<LedgerTransaction> {
    return this.http.postDirectoryAuth<LedgerTransaction>(
      `/marketplace/products/${encodeURIComponent(productId)}/buy`,
      payment,
    );
  }

  downloadProduct(productId: string, purchaseId: string): Promise<Response> {
    return this.http.getDirectoryAuthRaw(
      `/marketplace/products/${encodeURIComponent(productId)}/download/${encodeURIComponent(purchaseId)}`,
    );
  }

  getProductDelivery(
    productId: string,
    purchaseId: string,
  ): Promise<Record<string, unknown>> {
    return this.http.getDirectoryAuth<Record<string, unknown>>(
      `/marketplace/products/${encodeURIComponent(productId)}/purchases/${encodeURIComponent(purchaseId)}/delivery`,
    );
  }

  updateProductDelivery(
    productId: string,
    purchaseId: string,
    delivery: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/marketplace/products/${encodeURIComponent(productId)}/purchases/${encodeURIComponent(purchaseId)}/delivery`,
      delivery,
    );
  }

  listProductReviews(
    productId: string,
  ): Promise<{ reviews: Array<ProductReview> }> {
    return this.http.get<{ reviews: Array<ProductReview> }>(
      `/marketplace/products/${encodeURIComponent(productId)}/reviews`,
    );
  }

  createProductReview(
    productId: string,
    review: Partial<ProductReview>,
  ): Promise<ProductReview> {
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
    return this.http.get<{ identities: Array<IdentityListing> }>(
      "/marketplace/identities",
      params as Record<string, unknown>,
    );
  }

  createIdentityListing(
    listing: Partial<IdentityListing>,
  ): Promise<IdentityListing> {
    return this.http.postDirectoryAuth<IdentityListing>(
      "/marketplace/identities",
      listing,
    );
  }

  deleteIdentityListing(listingId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/marketplace/identities/${encodeURIComponent(listingId)}`,
    );
  }

  buyIdentityListing(
    listingId: string,
    payment: Record<string, string>,
  ): Promise<LedgerTransaction> {
    return this.http.postDirectoryAuth<LedgerTransaction>(
      `/marketplace/identities/${encodeURIComponent(listingId)}/buy`,
      payment,
    );
  }

  listBids(listingId: string): Promise<{ bids: Array<IdentityBid> }> {
    return this.http.get<{ bids: Array<IdentityBid> }>(
      `/marketplace/identities/${encodeURIComponent(listingId)}/bids`,
    );
  }

  placeBid(listingId: string, bid: Partial<IdentityBid>): Promise<IdentityBid> {
    return this.http.postDirectoryAuth<IdentityBid>(
      `/marketplace/identities/${encodeURIComponent(listingId)}/bids`,
      bid,
    );
  }

  closeListing(listingId: string): Promise<IdentitySale> {
    return this.http.postDirectoryAuth<IdentitySale>(
      `/marketplace/identities/${encodeURIComponent(listingId)}/close`,
    );
  }

  setDefaultIdentityListing(
    listingId: string,
    request?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/marketplace/identities/${encodeURIComponent(listingId)}/default`,
      request,
    );
  }

  identitySaleHistory(name: string): Promise<{ sales: Array<IdentitySale> }> {
    return this.http.get<{ sales: Array<IdentitySale> }>(
      `/marketplace/identities/history/${encodeURIComponent(name)}`,
    );
  }

  identityFloor(
    length?: number,
  ): Promise<{ floorPrice: string; assetPerLength: Record<string, unknown> }> {
    return this.http.get<{
      floorPrice: string;
      assetPerLength: Record<string, unknown>;
    }>(
      "/marketplace/identities/floor",
      length != null ? { length } : undefined,
    );
  }

  // --- Offers ---

  createOffer(offer: Partial<IdentityOffer>): Promise<IdentityOffer> {
    return this.http.postDirectoryAuth<IdentityOffer>(
      "/marketplace/offers",
      offer,
    );
  }

  cancelOffer(offerId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/marketplace/offers/${encodeURIComponent(offerId)}`,
    );
  }

  acceptOffer(offerId: string): Promise<IdentitySale> {
    return this.http.postDirectoryAuth<IdentitySale>(
      `/marketplace/offers/${encodeURIComponent(offerId)}/accept`,
    );
  }

  // --- Browsing ---

  categories(): Promise<{ categories: Array<MarketplaceCategory> }> {
    return this.http.get<{ categories: Array<MarketplaceCategory> }>(
      "/marketplace/categories",
    );
  }

  featured(): Promise<{ items: Array<unknown> }> {
    return this.http.get<{ items: Array<unknown> }>("/marketplace/featured");
  }

  recent(): Promise<{ recent: Array<IdentitySale> }> {
    return this.http.get<{ recent: Array<IdentitySale> }>(
      "/marketplace/recent",
    );
  }
}

function productSignaturePayload(product: ProductCreateRequest): string {
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

function nextMarketplaceId(prefix: string): string {
  const random = new Uint8Array(6);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}
