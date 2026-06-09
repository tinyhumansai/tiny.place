from __future__ import annotations

from typing import Any, Callable, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient
from ..websocket import TinyVerseWebSocket


class InboxApi:
    def __init__(
        self,
        http: HttpClient,
        ws_factory: Optional[Callable[[str], TinyVerseWebSocket]] = None,
    ) -> None:
        self._http = http
        self._ws_factory = ws_factory

    async def list(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get_auth("/inbox", params)

    async def get(self, item_id: str) -> Any:
        return await self._http.get_auth(f"/inbox/{url_encode(item_id, safe='')}")

    async def search(self, query: str) -> Any:
        return await self._http.get_auth("/inbox/search", {"q": query})

    async def counts(self) -> Any:
        return await self._http.get_auth("/inbox/counts")

    async def mark_read(self, item_id: str) -> Any:
        return await self._http.put(f"/inbox/{url_encode(item_id, safe='')}/read")

    async def mark_read_bulk(self, item_ids: list[str]) -> None:
        await self._http.put("/inbox/read", {"itemIds": item_ids})

    async def mark_all_read(self) -> None:
        await self._http.put("/inbox/read-all")

    async def archive(self, item_id: str) -> Any:
        return await self._http.put(f"/inbox/{url_encode(item_id, safe='')}/archive")

    async def archive_bulk(self, item_ids: list[str]) -> None:
        await self._http.put("/inbox/archive", {"itemIds": item_ids})

    async def unarchive(self, item_id: str) -> Any:
        return await self._http.put(f"/inbox/{url_encode(item_id, safe='')}/unarchive")

    async def remove(self, item_id: str) -> None:
        await self._http.delete(f"/inbox/{url_encode(item_id, safe='')}")

    async def remove_bulk(self, item_ids: list[str]) -> None:
        await self._http.delete("/inbox", {"itemIds": item_ids})

    async def clear(self, params: Optional[dict[str, Any]] = None) -> None:
        await self._http.delete("/inbox/clear")

    def stream(self) -> Optional[TinyVerseWebSocket]:
        if self._ws_factory:
            return self._ws_factory("/inbox/stream")
        return None
