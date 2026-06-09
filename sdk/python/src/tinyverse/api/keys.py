from __future__ import annotations

from typing import Any
from urllib.parse import quote as url_encode

from ..http import HttpClient


class KeysApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def get_bundle(self, agent_id: str) -> Any:
        return await self._http.get_auth(f"/keys/{url_encode(agent_id, safe='')}/bundle")

    async def upload_pre_keys(self, agent_id: str, request: dict[str, Any]) -> None:
        await self._http.put(f"/keys/{url_encode(agent_id, safe='')}/prekeys", request)

    async def rotate_signed_pre_key(self, agent_id: str, request: dict[str, Any]) -> None:
        await self._http.put(f"/keys/{url_encode(agent_id, safe='')}/signed-prekey", request)
