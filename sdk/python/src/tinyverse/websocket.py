from __future__ import annotations

import asyncio
import json
from typing import Any, Callable, Optional
from urllib.parse import quote as url_encode

import aiohttp

from .auth import SigningKey, sign_request

WebSocketEventHandler = Callable[[Any], None]


class TinyVerseWebSocket:
    def __init__(
        self,
        url: str,
        signing_key: Optional[SigningKey] = None,
        reconnect: bool = True,
        reconnect_interval: float = 3.0,
        max_reconnect_attempts: int = 10,
        session: Optional[aiohttp.ClientSession] = None,
    ) -> None:
        self._url = url
        self._signing_key = signing_key
        self._reconnect = reconnect
        self._reconnect_interval = reconnect_interval
        self._max_reconnect_attempts = max_reconnect_attempts
        self._session = session
        self._owns_session = session is None
        self._ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self._handlers: dict[str, set[WebSocketEventHandler]] = {}
        self._reconnect_count = 0
        self._closed = False
        self._receive_task: Optional[asyncio.Task[None]] = None

    async def connect(self) -> None:
        self._closed = False
        ws_url = self._url

        if self._signing_key:
            auth_headers = await sign_request(self._signing_key, "")
            auth = url_encode(auth_headers["Authorization"], safe="")
            separator = "&" if "?" in ws_url else "?"
            ws_url = f"{ws_url}{separator}authorization={auth}"

        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
            self._owns_session = True

        self._ws = await self._session.ws_connect(ws_url)
        self._reconnect_count = 0
        self._emit("open", None)
        self._receive_task = asyncio.create_task(self._receive_loop())

    async def _receive_loop(self) -> None:
        assert self._ws is not None
        try:
            async for msg in self._ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                        self._emit("message", data)
                        if isinstance(data, dict) and "type" in data:
                            self._emit(data["type"], data)
                    except (json.JSONDecodeError, ValueError):
                        self._emit("message", msg.data)
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    self._emit("error", self._ws.exception())
                elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSING, aiohttp.WSMsgType.CLOSED):
                    break
        finally:
            self._emit("close", None)
            if not self._closed and self._reconnect and self._reconnect_count < self._max_reconnect_attempts:
                self._reconnect_count += 1
                await asyncio.sleep(self._reconnect_interval)
                try:
                    await self.connect()
                except Exception:
                    pass

    def on(self, event: str, handler: WebSocketEventHandler) -> Callable[[], None]:
        if event not in self._handlers:
            self._handlers[event] = set()
        self._handlers[event].add(handler)

        def unsubscribe() -> None:
            self._handlers.get(event, set()).discard(handler)

        return unsubscribe

    def _emit(self, event: str, data: Any) -> None:
        for handler in self._handlers.get(event, set()):
            handler(data)

    async def send(self, data: Any) -> None:
        if self._ws and not self._ws.closed:
            await self._ws.send_json(data)

    async def close(self) -> None:
        self._closed = True
        if self._receive_task and not self._receive_task.done():
            self._receive_task.cancel()
        if self._ws and not self._ws.closed:
            await self._ws.close()
        self._ws = None
        if self._owns_session and self._session and not self._session.closed:
            await self._session.close()
