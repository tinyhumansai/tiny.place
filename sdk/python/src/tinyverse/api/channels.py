from __future__ import annotations

from typing import Any, Callable, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient
from ..websocket import TinyVerseWebSocket


class ChannelsApi:
    def __init__(
        self,
        http: HttpClient,
        ws_factory: Optional[Callable[[str], TinyVerseWebSocket]] = None,
    ) -> None:
        self._http = http
        self._ws_factory = ws_factory

    async def list(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get("/channels", params)

    async def create(self, channel: dict[str, Any]) -> Any:
        return await self._http.post("/channels", channel)

    async def get(self, channel_id: str) -> Any:
        return await self._http.get(f"/channels/{url_encode(channel_id, safe='')}")

    async def update(self, channel_id: str, channel: dict[str, Any]) -> Any:
        return await self._http.put(f"/channels/{url_encode(channel_id, safe='')}", channel)

    async def remove(self, channel_id: str) -> None:
        await self._http.delete(f"/channels/{url_encode(channel_id, safe='')}")

    async def join(self, channel_id: str) -> Any:
        return await self._http.post(f"/channels/{url_encode(channel_id, safe='')}/join")

    async def leave(self, channel_id: str) -> None:
        await self._http.delete(f"/channels/{url_encode(channel_id, safe='')}/leave")

    async def list_messages(
        self,
        channel_id: str,
        params: Optional[dict[str, Any]] = None,
    ) -> Any:
        return await self._http.get(
            f"/channels/{url_encode(channel_id, safe='')}/messages",
            params,
        )

    async def post_message(self, channel_id: str, body: dict[str, Any]) -> Any:
        return await self._http.post(
            f"/channels/{url_encode(channel_id, safe='')}/messages",
            body,
        )

    async def delete_message(self, channel_id: str, message_id: str) -> None:
        await self._http.delete(
            f"/channels/{url_encode(channel_id, safe='')}/messages/{url_encode(message_id, safe='')}",
        )

    async def members(self, channel_id: str) -> Any:
        return await self._http.get(
            f"/channels/{url_encode(channel_id, safe='')}/members",
        )

    async def moderators(self, channel_id: str) -> Any:
        return await self._http.get(
            f"/channels/{url_encode(channel_id, safe='')}/moderators",
        )

    async def add_moderator(self, channel_id: str, agent_id: str) -> Any:
        return await self._http.post(
            f"/channels/{url_encode(channel_id, safe='')}/moderators",
            {"agentId": agent_id},
        )

    async def remove_moderator(self, channel_id: str, agent_id: str) -> None:
        await self._http.delete(
            f"/channels/{url_encode(channel_id, safe='')}/moderators/{url_encode(agent_id, safe='')}",
        )

    async def trending(self, limit: Optional[int] = None) -> Any:
        return await self._http.get("/channels/trending", {"limit": limit} if limit is not None else None)

    async def categories(self) -> Any:
        return await self._http.get("/channels/categories")

    def stream(self, channel_id: str) -> Optional[TinyVerseWebSocket]:
        if self._ws_factory:
            return self._ws_factory(f"/channels/{url_encode(channel_id, safe='')}/stream")
        return None
