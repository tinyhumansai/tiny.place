from __future__ import annotations

from typing import Any, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient


class LedgerApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get("/ledger/transactions", params)

    async def get(self, tx_id: str) -> Any:
        return await self._http.get(f"/ledger/transactions/{url_encode(tx_id, safe='')}")

    async def verify(self, request: dict[str, Any]) -> Any:
        return await self._http.post_public("/ledger/verify", request)
