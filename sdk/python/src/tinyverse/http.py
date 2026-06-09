from __future__ import annotations

import json
import re
from typing import Any, Optional
from urllib.parse import urlencode

import aiohttp

from .auth import SigningKey, sign_request


class TinyVerseError(Exception):
    def __init__(self, status: int, body: Any, message: Optional[str] = None) -> None:
        super().__init__(message or f"HTTP {status}")
        self.status = status
        self.body = body


def build_query(params: dict[str, Any]) -> str:
    parts: list[str] = []
    for key, value in params.items():
        if value is None:
            continue
        if isinstance(value, list):
            for item in value:
                parts.append(f"{urlencode({key: str(item)})}")
            continue
        if isinstance(value, bool):
            parts.append(f"{urlencode({key: str(value).lower()})}")
            continue
        parts.append(f"{urlencode({key: str(value)})}")
    return f"?{'&'.join(parts)}" if parts else ""


class HttpClient:
    def __init__(
        self,
        base_url: str,
        signing_key: Optional[SigningKey] = None,
        session: Optional[aiohttp.ClientSession] = None,
    ) -> None:
        self._base_url = re.sub(r"/+$", "", base_url)
        self._signing_key = signing_key
        self._session = session
        self._owns_session = session is None

    async def _ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
            self._owns_session = True
        return self._session

    async def close(self) -> None:
        if self._owns_session and self._session and not self._session.closed:
            await self._session.close()

    async def _request(
        self,
        method: str,
        path: str,
        body: Any = None,
        query: Optional[dict[str, Any]] = None,
        signed: bool = False,
    ) -> Any:
        url = f"{self._base_url}{path}{build_query(query) if query else ''}"
        headers: dict[str, str] = {"Content-Type": "application/json"}

        body_str = json.dumps(body) if body is not None else ""

        if signed and self._signing_key:
            auth_headers = await sign_request(self._signing_key, body_str)
            headers.update(auth_headers)

        session = await self._ensure_session()
        async with session.request(
            method,
            url,
            headers=headers,
            data=body_str or None,
        ) as response:
            if response.status >= 400:
                error_body = await response.text()
                try:
                    parsed = json.loads(error_body)
                except (json.JSONDecodeError, ValueError):
                    parsed = error_body
                raise TinyVerseError(response.status, parsed, f"HTTP {response.status}: {path}")

            if response.status == 204:
                return None

            return await response.json()

    async def get(self, path: str, query: Optional[dict[str, Any]] = None) -> Any:
        return await self._request("GET", path, query=query)

    async def get_auth(self, path: str, query: Optional[dict[str, Any]] = None) -> Any:
        return await self._request("GET", path, query=query, signed=True)

    async def post(self, path: str, body: Any = None) -> Any:
        return await self._request("POST", path, body=body, signed=True)

    async def put(self, path: str, body: Any = None) -> Any:
        return await self._request("PUT", path, body=body, signed=True)

    async def delete(self, path: str, body: Any = None) -> Any:
        return await self._request("DELETE", path, body=body, signed=True)

    async def post_public(self, path: str, body: Any = None) -> Any:
        return await self._request("POST", path, body=body)
