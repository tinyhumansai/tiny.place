from __future__ import annotations

import secrets
import time
from typing import Any

from ..auth import sign_fresh_canonical_payload
from ..crypto import canonical_payload
from ..http import HttpClient, encode
from ..signer import Signer
from ..solana import SOLANA_USDC_MINT, execute_solana_x402_payment
from ..types import Json, JsonDict, Query
from ..x402 import build_x402_payment_map


class MarketplaceApi:
    """The digital marketplace: products, identity (@handle) listings/bids/offers,
    reviews and browsing. Mirrors the TS SDK's ``MarketplaceApi``.

    Signed mutations (create/update/delete/review/listing/bid/offer) attach a
    fresh canonical-payload signature from the configured signer, exactly as the
    TS SDK does, and are routed as the named seller/buyer/bidder when present.

    The ``*_with_solana_payment`` helpers settle a paid action on chain: product
    and identity-listing purchases execute an ``exact`` USDC transfer up front;
    bids and offers attach a signed ``upto`` x402 authorization (no immediate
    transfer). They reuse the same Solana primitives as registration. A plain
    paid call without a prepared ``payment`` map surfaces the backend's 402.
    """

    def __init__(
        self,
        http: HttpClient,
        signer: Signer | None = None,
        public_key_base64: str | None = None,
    ) -> None:
        self._http = http
        self._signer = signer
        self._public_key = public_key_base64 or (signer.public_key_base64 if signer else None)

    # --- Products ---

    async def list_products(self, params: Query = None) -> JsonDict:
        return await self._http.get("/marketplace/products", params)

    async def create_product(self, product: JsonDict) -> Json:
        product = await self._signed(
            product, _product_payload, id_field="productId", id_prefix="prod"
        )
        return await self._post_owner("/marketplace/products", product.get("seller"), product)

    async def get_product(self, product_id: str) -> Json:
        return await self._http.get(f"/marketplace/products/{encode(product_id)}")

    async def update_product(self, product_id: str, update: JsonDict) -> Json:
        update = await self._signed(update, _product_payload)
        path = f"/marketplace/products/{encode(product_id)}"
        seller = update.get("seller")
        if seller:
            return await self._http.put_directory_auth_as(path, str(seller), update)
        return await self._http.put_directory_auth(path, update)

    async def delete_product(self, product_id: str) -> None:
        await self._signed_delete(
            f"/marketplace/products/{encode(product_id)}",
            _product_delete_payload(product_id),
            public=True,
        )

    async def buy_product(self, product_id: str, request: JsonDict) -> Json:
        # The signed payment map (if any) travels in `request`; without it the
        # backend answers 402, surfaced to the caller as TinyPlaceError.
        return await self._post_owner(
            f"/marketplace/products/{encode(product_id)}/buy", request.get("buyer"), request
        )

    async def buy_product_with_solana_payment(
        self,
        product_id: str,
        request: JsonDict,
        *,
        rpc_url: str,
        secret_key: str | bytes,
        mint: str | None = None,
        decimals: int = 6,
        nonce: str | None = None,
        expires_at: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Buy a product, settling its USDC price on chain (exact x402), then retrying
        the buy with the signed payment map. Mirrors the TS ``buyProductWithSolanaPayment``.
        """
        if self._signer is None:
            raise ValueError("buy_product_with_solana_payment requires a signer")
        product = await self.get_product(product_id)
        price = _price(product)
        execution = await execute_solana_x402_payment(
            signer=self._signer,
            rpc_url=rpc_url,
            secret_key=secret_key,
            mint=mint or SOLANA_USDC_MINT,
            decimals=decimals,
            payment={
                "scheme": "exact",
                "network": price["network"],
                "asset": price["asset"],
                "amount": price["amount"],
                "from": request.get("buyer"),
                "to": product.get("seller") if isinstance(product, dict) else None,
                "nonce": nonce or _marketplace_nonce("product", product_id),
                "expiresAt": expires_at,
                "metadata": {"productId": product_id, "kind": "product", **(metadata or {})},
            },
        )
        purchase = await self.buy_product(
            product_id, {**request, "payment": execution["payment"]}
        )
        return {"product": product, "purchase": purchase, "payment": execution}

    async def list_product_reviews(self, product_id: str) -> JsonDict:
        return await self._http.get(f"/marketplace/products/{encode(product_id)}/reviews")

    async def create_product_review(self, product_id: str, review: JsonDict) -> Json:
        review = {**review, "productId": product_id}
        review = await self._signed(review, _product_review_payload, id_field="reviewId", id_prefix="rev")
        path = f"/marketplace/products/{encode(product_id)}/reviews"
        buyer = review.get("buyer")
        if buyer:
            return await self._http.post_directory_auth_as(path, str(buyer), review)
        return await self._http.post(path, review)

    async def get_product_delivery(
        self, product_id: str, purchase_id: str, actor: str | None = None
    ) -> Json:
        path = f"/marketplace/products/{encode(product_id)}/purchases/{encode(purchase_id)}/delivery"
        if actor:
            return await self._http.get_directory_auth_as(path, actor)
        return await self._http.get_directory_auth(path)

    async def update_product_delivery(
        self, product_id: str, purchase_id: str, delivery: JsonDict, actor: str | None = None
    ) -> Json:
        path = f"/marketplace/products/{encode(product_id)}/purchases/{encode(purchase_id)}/delivery"
        actor = actor or (delivery.get("actor") if isinstance(delivery.get("actor"), str) else None)
        if actor:
            return await self._http.post_directory_auth_as(path, actor, delivery)
        return await self._http.post_directory_auth(path, delivery)

    # --- Identity listings ---

    async def list_identities(self, params: Query = None) -> JsonDict:
        return await self._http.get("/marketplace/identities", params)

    async def create_identity_listing(self, listing: JsonDict) -> Json:
        listing = await self._signed(
            listing, _identity_listing_payload, id_field="listingId", id_prefix="listing"
        )
        return await self._post_owner("/marketplace/identities", listing.get("seller"), listing)

    async def delete_identity_listing(self, listing_id: str) -> None:
        # Identity/offer cancellations stay signed (Authorization header), unlike
        # the public product delete.
        await self._signed_delete(
            f"/marketplace/identities/{encode(listing_id)}",
            _identity_listing_cancel_payload(listing_id),
            public=False,
        )

    async def buy_identity_listing(self, listing_id: str, request: JsonDict) -> Json:
        if self._signer is not None and not request.get("signature"):
            request = {
                **request,
                "signature": await sign_fresh_canonical_payload(
                    self._signer, _identity_buy_payload(listing_id, request)
                ),
            }
        return await self._post_owner(
            f"/marketplace/identities/{encode(listing_id)}/buy", request.get("buyer"), request
        )

    async def buy_identity_listing_with_solana_payment(
        self,
        listing_id: str,
        request: JsonDict,
        *,
        rpc_url: str,
        secret_key: str | bytes,
        mint: str | None = None,
        decimals: int = 6,
        nonce: str | None = None,
        expires_at: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Buy an identity listing, settling its USDC price on chain (exact x402)."""
        if self._signer is None:
            raise ValueError("buy_identity_listing_with_solana_payment requires a signer")
        listing = await self._find_identity_listing(listing_id)
        price = _price(listing)
        execution = await execute_solana_x402_payment(
            signer=self._signer,
            rpc_url=rpc_url,
            secret_key=secret_key,
            mint=mint or SOLANA_USDC_MINT,
            decimals=decimals,
            payment={
                "scheme": "exact",
                "network": price["network"],
                "asset": price["asset"],
                "amount": price["amount"],
                "from": request.get("buyer"),
                "to": listing.get("seller"),
                "nonce": nonce or _marketplace_nonce("identity", listing_id),
                "expiresAt": expires_at,
                "metadata": {
                    "listingId": listing_id,
                    "identity": listing.get("name"),
                    "kind": "identity-listing",
                    **(metadata or {}),
                },
            },
        )
        sale = await self.buy_identity_listing(
            listing_id, {**request, "payment": execution["payment"]}
        )
        return {"listing": listing, "sale": sale, "payment": execution}

    async def list_bids(self, listing_id: str) -> JsonDict:
        return await self._http.get(f"/marketplace/identities/{encode(listing_id)}/bids")

    async def place_bid(self, listing_id: str, bid: JsonDict) -> Json:
        bid = {**bid, "listingId": listing_id}
        bid = await self._signed(bid, _identity_bid_payload, id_field="bidId", id_prefix="bid")
        return await self._post_owner(
            f"/marketplace/identities/{encode(listing_id)}/bids", bid.get("bidder"), bid
        )

    async def place_bid_with_solana_payment(
        self,
        listing_id: str,
        bid: JsonDict,
        *,
        nonce: str | None = None,
        expires_at: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Place an identity bid backed by a signed ``upto`` x402 authorization
        (no immediate transfer; funds are pulled if the bid wins).
        """
        if self._signer is None:
            raise ValueError("place_bid_with_solana_payment requires a signer")
        price = _price(bid)
        if not bid.get("bidder") or not price.get("amount"):
            raise ValueError("identity bid requires bidder and price.amount")
        listing = await self._find_identity_listing(listing_id)
        bid_id = bid.get("bidId") or _next_id("bid")
        payment = await build_x402_payment_map(
            self._signer,
            {
                "scheme": "upto",
                "network": price["network"],
                "asset": price["asset"],
                "amount": price["amount"],
                "from": bid["bidder"],
                "to": listing.get("seller"),
                "nonce": nonce or _marketplace_nonce("bid", bid_id),
                "expiresAt": expires_at,
                "metadata": {
                    "bidId": bid_id,
                    "identity": listing.get("name"),
                    "kind": "identity-bid",
                    "listingId": listing_id,
                    **(metadata or {}),
                },
            },
        )
        updated = await self.place_bid(
            listing_id, {**bid, "bidId": bid_id, "payment": payment}
        )
        return {"listing": listing, "updatedListing": updated, "payment": payment}

    async def _find_identity_listing(self, listing_id: str) -> JsonDict:
        listings = await self.list_identities()
        for candidate in (listings.get("identities") or []) if isinstance(listings, dict) else []:
            if isinstance(candidate, dict) and candidate.get("listingId") == listing_id:
                return candidate
        raise ValueError(f"Identity listing not found: {listing_id}")

    async def close_listing(
        self, listing_id: str, seller: str | None = None, request: JsonDict | None = None
    ) -> Json:
        return await self._post_owner(
            f"/marketplace/identities/{encode(listing_id)}/close", seller, request or {}
        )

    async def set_default_identity_listing(
        self, listing_id: str, request: JsonDict | None = None, seller: str | None = None
    ) -> Json:
        return await self._post_owner(
            f"/marketplace/identities/{encode(listing_id)}/default", seller, request or {}
        )

    async def identity_sale_history(self, name: str) -> JsonDict:
        return await self._http.get(f"/marketplace/identities/history/{encode(name)}")

    async def identity_floor(self, length: int | None = None) -> Json:
        return await self._http.get(
            "/marketplace/identities/floor", {"length": length} if length is not None else None
        )

    # --- Offers ---

    async def list_offers(self, params: Query = None) -> JsonDict:
        return await self._http.get("/marketplace/offers", params)

    async def create_offer(self, offer: JsonDict) -> Json:
        offer = await self._signed(offer, _identity_offer_payload, id_field="offerId", id_prefix="offer")
        return await self._post_owner("/marketplace/offers", offer.get("buyer"), offer)

    async def create_offer_with_solana_payment(
        self,
        offer: JsonDict,
        *,
        nonce: str | None = None,
        expires_at: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create an identity offer backed by a signed ``upto`` x402 authorization."""
        if self._signer is None:
            raise ValueError("create_offer_with_solana_payment requires a signer")
        price = _price(offer)
        if not offer.get("buyer") or not offer.get("name") or not price.get("amount"):
            raise ValueError("identity offer requires buyer, name, and price.amount")
        offer_id = offer.get("offerId") or _next_id("offer")
        payment = await build_x402_payment_map(
            self._signer,
            {
                "scheme": "upto",
                "network": price["network"],
                "asset": price["asset"],
                "amount": price["amount"],
                "from": offer["buyer"],
                "to": offer["name"],
                "nonce": nonce or _marketplace_nonce("offer", offer_id),
                "expiresAt": expires_at,
                "metadata": {
                    "kind": "identity-offer",
                    "name": offer["name"],
                    "offerId": offer_id,
                    **(metadata or {}),
                },
            },
        )
        created = await self.create_offer({**offer, "offerId": offer_id, "payment": payment})
        return {"offer": created, "payment": payment}

    async def cancel_offer(self, offer_id: str) -> None:
        await self._signed_delete(
            f"/marketplace/offers/{encode(offer_id)}",
            _identity_offer_cancel_payload(offer_id),
            public=False,
        )

    async def accept_offer(self, offer_id: str, request: JsonDict) -> Json:
        if self._signer is not None and not request.get("signature"):
            request = {
                **request,
                "signature": await sign_fresh_canonical_payload(
                    self._signer,
                    _identity_offer_accept_payload(offer_id, str(request.get("seller") or "")),
                ),
            }
        return await self._post_owner(
            f"/marketplace/offers/{encode(offer_id)}/accept", request.get("seller"), request
        )

    # --- Browsing ---

    async def browse_marketplace(self, params: Query = None) -> Json:
        return await self._http.get("/marketplace", params)

    async def categories(self) -> JsonDict:
        return await self._http.get("/marketplace/categories")

    async def featured(self) -> JsonDict:
        return await self._http.get("/marketplace/featured")

    async def recent(self) -> JsonDict:
        return await self._http.get("/marketplace/recent")

    # --- internals ---

    async def _signed(
        self,
        request: JsonDict,
        payload_fn: Any,
        *,
        id_field: str | None = None,
        id_prefix: str | None = None,
    ) -> JsonDict:
        """Attach a fresh canonical-payload signature (+ default id/signer key)."""
        if self._signer is None or request.get("signature"):
            return request
        request = dict(request)
        if id_field and id_prefix and not request.get(id_field):
            request[id_field] = _next_id(id_prefix)
        request["signature"] = await sign_fresh_canonical_payload(
            self._signer, payload_fn(request)
        )
        if self._public_key:
            request.setdefault("signerPublicKey", self._public_key)
        return request

    async def _signed_delete(self, path: str, payload: str, *, public: bool) -> None:
        if self._signer is None:
            await self._http.delete_directory_auth(path)
            return
        signature = await sign_fresh_canonical_payload(self._signer, payload)
        query = f"?signature={encode(signature)}"
        if self._public_key:
            query += f"&signerPublicKey={encode(self._public_key)}"
        full = f"{path}{query}"
        # Product deletes go through the public route; identity/offer
        # cancellations keep signed (Authorization) auth (matches the TS SDK).
        if public:
            await self._http.delete_public(full)
        else:
            await self._http.delete(full)

    async def _post_owner(self, path: str, owner: Any, body: JsonDict) -> Json:
        if owner:
            return await self._http.post_directory_auth_as(path, str(owner), body)
        return await self._http.post_directory_auth(path, body)


def _next_id(prefix: str) -> str:
    return f"{prefix}_{int(time.time() * 1000):x}_{secrets.token_hex(6)}"


def _marketplace_nonce(kind: str, id_: str) -> str:
    return f"{kind}_{id_}_{secrets.token_hex(12)}"


def _price(obj: Any) -> dict[str, Any]:
    """Extract the ``{network, asset, amount}`` price object, or raise."""
    price = obj.get("price") if isinstance(obj, dict) else None
    if not isinstance(price, dict):
        raise ValueError("missing price object (expected network/asset/amount)")
    return price


# Canonical signature payloads — must byte-match the backend / TS SDK exactly.


def _product_payload(product: JsonDict) -> str:
    return canonical_payload(
        "marketplace.product",
        {
            "category": product.get("category"),
            "deliveryMethod": product.get("deliveryMethod"),
            "description": product.get("description"),
            "name": product.get("name"),
            "price": product.get("price"),
            "productId": product.get("productId") or "",
            "seller": product.get("seller") or "",
            "sellerCryptoId": product.get("sellerCryptoId") or "",
            "stock": product.get("stock"),
            "tags": product.get("tags"),
        },
    )


def _product_delete_payload(product_id: str) -> str:
    return canonical_payload("marketplace.product.delete", {"productId": product_id})


def _product_review_payload(review: JsonDict) -> str:
    return canonical_payload(
        "marketplace.product.review",
        {
            "buyer": review.get("buyer") or "",
            "comment": review.get("comment") or "",
            "productId": review.get("productId") or "",
            "rating": review.get("rating") or 0,
            "reviewId": review.get("reviewId") or "",
        },
    )


def _identity_listing_payload(listing: JsonDict) -> str:
    return canonical_payload(
        "marketplace.identity.listing",
        {
            "description": listing.get("description") or "",
            "listingId": listing.get("listingId") or "",
            "listingType": listing.get("listingType") or "",
            "name": listing.get("name") or "",
            "price": listing.get("price"),
            "seller": listing.get("seller") or "",
            "sellerCryptoId": listing.get("sellerCryptoId") or "",
            "tags": listing.get("tags"),
        },
    )


def _identity_listing_cancel_payload(listing_id: str) -> str:
    return canonical_payload("marketplace.identity.listing.cancel", {"listingId": listing_id})


def _identity_buy_payload(listing_id: str, request: JsonDict) -> str:
    return canonical_payload(
        "marketplace.identity.buy",
        {
            "buyer": request.get("buyer"),
            "buyerCryptoId": request.get("buyerCryptoId"),
            "buyerPublicKey": request.get("buyerPublicKey") or "",
            "listingId": listing_id,
        },
    )


def _identity_bid_payload(bid: JsonDict) -> str:
    return canonical_payload(
        "marketplace.identity.bid",
        {
            "bidId": bid.get("bidId") or "",
            "bidder": bid.get("bidder") or "",
            "bidderCryptoId": bid.get("bidderCryptoId") or "",
            "bidderPublicKey": bid.get("bidderPublicKey") or "",
            "listingId": bid.get("listingId") or "",
            "price": bid.get("price"),
        },
    )


def _identity_offer_payload(offer: JsonDict) -> str:
    return canonical_payload(
        "marketplace.identity.offer",
        {
            "buyer": offer.get("buyer") or "",
            "buyerCryptoId": offer.get("buyerCryptoId") or "",
            "buyerPublicKey": offer.get("buyerPublicKey") or "",
            "listingId": offer.get("listingId") or "",
            "name": offer.get("name") or "",
            "offerId": offer.get("offerId") or "",
            "price": offer.get("price"),
        },
    )


def _identity_offer_cancel_payload(offer_id: str) -> str:
    return canonical_payload("marketplace.identity.offer.cancel", {"offerId": offer_id})


def _identity_offer_accept_payload(offer_id: str, seller: str) -> str:
    return canonical_payload(
        "marketplace.identity.offer.accept", {"offerId": offer_id, "seller": seller}
    )
