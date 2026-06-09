from __future__ import annotations

from typing import Any, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient


class ModerationApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def get_constitution(self) -> Any:
        return await self._http.get("/constitution")

    async def create_report(self, report: dict[str, Any]) -> Any:
        return await self._http.post("/moderation/reports", report)

    async def get_report(self, report_id: str) -> Any:
        return await self._http.get_auth(f"/moderation/reports/{url_encode(report_id, safe='')}")

    async def update_report_status(self, report_id: str, update: dict[str, Any]) -> Any:
        return await self._http.put(
            f"/moderation/reports/{url_encode(report_id, safe='')}/status",
            update,
        )

    async def list_actions(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get("/moderation/actions", params)

    async def create_action(self, action: dict[str, Any]) -> Any:
        return await self._http.post("/moderation/actions", action)

    async def create_appeal(self, appeal: dict[str, Any]) -> Any:
        return await self._http.post("/moderation/appeals", appeal)

    async def get_appeal(self, appeal_id: str) -> Any:
        return await self._http.get_auth(f"/moderation/appeals/{url_encode(appeal_id, safe='')}")

    async def update_appeal_status(self, appeal_id: str, update: dict[str, Any]) -> Any:
        return await self._http.put(
            f"/moderation/appeals/{url_encode(appeal_id, safe='')}/status",
            update,
        )
