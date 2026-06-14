from __future__ import annotations

import json
from typing import Any


class FakeResponse:
    def __init__(self, status: int, body: Any, headers: dict[str, str] | None = None) -> None:
        self.status = status
        self._body = body
        self.headers = headers or {}

    async def text(self) -> str:
        return self._body if isinstance(self._body, str) else json.dumps(self._body)

    async def json(self) -> Any:
        return self._body

    async def __aenter__(self) -> "FakeResponse":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None


class FakeSession:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self.responses = responses
        self.requests: list[dict[str, Any]] = []
        self.closed = False

    async def request(self, method: str, url: str, **kwargs: Any) -> FakeResponse:
        self.requests.append({"method": method, "url": url, **kwargs})
        return self.responses.pop(0)

    def post(self, url: str, **kwargs: Any) -> FakeResponse:
        self.requests.append({"method": "POST", "url": url, **kwargs})
        return self.responses.pop(0)

    async def close(self) -> None:
        self.closed = True
