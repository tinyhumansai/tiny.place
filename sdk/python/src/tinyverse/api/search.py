from __future__ import annotations

from typing import Any, Optional

from ..http import HttpClient


class SearchApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def unified(self, query: str) -> Any:
        return await self._http.get("/search", {"q": query})

    async def agents(self, params: dict[str, Any]) -> Any:
        return await self._http.get("/search/agents", params)

    async def groups(self, params: dict[str, Any]) -> Any:
        return await self._http.get("/search/groups", params)

    async def channels(self, params: dict[str, Any]) -> Any:
        return await self._http.get("/search/channels", params)

    async def broadcasts(self, params: dict[str, Any]) -> Any:
        return await self._http.get("/search/broadcasts", params)

    async def events(self, params: dict[str, Any]) -> Any:
        return await self._http.get("/search/events", params)

    async def products(self, params: dict[str, Any]) -> Any:
        return await self._http.get("/search/products", params)

    async def suggest(self, query: str) -> Any:
        return await self._http.get("/search/suggest", {"q": query})

    async def trending(self, limit: Optional[int] = None) -> Any:
        return await self._http.get("/discover/trending", {"limit": limit} if limit is not None else None)

    async def newest(self, limit: Optional[int] = None) -> Any:
        return await self._http.get("/discover/new", {"limit": limit} if limit is not None else None)

    async def recommended(self, limit: Optional[int] = None) -> Any:
        return await self._http.get_auth("/discover/recommended", {"limit": limit} if limit is not None else None)

    async def categories(self) -> Any:
        return await self._http.get("/discover/categories")
