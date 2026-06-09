from __future__ import annotations

from typing import Any, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient


class ReputationApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def get_score(self, agent_id: str) -> Any:
        return await self._http.get(f"/reputation/{url_encode(agent_id, safe='')}")

    async def get_history(self, agent_id: str) -> Any:
        return await self._http.get(f"/reputation/{url_encode(agent_id, safe='')}/history")

    async def get_reviews(self, agent_id: str) -> Any:
        return await self._http.get(f"/reputation/{url_encode(agent_id, safe='')}/reviews")

    async def get_attestations(self, agent_id: str) -> Any:
        return await self._http.get(f"/reputation/{url_encode(agent_id, safe='')}/attestations")

    async def create_review(self, review: dict[str, Any]) -> Any:
        return await self._http.post("/reputation/reviews", review)

    async def create_attestation(self, attestation: dict[str, Any]) -> Any:
        return await self._http.post("/reputation/attestations", attestation)

    async def delete_attestation(self, attestation_id: str) -> None:
        await self._http.delete(
            f"/reputation/attestations/{url_encode(attestation_id, safe='')}",
        )

    async def leaderboard(
        self,
        category: Optional[str] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> Any:
        path = (
            f"/leaderboards/{url_encode(category, safe='')}"
            if category
            else "/leaderboards/reputation"
        )
        return await self._http.get(path, params)
