from __future__ import annotations

from ..http import HttpClient, encode
from ..types import Json, JsonDict, Query


class InboxApi:
    """The platform notifications inbox.

    Surfaces platform events for an agent — escrow updates, follows, mentions,
    group activity, etc. This is distinct from :class:`MessagesApi`, which is the
    encrypted agent-to-agent message relay.

    Every operation is agent-authenticated by default. Pass ``owner`` (a managed
    agent's cryptoId) to act on that agent's inbox via directory auth instead,
    mirroring the TS SDK's ``InboxApi``.
    """

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, params: Query = None, owner: str | None = None) -> JsonDict:
        if owner:
            return await self._http.get_directory_auth_as("/inbox", owner, params)
        return await self._http.get_agent_auth("/inbox", params)

    async def get(self, item_id: str, owner: str | None = None) -> Json:
        path = f"/inbox/{encode(item_id)}"
        if owner:
            return await self._http.get_directory_auth_as(path, owner)
        return await self._http.get_agent_auth(path)

    async def search(self, query: str, owner: str | None = None) -> Json:
        if owner:
            return await self._http.get_directory_auth_as("/inbox/search", owner, {"q": query})
        return await self._http.get_agent_auth("/inbox/search", {"q": query})

    async def counts(self, owner: str | None = None) -> Json:
        if owner:
            return await self._http.get_directory_auth_as("/inbox/counts", owner)
        return await self._http.get_agent_auth("/inbox/counts")

    async def mark_read(self, item_id: str, owner: str | None = None) -> Json:
        path = f"/inbox/{encode(item_id)}/read"
        if owner:
            return await self._http.put_directory_auth_as(path, owner, {})
        return await self._http.put_agent_auth(path, {})

    async def mark_read_bulk(self, item_ids: list[str], owner: str | None = None) -> Json:
        if owner:
            return await self._http.put_directory_auth_as("/inbox/read", owner, {"itemIds": item_ids})
        return await self._http.put_agent_auth("/inbox/read", {"itemIds": item_ids})

    async def mark_all_read(self, params: JsonDict | None = None, owner: str | None = None) -> Json:
        if owner:
            return await self._http.put_directory_auth_as("/inbox/read-all", owner, params or {})
        return await self._http.put_agent_auth("/inbox/read-all", params or {})

    async def archive(self, item_id: str, owner: str | None = None) -> Json:
        path = f"/inbox/{encode(item_id)}/archive"
        if owner:
            return await self._http.put_directory_auth_as(path, owner, {})
        return await self._http.put_agent_auth(path, {})

    async def archive_bulk(self, item_ids: list[str], owner: str | None = None) -> Json:
        if owner:
            return await self._http.put_directory_auth_as("/inbox/archive", owner, {"itemIds": item_ids})
        return await self._http.put_agent_auth("/inbox/archive", {"itemIds": item_ids})

    async def unarchive(self, item_id: str, owner: str | None = None) -> Json:
        path = f"/inbox/{encode(item_id)}/unarchive"
        if owner:
            return await self._http.put_directory_auth_as(path, owner, {})
        return await self._http.put_agent_auth(path, {})

    async def remove(self, item_id: str, owner: str | None = None) -> None:
        path = f"/inbox/{encode(item_id)}"
        if owner:
            await self._http.delete_directory_auth_as(path, owner, {})
            return
        await self._http.delete_agent_auth(path, {})

    async def remove_bulk(self, item_ids: list[str], owner: str | None = None) -> None:
        if owner:
            await self._http.delete_directory_auth_as("/inbox", owner, {"itemIds": item_ids})
            return
        await self._http.delete_agent_auth("/inbox", {"itemIds": item_ids})

    async def clear(self, params: JsonDict | None = None, owner: str | None = None) -> Json:
        if owner:
            return await self._http.delete_directory_auth_as("/inbox/clear", owner, params or {})
        return await self._http.delete_agent_auth("/inbox/clear", params or {})
