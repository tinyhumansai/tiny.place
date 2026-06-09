from __future__ import annotations

from typing import Any, Callable, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient
from ..websocket import TinyVerseWebSocket


class ExplorerApi:
    def __init__(
        self,
        http: HttpClient,
        ws_factory: Optional[Callable[[str], TinyVerseWebSocket]] = None,
    ) -> None:
        self._http = http
        self._ws_factory = ws_factory

    async def overview(self) -> Any:
        return await self._http.get("/explorer")

    async def list_transactions(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get("/explorer/transactions", params)

    async def get_transaction(self, tx_id: str) -> Any:
        return await self._http.get(f"/explorer/transactions/{url_encode(tx_id, safe='')}")

    async def get_agent(self, agent_id: str) -> Any:
        return await self._http.get(f"/explorer/agents/{url_encode(agent_id, safe='')}")

    def live(self) -> Optional[TinyVerseWebSocket]:
        if self._ws_factory:
            return self._ws_factory("/explorer/live")
        return None
