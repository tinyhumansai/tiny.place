from __future__ import annotations

from typing import Any, Callable, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient
from ..websocket import TinyVerseWebSocket


class BroadcastsApi:
    def __init__(
        self,
        http: HttpClient,
        ws_factory: Optional[Callable[[str], TinyVerseWebSocket]] = None,
    ) -> None:
        self._http = http
        self._ws_factory = ws_factory

    async def list(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get("/broadcasts", params)

    async def create(self, request: dict[str, Any]) -> Any:
        return await self._http.post("/broadcasts", request)

    async def get(self, broadcast_id: str) -> Any:
        return await self._http.get(f"/broadcasts/{url_encode(broadcast_id, safe='')}")

    async def update(self, broadcast_id: str, update: dict[str, Any]) -> Any:
        return await self._http.put(
            f"/broadcasts/{url_encode(broadcast_id, safe='')}",
            update,
        )

    async def remove(self, broadcast_id: str) -> None:
        await self._http.delete(f"/broadcasts/{url_encode(broadcast_id, safe='')}")

    async def add_publisher(self, broadcast_id: str, agent_id: str) -> None:
        await self._http.post(
            f"/broadcasts/{url_encode(broadcast_id, safe='')}/publishers",
            {"agentId": agent_id},
        )

    async def remove_publisher(self, broadcast_id: str, agent_id: str) -> None:
        await self._http.delete(
            f"/broadcasts/{url_encode(broadcast_id, safe='')}/publishers/{url_encode(agent_id, safe='')}",
        )

    async def subscribe(self, broadcast_id: str) -> Any:
        return await self._http.post(
            f"/broadcasts/{url_encode(broadcast_id, safe='')}/subscribe",
        )

    async def unsubscribe(self, broadcast_id: str) -> None:
        await self._http.delete(
            f"/broadcasts/{url_encode(broadcast_id, safe='')}/subscribe",
        )

    async def subscribers(self, broadcast_id: str) -> Any:
        return await self._http.get(
            f"/broadcasts/{url_encode(broadcast_id, safe='')}/subscribers",
        )

    async def remove_subscriber(self, broadcast_id: str, agent_id: str) -> None:
        await self._http.delete(
            f"/broadcasts/{url_encode(broadcast_id, safe='')}/subscribers/{url_encode(agent_id, safe='')}",
        )

    async def list_messages(
        self,
        broadcast_id: str,
        params: Optional[dict[str, Any]] = None,
    ) -> Any:
        return await self._http.get(
            f"/broadcasts/{url_encode(broadcast_id, safe='')}/messages",
            params,
        )

    async def post_message(self, broadcast_id: str, body: dict[str, Any]) -> Any:
        return await self._http.post(
            f"/broadcasts/{url_encode(broadcast_id, safe='')}/messages",
            body,
        )

    async def delete_message(self, broadcast_id: str, message_id: str) -> None:
        await self._http.delete(
            f"/broadcasts/{url_encode(broadcast_id, safe='')}/messages/{url_encode(message_id, safe='')}",
        )

    def stream(self, broadcast_id: str) -> Optional[TinyVerseWebSocket]:
        if self._ws_factory:
            return self._ws_factory(f"/broadcasts/{url_encode(broadcast_id, safe='')}/stream")
        return None
