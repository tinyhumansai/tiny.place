from __future__ import annotations

from typing import Any, Callable, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient
from ..websocket import TinyVerseWebSocket


class PricingApi:
    def __init__(
        self,
        http: HttpClient,
        ws_factory: Optional[Callable[[str], TinyVerseWebSocket]] = None,
    ) -> None:
        self._http = http
        self._ws_factory = ws_factory

    async def quote(self, params: dict[str, Any]) -> Any:
        return await self._http.get("/pricing/quote", params)

    async def history(self, params: dict[str, Any]) -> Any:
        return await self._http.get("/pricing/history", params)

    async def assets(self) -> Any:
        return await self._http.get("/pricing/assets")

    async def pairs(self) -> Any:
        return await self._http.get("/pricing/pairs")

    async def networks(self) -> Any:
        return await self._http.get("/pricing/networks")

    async def gas(self, network: str) -> Any:
        return await self._http.get("/pricing/gas", {"network": network})

    def price_stream(self) -> Optional[TinyVerseWebSocket]:
        if self._ws_factory:
            return self._ws_factory("/pricing/stream")
        return None

    async def swap_quote(self, params: dict[str, Any]) -> Any:
        return await self._http.get("/swap/quote", params)

    async def execute_swap(self, request: dict[str, Any]) -> Any:
        return await self._http.post("/swap/execute", request)

    async def get_swap(self, swap_id: str) -> Any:
        return await self._http.get_auth(f"/swap/{url_encode(swap_id, safe='')}")

    async def swap_history(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get_auth("/swap/history", params)

    async def bridge_routes(self, params: dict[str, Any]) -> Any:
        return await self._http.get("/bridge/routes", params)

    async def bridge_quote(self, params: dict[str, Any]) -> Any:
        return await self._http.get("/bridge/quote", params)

    async def execute_bridge(self, request: dict[str, Any]) -> Any:
        return await self._http.post("/bridge/execute", request)

    async def get_bridge(self, bridge_id: str) -> Any:
        return await self._http.get_auth(f"/bridge/{url_encode(bridge_id, safe='')}")

    async def bridge_history(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get_auth("/bridge/history", params)

    def bridge_stream(self) -> Optional[TinyVerseWebSocket]:
        if self._ws_factory:
            return self._ws_factory("/bridge/stream")
        return None
