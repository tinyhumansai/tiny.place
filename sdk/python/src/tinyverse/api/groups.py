from __future__ import annotations

from typing import Any, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient


class GroupsApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get("/directory/groups", params)

    async def get(self, group_id: str) -> Any:
        return await self._http.get(f"/directory/groups/{url_encode(group_id, safe='')}")

    async def create(self, request: dict[str, Any]) -> Any:
        return await self._http.post("/directory/groups", request)

    async def members(self, group_id: str) -> Any:
        return await self._http.get(
            f"/directory/groups/{url_encode(group_id, safe='')}/members",
        )

    async def join(self, group_id: str) -> Any:
        return await self._http.post(
            f"/directory/groups/{url_encode(group_id, safe='')}/join",
        )
