export type ProductCategory =
  | "dataset"
  | "model"
  | "api-key"
  | "report"
  | "template"
  | "tool"
  | "other";

export type ProductStatus = "active" | "sold-out" | "delisted";

export type DeliveryMethod =
  | "download"
  | "a2a-task"
  | "encrypted-message";

export type IdentityListingType = "fixed" | "auction";

export interface MarketplacePrice {
  amount: string;
  asset: string;
  network: string;
}

export interface Product {
  productId: string;
  seller: string;
  sellerCryptoId: string;
  name: string;
  description: string;
  category: ProductCategory;
  tags?: Array<string>;
  price: MarketplacePrice;
  deliveryMethod: DeliveryMethod;
  deliveryDetails?: Record<string, unknown>;
  status: ProductStatus;
  stock?: number | null;
  createdAt: string;
  updatedAt: string;
  salesCount: number;
  rating: number;
  signature?: string;
}

export interface ProductCreateRequest {
  name: string;
  description: string;
  category: ProductCategory;
  tags?: Array<string>;
  price: MarketplacePrice;
  deliveryMethod: DeliveryMethod;
  deliveryDetails?: Record<string, unknown>;
  stock?: number;
  signature?: string;
}

export interface ProductQueryParams {
  q?: string;
  category?: string;
  tags?: Array<string>;
  seller?: string;
  minPrice?: string;
  maxPrice?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
}

export interface ProductPurchase {
  purchaseId: string;
  productId: string;
  buyer: string;
  buyerCryptoId?: string;
  seller: string;
  price: MarketplacePrice;
  payment?: Record<string, string>;
  ledgerTxId?: string;
  delivery?: Record<string, unknown>;
  createdAt: string;
}

export interface ProductReview {
  reviewId: string;
  productId: string;
  buyer: string;
  rating: number;
  comment?: string;
  createdAt: string;
  signature?: string;
}

export interface IdentityListing {
  listingId: string;
  type: string;
  name: string;
  seller: string;
  sellerCryptoId: string;
  description?: string;
  category: string;
  tags?: Array<string>;
  price: MarketplacePrice;
  listingType: IdentityListingType;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  reservePrice?: MarketplacePrice;
  highestBid?: IdentityBid;
  winningBidId?: string;
  paymentDueAt?: string;
  settlementStatus?: string;
  signature?: string;
}

export interface IdentityBid {
  bidId: string;
  listingId: string;
  bidder: string;
  bidderCryptoId?: string;
  bidderPublicKey?: string;
  price: MarketplacePrice;
  payment?: Record<string, string>;
  status: string;
  createdAt: string;
  signature?: string;
}

export interface IdentityOffer {
  offerId: string;
  listingId?: string;
  name: string;
  buyer: string;
  buyerCryptoId?: string;
  buyerPublicKey?: string;
  price: MarketplacePrice;
  payment?: Record<string, string>;
  expiresAt?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  signature?: string;
}

export interface IdentitySale {
  saleId: string;
  listingId?: string;
  offerId?: string;
  name: string;
  seller: string;
  buyer: string;
  buyerCryptoId?: string;
  buyerPublicKey?: string;
  price: MarketplacePrice;
  ledgerTxId?: string;
  createdAt: string;
}

export interface MarketplaceCategory {
  category: string;
  count: number;
}

export interface IdentityFloor {
  length: number;
  price?: MarketplacePrice;
}
