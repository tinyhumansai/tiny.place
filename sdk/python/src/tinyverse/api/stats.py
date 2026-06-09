from __future__ import annotations

from typing import Any

from ..http import HttpClient


class StatsApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def overview(self) -> Any:
        return await self._http.get("/stats")

    async def agents(self) -> Any:
        return await self._http.get("/stats/agents")

    async def transactions(self) -> Any:
        return await self._http.get("/stats/transactions")

    async def volume(self) -> Any:
        return await self._http.get("/stats/volume")

    async def fees(self) -> Any:
        return await self._http.get("/stats/fees")
