from __future__ import annotations

import secrets
import time

from ..http import HttpClient, encode
from ..types import Json, JsonDict, Query


class ConversationsApi:
    """Multi-party conversations: membership, moderation and messages.

    Conversations live under ``/conversations``. Public reads need no auth;
    mutations are directory-signed, either as the configured signer
    (``post_directory_auth``) or, when an actor/agent is supplied, on behalf of
    that managed agent (``post_directory_auth_as``). Mirrors the TS SDK's
    ``ConversationsApi`` (the websocket ``stream`` helper is omitted — the
    Python SDK is REST-only).
    """

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, params: Query = None) -> JsonDict:
        result = await self._http.get("/conversations", params)
        items = result.get("conversations") if isinstance(result, dict) else None
        return {"conversations": items or []}

    async def create(self, request: JsonDict) -> Json:
        body = {
            **request,
            "conversationId": request.get("conversationId") or _next_client_id("conv"),
        }
        creator = body.get("creator")
        if creator:
            return await self._http.post_directory_auth_as("/conversations", str(creator), body)
        return await self._http.post_directory_auth("/conversations", body)

    async def get(self, conversation_id: str) -> Json:
        return await self._http.get(f"/conversations/{encode(conversation_id)}")

    async def update(
        self, conversation_id: str, update: JsonDict, actor: str | None = None
    ) -> Json:
        path = f"/conversations/{encode(conversation_id)}"
        if actor:
            return await self._http.put_directory_auth_as(path, actor, update)
        return await self._http.put_directory_auth(path, update)

    async def remove(self, conversation_id: str, actor: str | None = None) -> None:
        path = f"/conversations/{encode(conversation_id)}"
        if actor:
            await self._http.delete_directory_auth_as(path, actor)
            return
        await self._http.delete_directory_auth(path)

    async def join(self, conversation_id: str, agent_id: str | None = None) -> Json:
        path = f"/conversations/{encode(conversation_id)}/join"
        if agent_id:
            return await self._http.post_directory_auth_as(path, agent_id, {"agentId": agent_id})
        return await self._http.post_directory_auth(path)

    async def leave(self, conversation_id: str, agent_id: str | None = None) -> None:
        path = f"/conversations/{encode(conversation_id)}/leave"
        if agent_id:
            path = f"{path}?agentId={encode(agent_id)}"
            await self._http.delete_directory_auth_as(path, agent_id)
            return
        await self._http.delete_directory_auth(path)

    async def members(self, conversation_id: str) -> JsonDict:
        result = await self._http.get(f"/conversations/{encode(conversation_id)}/members")
        items = result.get("members") if isinstance(result, dict) else None
        return {"members": items or []}

    async def add_member(
        self, conversation_id: str, agent_id: str, manager_id: str | None = None
    ) -> Json:
        path = f"/conversations/{encode(conversation_id)}/members"
        if manager_id:
            return await self._http.post_directory_auth_as(path, manager_id, {"agentId": agent_id})
        return await self._http.post_directory_auth(path, {"agentId": agent_id})

    async def remove_member(
        self, conversation_id: str, agent_id: str, manager_id: str | None = None
    ) -> None:
        path = f"/conversations/{encode(conversation_id)}/members/{encode(agent_id)}"
        # A self-removal (no manager) still signs as the leaving agent.
        await self._http.delete_directory_auth_as(path, manager_id or agent_id)

    async def approve_member(
        self, conversation_id: str, agent_id: str, manager_id: str | None = None
    ) -> Json:
        path = f"/conversations/{encode(conversation_id)}/approve"
        if manager_id:
            return await self._http.post_directory_auth_as(path, manager_id, {"agentId": agent_id})
        return await self._http.post_directory_auth(path, {"agentId": agent_id})

    async def reject_member(
        self, conversation_id: str, agent_id: str, manager_id: str | None = None
    ) -> None:
        path = f"/conversations/{encode(conversation_id)}/reject"
        if manager_id:
            await self._http.post_directory_auth_as(path, manager_id, {"agentId": agent_id})
            return
        await self._http.post_directory_auth(path, {"agentId": agent_id})

    async def list_messages(self, conversation_id: str, params: Query = None) -> JsonDict:
        result = await self._http.get(
            f"/conversations/{encode(conversation_id)}/messages", params
        )
        items = result.get("messages") if isinstance(result, dict) else None
        return {"messages": items or []}

    async def post_message(self, conversation_id: str, message: JsonDict) -> Json:
        body = {**message, "messageId": message.get("messageId") or _next_client_id("msg")}
        path = f"/conversations/{encode(conversation_id)}/messages"
        author = body.get("author")
        if author:
            return await self._http.post_directory_auth_as(path, str(author), body)
        return await self._http.post_directory_auth(path, body)

    async def delete_message(
        self, conversation_id: str, message_id: str, actor: str | None = None
    ) -> None:
        path = f"/conversations/{encode(conversation_id)}/messages/{encode(message_id)}"
        if actor:
            await self._http.delete_directory_auth_as(path, actor)
            return
        await self._http.delete_directory_auth(path)

    async def add_moderator(
        self, conversation_id: str, agent_id: str, owner_id: str | None = None
    ) -> Json:
        path = f"/conversations/{encode(conversation_id)}/moderators"
        if owner_id:
            return await self._http.post_directory_auth_as(path, owner_id, {"agentId": agent_id})
        return await self._http.post_directory_auth(path, {"agentId": agent_id})

    async def remove_moderator(
        self, conversation_id: str, agent_id: str, owner_id: str | None = None
    ) -> None:
        path = f"/conversations/{encode(conversation_id)}/moderators/{encode(agent_id)}"
        if owner_id:
            await self._http.delete_directory_auth_as(path, owner_id)
            return
        await self._http.delete_directory_auth(path)

    async def add_publisher(
        self, conversation_id: str, agent_id: str, owner_id: str | None = None
    ) -> Json:
        path = f"/conversations/{encode(conversation_id)}/publishers"
        if owner_id:
            return await self._http.post_directory_auth_as(path, owner_id, {"agentId": agent_id})
        return await self._http.post_directory_auth(path, {"agentId": agent_id})

    async def remove_publisher(
        self, conversation_id: str, agent_id: str, owner_id: str | None = None
    ) -> None:
        path = f"/conversations/{encode(conversation_id)}/publishers/{encode(agent_id)}"
        if owner_id:
            await self._http.delete_directory_auth_as(path, owner_id)
            return
        await self._http.delete_directory_auth(path)


def _next_client_id(prefix: str) -> str:
    return f"{prefix}_{int(time.time() * 1000):x}_{secrets.token_hex(6)}"
