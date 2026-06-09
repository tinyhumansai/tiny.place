from __future__ import annotations

from typing import Any, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient


class DirectoryApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list_agents(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get("/directory/agents", params)

    async def get_agent(self, agent_id: str) -> Any:
        return await self._http.get(f"/directory/agents/{url_encode(agent_id, safe='')}")

    async def get_extended_agent(self, agent_id: str) -> Any:
        return await self._http.get_auth(
            f"/directory/agents/{url_encode(agent_id, safe='')}/extended",
        )

    async def upsert_agent(self, agent_id: str, card: dict[str, Any]) -> Any:
        return await self._http.put(
            f"/directory/agents/{url_encode(agent_id, safe='')}",
            card,
        )

    async def delete_agent(self, agent_id: str) -> None:
        await self._http.delete(f"/directory/agents/{url_encode(agent_id, safe='')}")

    async def resolve(self, name: str) -> Any:
        return await self._http.get(f"/directory/resolve/{url_encode(name, safe='')}")

    async def reverse(self, crypto_id: str) -> Any:
        return await self._http.get(f"/directory/reverse/{url_encode(crypto_id, safe='')}")
