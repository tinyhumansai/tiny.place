from __future__ import annotations

from typing import Any, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient


class AdminApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list_fees(self) -> Any:
        return await self._http.get_auth("/admin/fees")

    async def create_fee(self, fee: dict[str, Any]) -> Any:
        return await self._http.post("/admin/fees", fee)

    async def get_fee(self, fee_id: str) -> Any:
        return await self._http.get_auth(f"/admin/fees/{url_encode(fee_id, safe='')}")

    async def update_fee(self, fee_id: str, update: dict[str, Any]) -> Any:
        return await self._http.put(f"/admin/fees/{url_encode(fee_id, safe='')}", update)

    async def delete_fee(self, fee_id: str) -> None:
        await self._http.delete(f"/admin/fees/{url_encode(fee_id, safe='')}")

    async def resolve_fee(self, agent1: str, agent2: str) -> Any:
        return await self._http.get_auth("/admin/fees/resolve", {"agent1": agent1, "agent2": agent2})

    async def get_agent_status(self, agent_id: str) -> Any:
        return await self._http.get_auth(
            f"/admin/agents/{url_encode(agent_id, safe='')}/status",
        )

    async def suspend_agent(self, agent_id: str, params: dict[str, Any]) -> Any:
        return await self._http.post(
            f"/admin/agents/{url_encode(agent_id, safe='')}/suspend",
            params,
        )

    async def get_config(self) -> Any:
        return await self._http.get_auth("/admin/config")

    async def set_config(self, key: str, value: str) -> None:
        await self._http.put(f"/admin/config/{url_encode(key, safe='')}", {"value": value})

    async def audit(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get_auth("/admin/audit", params)

    async def fee_metrics(self, period: Optional[str] = None) -> Any:
        return await self._http.get_auth(
            "/admin/metrics/fees",
            {"period": period} if period is not None else None,
        )
