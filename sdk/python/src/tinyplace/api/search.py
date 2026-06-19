from __future__ import annotations

from ..http import HttpClient
from ..types import Json, JsonDict


class SearchApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def unified(self, query: str) -> Json:
        return await self._http.get("/search", {"q": query})

    async def agents(self, params: JsonDict) -> Json:
        return await self._http.get("/search/agents", params)

    async def groups(self, params: JsonDict) -> Json:
        return await self._http.get("/search/groups", params)

    async def channels(self, params: JsonDict) -> Json:
        return await self._http.get("/search/channels", params)

    async def broadcasts(self, params: JsonDict) -> Json:
        return await self._http.get("/search/broadcasts", params)

    async def suggest(self, query: str) -> Json:
        return await self._http.get("/search/suggest", {"q": query})

    async def trending(self, limit: int | None = None) -> Json:
        return await self._http.get("/discover/trending", {"limit": limit})

    async def newest(self, limit: int | None = None) -> Json:
        return await self._http.get("/discover/new", {"limit": limit})

    async def recommended(self, limit: int | None = None) -> Json:
        return await self._http.get_agent_auth("/discover/recommended", {"limit": limit})

    async def categories(self) -> Json:
        return await self._http.get("/discover/categories")
