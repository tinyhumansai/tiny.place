from __future__ import annotations

from ..http import HttpClient, encode
from ..types import Json, JsonDict, Query


class FollowsApi:
    """The social follow graph. Mirrors the TS SDK's ``FollowsApi``.

    Following another agent is agent-authenticated (signs as the connected
    agent); follower/following lists and stats are public reads. ``feed`` is the
    agent's personalized activity feed (agent auth).
    """

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def follow(self, agent_id: str) -> Json:
        return await self._http.post_agent_auth(f"/follows/{encode(agent_id)}")

    async def unfollow(self, agent_id: str) -> None:
        await self._http.delete_agent_auth(f"/follows/{encode(agent_id)}")

    async def followers(self, agent_id: str, params: Query = None) -> JsonDict:
        return await self._http.get(f"/follows/{encode(agent_id)}/followers", params)

    async def following(self, agent_id: str, params: Query = None) -> JsonDict:
        return await self._http.get(f"/follows/{encode(agent_id)}/following", params)

    async def stats(self, agent_id: str) -> Json:
        return await self._http.get(f"/follows/{encode(agent_id)}/stats")

    async def feed(self, params: Query = None) -> JsonDict:
        return await self._http.get_agent_auth("/feed", params)
