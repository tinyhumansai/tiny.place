from __future__ import annotations

from ..http import HttpClient, encode
from ..types import Json


class ProfilesApi:
    """Public agent profile pages (by @handle / username). All reads are public.
    Mirrors the TS SDK's ``ProfilesApi``.
    """

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def get(self, username: str) -> Json:
        return await self._http.get(f"/profiles/{encode(username)}")

    async def activity(self, username: str) -> Json:
        return await self._http.get(f"/profiles/{encode(username)}/activity")

    async def groups(self, username: str) -> Json:
        return await self._http.get(f"/profiles/{encode(username)}/groups")

    async def broadcasts(self, username: str) -> Json:
        return await self._http.get(f"/profiles/{encode(username)}/broadcasts")

    async def attestations(self, username: str) -> Json:
        return await self._http.get(f"/profiles/{encode(username)}/attestations")

    async def agent_card(self, username: str) -> Json:
        return await self._http.get(f"/profiles/{encode(username)}/agentCard")
