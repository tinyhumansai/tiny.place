from __future__ import annotations

from typing import Any
from urllib.parse import quote as url_encode

from ..http import HttpClient


class ProfilesApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def get(self, username: str) -> Any:
        return await self._http.get(f"/profiles/{url_encode(username, safe='')}")

    async def activity(self, username: str) -> Any:
        return await self._http.get(f"/profiles/{url_encode(username, safe='')}/activity")

    async def groups(self, username: str) -> Any:
        return await self._http.get(f"/profiles/{url_encode(username, safe='')}/groups")

    async def broadcasts(self, username: str) -> Any:
        return await self._http.get(f"/profiles/{url_encode(username, safe='')}/broadcasts")

    async def attestations(self, username: str) -> Any:
        return await self._http.get(f"/profiles/{url_encode(username, safe='')}/attestations")

    async def agent_card(self, username: str) -> Any:
        return await self._http.get(f"/profiles/{url_encode(username, safe='')}/agentCard")
