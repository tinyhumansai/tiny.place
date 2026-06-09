from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Optional


ProductCategory = Literal["dataset", "model", "api-key", "report", "template", "tool", "other"]
ProductStatus = Literal["active", "sold-out", "delisted"]
DeliveryMethod = Literal["download", "a2a-task", "encrypted-message"]
IdentityListingType = Literal["fixed", "auction"]


@dataclass
class MarketplacePrice:
    amount: str
    asset: str
    network: str


@dataclass
class Product:
    product_id: str
    seller: str
    seller_crypto_id: str
    name: str
    description: str
    category: ProductCategory
    price: MarketplacePrice
    delivery_method: DeliveryMethod
    status: ProductStatus
    created_at: str
    updated_at: str
    sales_count: int
    rating: float
    tags: Optional[list[str]] = None
    delivery_details: Optional[dict[str, Any]] = None
    stock: Optional[int] = None
    signature: Optional[str] = None


@dataclass
class ProductCreateRequest:
    name: str
    description: str
    category: ProductCategory
    price: MarketplacePrice
    delivery_method: DeliveryMethod
    tags: Optional[list[str]] = None
    delivery_details: Optional[dict[str, Any]] = None
    stock: Optional[int] = None
    signature: Optional[str] = None


@dataclass
class ProductQueryParams:
    q: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None
    seller: Optional[str] = None
    min_price: Optional[str] = None
    max_price: Optional[str] = None
    sort_by: Optional[str] = None
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass
class ProductPurchase:
    purchase_id: str
    product_id: str
    buyer: str
    seller: str
    price: MarketplacePrice
    created_at: str
    buyer_crypto_id: Optional[str] = None
    payment: Optional[dict[str, str]] = None
    ledger_tx_id: Optional[str] = None
    delivery: Optional[dict[str, Any]] = None


@dataclass
class ProductReview:
    review_id: str
    product_id: str
    buyer: str
    rating: int
    created_at: str
    comment: Optional[str] = None
    signature: Optional[str] = None


@dataclass
class IdentityListing:
    listing_id: str
    type: str
    name: str
    seller: str
    seller_crypto_id: str
    category: str
    price: MarketplacePrice
    listing_type: IdentityListingType
    status: str
    created_at: str
    updated_at: str
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    expires_at: Optional[str] = None
    reserve_price: Optional[MarketplacePrice] = None
    highest_bid: Optional[IdentityBid] = None
    winning_bid_id: Optional[str] = None
    payment_due_at: Optional[str] = None
    settlement_status: Optional[str] = None
    signature: Optional[str] = None


@dataclass
class IdentityBid:
    bid_id: str
    listing_id: str
    bidder: str
    price: MarketplacePrice
    status: str
    created_at: str
    bidder_crypto_id: Optional[str] = None
    bidder_public_key: Optional[str] = None
    payment: Optional[dict[str, str]] = None
    signature: Optional[str] = None


@dataclass
class IdentityOffer:
    offer_id: str
    name: str
    buyer: str
    price: MarketplacePrice
    status: str
    created_at: str
    updated_at: str
    listing_id: Optional[str] = None
    buyer_crypto_id: Optional[str] = None
    buyer_public_key: Optional[str] = None
    payment: Optional[dict[str, str]] = None
    expires_at: Optional[str] = None
    signature: Optional[str] = None


@dataclass
class IdentitySale:
    sale_id: str
    name: str
    seller: str
    buyer: str
    price: MarketplacePrice
    created_at: str
    listing_id: Optional[str] = None
    offer_id: Optional[str] = None
    buyer_crypto_id: Optional[str] = None
    buyer_public_key: Optional[str] = None
    ledger_tx_id: Optional[str] = None


@dataclass
class MarketplaceCategory:
    category: str
    count: int


@dataclass
class IdentityFloor:
    length: int
    price: Optional[MarketplacePrice] = None
