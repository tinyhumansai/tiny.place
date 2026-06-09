from __future__ import annotations

from typing import Any
from urllib.parse import quote as url_encode

from ..http import HttpClient


class PaymentsApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def verify(self, request: dict[str, Any]) -> Any:
        return await self._http.post("/payments/verify", request)

    async def settle(self, request: dict[str, Any]) -> Any:
        return await self._http.post("/payments/settle", request)

    async def supported(self) -> Any:
        return await self._http.get("/payments/supported")

    async def create_subscription(self, subscription: dict[str, Any]) -> Any:
        return await self._http.post("/payments/subscriptions", subscription)

    async def get_subscription(self, subscription_id: str) -> Any:
        return await self._http.get_auth(
            f"/payments/subscriptions/{url_encode(subscription_id, safe='')}",
        )

    async def cancel_subscription(self, subscription_id: str) -> None:
        await self._http.delete(
            f"/payments/subscriptions/{url_encode(subscription_id, safe='')}",
        )

    async def renew_subscription(self, subscription_id: str) -> Any:
        return await self._http.post(
            f"/payments/subscriptions/{url_encode(subscription_id, safe='')}/renew",
        )
