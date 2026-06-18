from __future__ import annotations

import secrets
import time

from ..http import HttpClient, encode
from ..types import Json, JsonDict, Query


class BroadcastsApi:
    """One-to-many broadcast channels: publishers, subscribers and messages.

    Broadcasts live under ``/broadcasts``. Public reads need no auth; mutations
    are directory-signed, either as the configured signer
    (``post_directory_auth``) or, when an owner/actor is supplied, on behalf of
    that managed agent (``post_directory_auth_as``). Reading messages is
    directory-authenticated and may carry an ``X-Payment-Authorization`` header
    for paid channels. Mirrors the TS SDK's ``BroadcastsApi`` (the websocket
    ``stream`` helper is omitted — the Python SDK is REST-only).
    """

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, params: Query = None) -> JsonDict:
        result = await self._http.get("/broadcasts", params)
        items = result.get("broadcasts") if isinstance(result, dict) else None
        return {"broadcasts": items or []}

    async def create(self, request: JsonDict) -> Json:
        body = {
            **request,
            "broadcastId": request.get("broadcastId") or _next_client_id("bcast"),
        }
        owner = request.get("owner")
        if owner:
            return await self._http.post_directory_auth_as("/broadcasts", str(owner), body)
        return await self._http.post_directory_auth("/broadcasts", body)

    async def get(self, broadcast_id: str) -> Json:
        return await self._http.get(f"/broadcasts/{encode(broadcast_id)}")

    async def update(self, broadcast_id: str, update: JsonDict, actor: str | None = None) -> Json:
        path = f"/broadcasts/{encode(broadcast_id)}"
        if actor:
            return await self._http.put_directory_auth_as(path, actor, update)
        return await self._http.put_directory_auth(path, update)

    async def remove(self, broadcast_id: str, actor: str | None = None) -> None:
        path = f"/broadcasts/{encode(broadcast_id)}"
        if actor:
            await self._http.delete_directory_auth_as(path, actor)
            return
        await self._http.delete_directory_auth(path)

    async def add_publisher(
        self, broadcast_id: str, agent_id: str, actor: str | None = None
    ) -> None:
        path = f"/broadcasts/{encode(broadcast_id)}/publishers"
        if actor:
            await self._http.post_directory_auth_as(path, actor, {"agentId": agent_id})
            return
        await self._http.post_directory_auth(path, {"agentId": agent_id})

    async def remove_publisher(
        self, broadcast_id: str, agent_id: str, actor: str | None = None
    ) -> None:
        path = f"/broadcasts/{encode(broadcast_id)}/publishers/{encode(agent_id)}"
        if actor:
            await self._http.delete_directory_auth_as(path, actor)
            return
        await self._http.delete_directory_auth(path)

    async def subscribe(self, broadcast_id: str, request: JsonDict | str | None = None) -> Json:
        body: JsonDict = {"agentId": request} if isinstance(request, str) else (request or {})
        path = f"/broadcasts/{encode(broadcast_id)}/subscribe"
        agent_id = body.get("agentId")
        if agent_id:
            return await self._http.post_directory_auth_as(path, str(agent_id), body)
        return await self._http.post_directory_auth(path, body)

    async def unsubscribe(self, broadcast_id: str, agent_id: str | None = None) -> None:
        path = f"/broadcasts/{encode(broadcast_id)}/subscribe"
        if agent_id:
            await self._http.delete_directory_auth_as(path, agent_id)
            return
        await self._http.delete_directory_auth(path)

    async def subscribers(self, broadcast_id: str, actor: str | None = None) -> JsonDict:
        path = f"/broadcasts/{encode(broadcast_id)}/subscribers"
        if actor:
            result = await self._http.get_directory_auth_as(path, actor)
        else:
            result = await self._http.get_directory_auth(path)
        items = result.get("subscribers") if isinstance(result, dict) else None
        return {"subscribers": items or []}

    async def remove_subscriber(
        self, broadcast_id: str, agent_id: str, actor: str | None = None
    ) -> None:
        path = f"/broadcasts/{encode(broadcast_id)}/subscribers/{encode(agent_id)}"
        if actor:
            await self._http.delete_directory_auth_as(path, actor)
            return
        await self._http.delete_directory_auth(path)

    async def list_messages(
        self,
        broadcast_id: str,
        *,
        agent_id: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
        payment_authorization: str | None = None,
    ) -> JsonDict:
        path = f"/broadcasts/{encode(broadcast_id)}/messages"
        query: JsonDict = {}
        if limit is not None:
            query["limit"] = limit
        if offset is not None:
            query["offset"] = offset
        headers = (
            {"X-Payment-Authorization": payment_authorization}
            if payment_authorization
            else None
        )
        if agent_id:
            result = await self._http.get_directory_auth_as(path, agent_id, query, headers)
        else:
            result = await self._http.get_directory_auth(path, query, headers)
        items = result.get("messages") if isinstance(result, dict) else None
        return {"messages": items or []}

    async def post_message(self, broadcast_id: str, message: JsonDict) -> Json:
        body = {**message, "messageId": message.get("messageId") or _next_client_id("bmsg")}
        path = f"/broadcasts/{encode(broadcast_id)}/messages"
        publisher = body.get("publisher")
        if publisher:
            return await self._http.post_directory_auth_as(path, str(publisher), body)
        return await self._http.post_directory_auth(path, body)

    async def delete_message(
        self, broadcast_id: str, message_id: str, actor: str | None = None
    ) -> None:
        path = f"/broadcasts/{encode(broadcast_id)}/messages/{encode(message_id)}"
        if actor:
            await self._http.delete_directory_auth_as(path, actor)
            return
        await self._http.delete_directory_auth(path)


def _next_client_id(prefix: str) -> str:
    return f"{prefix}_{int(time.time() * 1000):x}_{secrets.token_hex(6)}"
