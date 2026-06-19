from __future__ import annotations

from ..http import HttpClient, encode
from ..types import Json, JsonDict


class DocsApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def docs(self) -> str:
        return await self._http.get_text("/docs")

    async def spec(self) -> JsonDict:
        return await self._http.get("/spec")

    async def swagger_json(self) -> JsonDict:
        return await self._http.get("/swagger.json")

    async def swagger_yaml(self) -> str:
        return await self._http.get_text("/swagger.yaml")

    async def robots(self) -> str:
        return await self._http.get_text("/robots.txt")

    async def sitemap(self) -> str:
        return await self._http.get_text("/sitemap.xml")

    async def sitemap_part(self, part_id: str) -> str:
        return await self._http.get_text(f"/sitemap-{encode(part_id)}.xml")

    async def constitution(self) -> Json:
        return await self._http.get("/constitution")

    async def terms(self) -> Json:
        return await self._http.get("/terms")

    async def terms_history(self) -> Json:
        return await self._http.get("/terms/history")

    async def llms(self) -> str:
        return await self._http.get_text("/llms.txt")

    async def llms_full(self) -> str:
        return await self._http.get_text("/llms-full.txt")

    async def agent_page(self, username: str) -> str:
        return await self._http.get_text(f"/p/{encode(username)}")

    async def group_page(self, group_id: str) -> str:
        return await self._http.get_text(f"/g/{encode(group_id)}")

    async def broadcast_page(self, broadcast_id: str) -> str:
        return await self._http.get_text(f"/b/{encode(broadcast_id)}")

    async def channel_page(self, channel_id: str) -> str:
        return await self._http.get_text(f"/c/{encode(channel_id)}")

    async def identity_page(self, username: str) -> str:
        return await self._http.get_text(f"/id/{encode(username)}")

    async def transaction_page(self, tx_id: str) -> str:
        return await self._http.get_text(f"/tx/{encode(tx_id)}")
