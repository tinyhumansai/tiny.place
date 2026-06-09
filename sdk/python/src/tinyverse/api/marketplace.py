from __future__ import annotations

from typing import Any, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient


class MarketplaceApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list_products(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get("/marketplace/products", params)

    async def create_product(self, product: dict[str, Any]) -> Any:
        return await self._http.post("/marketplace/products", product)

    async def get_product(self, product_id: str) -> Any:
        return await self._http.get(f"/marketplace/products/{url_encode(product_id, safe='')}")

    async def update_product(self, product_id: str, update: dict[str, Any]) -> Any:
        return await self._http.put(
            f"/marketplace/products/{url_encode(product_id, safe='')}",
            update,
        )

    async def delete_product(self, product_id: str) -> None:
        await self._http.delete(f"/marketplace/products/{url_encode(product_id, safe='')}")

    async def buy_product(self, product_id: str, payment: dict[str, str]) -> Any:
        return await self._http.post(
            f"/marketplace/products/{url_encode(product_id, safe='')}/buy",
            payment,
        )

    async def download_product(self, product_id: str, purchase_id: str) -> Any:
        return await self._http.get_auth(
            f"/marketplace/products/{url_encode(product_id, safe='')}/download/{url_encode(purchase_id, safe='')}",
        )

    async def list_product_reviews(self, product_id: str) -> Any:
        return await self._http.get(
            f"/marketplace/products/{url_encode(product_id, safe='')}/reviews",
        )

    async def create_product_review(self, product_id: str, review: dict[str, Any]) -> Any:
        return await self._http.post(
            f"/marketplace/products/{url_encode(product_id, safe='')}/reviews",
            review,
        )

    async def list_identities(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get("/marketplace/identities", params)

    async def create_identity_listing(self, listing: dict[str, Any]) -> Any:
        return await self._http.post("/marketplace/identities", listing)

    async def delete_identity_listing(self, listing_id: str) -> None:
        await self._http.delete(f"/marketplace/identities/{url_encode(listing_id, safe='')}")

    async def buy_identity_listing(self, listing_id: str, payment: dict[str, str]) -> Any:
        return await self._http.post(
            f"/marketplace/identities/{url_encode(listing_id, safe='')}/buy",
            payment,
        )

    async def list_bids(self, listing_id: str) -> Any:
        return await self._http.get(
            f"/marketplace/identities/{url_encode(listing_id, safe='')}/bids",
        )

    async def place_bid(self, listing_id: str, bid: dict[str, Any]) -> Any:
        return await self._http.post(
            f"/marketplace/identities/{url_encode(listing_id, safe='')}/bids",
            bid,
        )

    async def close_listing(self, listing_id: str) -> Any:
        return await self._http.post(
            f"/marketplace/identities/{url_encode(listing_id, safe='')}/close",
        )

    async def identity_sale_history(self, name: str) -> Any:
        return await self._http.get(
            f"/marketplace/identities/history/{url_encode(name, safe='')}",
        )

    async def identity_floor(self, length: Optional[int] = None) -> Any:
        return await self._http.get(
            "/marketplace/identities/floor",
            {"length": length} if length is not None else None,
        )

    async def create_offer(self, offer: dict[str, Any]) -> Any:
        return await self._http.post("/marketplace/offers", offer)

    async def cancel_offer(self, offer_id: str) -> None:
        await self._http.delete(f"/marketplace/offers/{url_encode(offer_id, safe='')}")

    async def accept_offer(self, offer_id: str) -> Any:
        return await self._http.post(
            f"/marketplace/offers/{url_encode(offer_id, safe='')}/accept",
        )

    async def categories(self) -> Any:
        return await self._http.get("/marketplace/categories")

    async def featured(self) -> Any:
        return await self._http.get("/marketplace/featured")

    async def recent(self) -> Any:
        return await self._http.get("/marketplace/recent")
