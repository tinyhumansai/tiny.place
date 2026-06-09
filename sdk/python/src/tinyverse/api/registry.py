from __future__ import annotations

from typing import Any
from urllib.parse import quote as url_encode

from ..http import HttpClient


class RegistryApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def register(self, identity: dict[str, Any]) -> Any:
        return await self._http.post("/registry/names", identity)

    async def get(self, name: str) -> Any:
        return await self._http.get(f"/registry/names/{url_encode(name, safe='')}")

    async def export_(self, name: str) -> Any:
        return await self._http.get(f"/registry/names/{url_encode(name, safe='')}/export")

    async def update_profile(self, name: str, update: dict[str, Any]) -> Any:
        return await self._http.put(f"/registry/names/{url_encode(name, safe='')}/profile", update)

    async def update_profile_visibility(self, name: str, update: dict[str, Any]) -> Any:
        return await self._http.put(
            f"/registry/names/{url_encode(name, safe='')}/profile-visibility",
            update,
        )

    async def renew(self, name: str, request: dict[str, Any]) -> Any:
        return await self._http.post(f"/registry/names/{url_encode(name, safe='')}/renew", request)

    async def claim(self, name: str, request: dict[str, Any]) -> Any:
        return await self._http.post(f"/registry/names/{url_encode(name, safe='')}/claim", request)

    async def create_subname(self, name: str, request: dict[str, Any]) -> Any:
        return await self._http.post(
            f"/registry/names/{url_encode(name, safe='')}/subnames",
            request,
        )

    async def delete_subname(self, name: str, subname: str) -> None:
        await self._http.delete(
            f"/registry/names/{url_encode(name, safe='')}/subnames/{url_encode(subname, safe='')}",
        )
