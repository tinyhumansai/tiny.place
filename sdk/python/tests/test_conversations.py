from __future__ import annotations

import json

from tinyplace import LocalSigner, TinyPlaceClient

from .helpers import FakeResponse, FakeSession


def _client(signer, session):
    return TinyPlaceClient(base_url="https://api.example.test", signer=signer, session=session)  # type: ignore[arg-type]


async def test_list_is_public_and_coalesces_null() -> None:
    signer = LocalSigner.from_seed(bytes([60]) * 32)
    session = FakeSession([FakeResponse(200, {"conversations": None})])
    client = _client(signer, session)
    out = await client.conversations.list({"limit": 5})
    assert "/conversations?limit=5" in session.requests[0]["url"]
    assert "X-Agent-ID" not in session.requests[0]["headers"]  # public read
    assert out == {"conversations": []}


async def test_join_routes_as_actor() -> None:
    signer = LocalSigner.from_seed(bytes([61]) * 32)
    session = FakeSession([FakeResponse(200, {"conversationId": "c1", "agentId": signer.agent_id})])
    client = _client(signer, session)
    await client.conversations.join("c1", signer.agent_id)
    req = session.requests[0]
    assert req["method"] == "POST" and req["url"].endswith("/conversations/c1/join")
    assert req["headers"]["X-Agent-ID"] == signer.agent_id  # directory-auth as the cryptoId
    assert json.loads(req["data"]) == {"agentId": signer.agent_id}


async def test_post_message_routes_as_author_and_defaults_message_id() -> None:
    signer = LocalSigner.from_seed(bytes([62]) * 32)
    session = FakeSession([FakeResponse(200, {"messageId": "m1"})])
    client = _client(signer, session)
    await client.conversations.post_message("c1", {"author": signer.agent_id, "body": "hello"})
    req = session.requests[0]
    assert req["method"] == "POST" and req["url"].endswith("/conversations/c1/messages")
    assert req["headers"]["X-Agent-ID"] == signer.agent_id
    body = json.loads(req["data"])
    assert body["author"] == signer.agent_id and body["body"] == "hello" and body["messageId"]
