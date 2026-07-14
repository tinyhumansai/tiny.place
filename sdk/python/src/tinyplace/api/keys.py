from __future__ import annotations

import re

from ..http import HttpClient, encode
from ..types import Json, JsonDict


class KeysApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def get_bundle(self, agent_id: str) -> Json:
        return await self._http.get(_key_path(agent_id, "bundle"))

    async def health(self, agent_id: str) -> Json:
        return await self._http.get_directory_auth_as(
            _key_path(agent_id, "health"),
            agent_id,
        )

    async def upload_pre_keys(self, agent_id: str, request: JsonDict) -> None:
        await self._http.put_directory_auth_as(
            _key_path(agent_id, "prekeys"),
            agent_id,
            request,
        )

    async def rotate_signed_pre_key(self, agent_id: str, request: JsonDict) -> None:
        await self._http.put_directory_auth_as(
            _key_path(agent_id, "signed-prekey"),
            agent_id,
            request,
        )


def _key_path(agent_id: str, suffix: str) -> str:
    return f"/keys/{_key_route_id(agent_id)}/{suffix}"


def _key_route_id(agent_id: str) -> str:
    if _looks_like_base64_public_key(agent_id):
        return f"by-public-key/{_base64_to_base64url(agent_id)}"
    return encode(agent_id)


def _looks_like_base64_public_key(value: str) -> bool:
    if len(value) < 40 or not any(marker in value for marker in "+/="):
        return False
    return bool(re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", value))


def _base64_to_base64url(value: str) -> str:
    return value.replace("+", "-").replace("/", "_").rstrip("=")
