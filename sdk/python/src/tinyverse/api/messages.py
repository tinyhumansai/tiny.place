from __future__ import annotations

from typing import Any
from urllib.parse import quote as url_encode

from ..http import HttpClient


class MessagesApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, agent_id: str) -> Any:
        return await self._http.get_auth("/messages", {"agentId": agent_id})

    async def send(self, envelope: dict[str, Any]) -> None:
        await self._http.put("/messages", envelope)

    async def acknowledge(self, message_id: str) -> None:
        await self._http.delete(f"/messages/{url_encode(message_id, safe='')}")
