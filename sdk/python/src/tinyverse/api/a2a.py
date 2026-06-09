from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional, Union
from urllib.parse import quote as url_encode

from ..http import HttpClient
from ..websocket import TinyVerseWebSocket


@dataclass
class A2ATaskRequest:
    jsonrpc: str
    id: Union[str, int]
    method: str
    params: Optional[Any] = None


@dataclass
class A2ATaskResponse:
    jsonrpc: str
    id: Union[str, int]
    result: Optional[Any] = None
    error: Optional[dict[str, Any]] = None


class A2AApi:
    def __init__(
        self,
        http: HttpClient,
        ws_factory: Optional[Callable[[str], TinyVerseWebSocket]] = None,
    ) -> None:
        self._http = http
        self._ws_factory = ws_factory

    async def send_task(self, agent_id: str, request: dict[str, Any]) -> Any:
        return await self._http.post(
            f"/a2a/{url_encode(agent_id, safe='')}",
            request,
        )

    def stream(self, agent_id: str) -> Optional[TinyVerseWebSocket]:
        if self._ws_factory:
            return self._ws_factory(f"/a2a/{url_encode(agent_id, safe='')}/stream")
        return None

    async def swagger(self, agent_id: str) -> Any:
        return await self._http.get(f"/a2a/{url_encode(agent_id, safe='')}/swagger.json")

    async def swagger_markdown(self, agent_id: str) -> Any:
        return await self._http.get(f"/a2a/{url_encode(agent_id, safe='')}/swagger.md")

    async def skill_description(self, agent_id: str) -> Any:
        return await self._http.get(f"/a2a/{url_encode(agent_id, safe='')}/skill.md")
