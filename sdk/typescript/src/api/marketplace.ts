import type { HttpClient } from "../http.js";
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
  constructor(private readonly http: HttpClient) {}

  // --- Products ---

  listProducts(params?: ProductQueryParams): Promise<{ products: Array<Product> }> {
    return this.http.get<{ products: Array<Product> }>(
      "/marketplace/products",
      params as Record<string, unknown>,
    );
  }

  createProduct(product: ProductCreateRequest): Promise<Product> {
    return this.http.post<Product>("/marketplace/products", product);
  }

  getProduct(productId: string): Promise<Product> {
    return this.http.get<Product>(`/marketplace/products/${encodeURIComponent(productId)}`);
  }

  updateProduct(productId: string, update: Partial<Product>): Promise<Product> {
    return this.http.put<Product>(
      `/marketplace/products/${encodeURIComponent(productId)}`,
      update,
    );
  }

  deleteProduct(productId: string): Promise<void> {
    return this.http.delete<void>(`/marketplace/products/${encodeURIComponent(productId)}`);
  }

  buyProduct(productId: string, payment: Record<string, string>): Promise<LedgerTransaction> {
    return this.http.post<LedgerTransaction>(
      `/marketplace/products/${encodeURIComponent(productId)}/buy`,
      payment,
    );
  }

  downloadProduct(productId: string, purchaseId: string): Promise<Response> {
    return this.http.getAuth<Response>(
      `/marketplace/products/${encodeURIComponent(productId)}/download/${encodeURIComponent(purchaseId)}`,
    );
  }

  listProductReviews(productId: string): Promise<{ reviews: Array<ProductReview> }> {
    return this.http.get<{ reviews: Array<ProductReview> }>(
      `/marketplace/products/${encodeURIComponent(productId)}/reviews`,
    );
  }

  createProductReview(productId: string, review: Partial<ProductReview>): Promise<ProductReview> {
    return this.http.post<ProductReview>(
      `/marketplace/products/${encodeURIComponent(productId)}/reviews`,
      review,
    );
  }

  // --- Identity Listings ---

  listIdentities(params?: {
    limit?: number;
    status?: string;
  }): Promise<{ listings: Array<IdentityListing> }> {
    return this.http.get<{ listings: Array<IdentityListing> }>(
      "/marketplace/identities",
      params as Record<string, unknown>,
    );
  }

  createIdentityListing(listing: Partial<IdentityListing>): Promise<IdentityListing> {
    return this.http.post<IdentityListing>("/marketplace/identities", listing);
  }

  deleteIdentityListing(listingId: string): Promise<void> {
    return this.http.delete<void>(`/marketplace/identities/${encodeURIComponent(listingId)}`);
  }

  buyIdentityListing(
    listingId: string,
    payment: Record<string, string>,
  ): Promise<LedgerTransaction> {
    return this.http.post<LedgerTransaction>(
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
    return this.http.post<IdentityBid>(
      `/marketplace/identities/${encodeURIComponent(listingId)}/bids`,
      bid,
    );
  }

  closeListing(listingId: string): Promise<IdentitySale> {
    return this.http.post<IdentitySale>(
      `/marketplace/identities/${encodeURIComponent(listingId)}/close`,
    );
  }

  identitySaleHistory(name: string): Promise<{ sales: Array<IdentitySale> }> {
    return this.http.get<{ sales: Array<IdentitySale> }>(
      `/marketplace/identities/history/${encodeURIComponent(name)}`,
    );
  }

  identityFloor(length?: number): Promise<{ floorPrice: string; assetPerLength: Record<string, unknown> }> {
    return this.http.get<{ floorPrice: string; assetPerLength: Record<string, unknown> }>(
      "/marketplace/identities/floor",
      length != null ? { length } : undefined,
    );
  }

  // --- Offers ---

  createOffer(offer: Partial<IdentityOffer>): Promise<IdentityOffer> {
    return this.http.post<IdentityOffer>("/marketplace/offers", offer);
  }

  cancelOffer(offerId: string): Promise<void> {
    return this.http.delete<void>(`/marketplace/offers/${encodeURIComponent(offerId)}`);
  }

  acceptOffer(offerId: string): Promise<IdentitySale> {
    return this.http.post<IdentitySale>(
      `/marketplace/offers/${encodeURIComponent(offerId)}/accept`,
    );
  }

  // --- Browsing ---

  categories(): Promise<{ categories: Array<MarketplaceCategory> }> {
    return this.http.get<{ categories: Array<MarketplaceCategory> }>("/marketplace/categories");
  }

  featured(): Promise<{ featured: Array<unknown> }> {
    return this.http.get<{ featured: Array<unknown> }>("/marketplace/featured");
  }

  recent(): Promise<{ recent: Array<IdentitySale> }> {
    return this.http.get<{ recent: Array<IdentitySale> }>("/marketplace/recent");
  }
}
