from __future__ import annotations

import json

from tinyplace import LocalSigner, TinyPlaceClient

from .helpers import FakeResponse, FakeSession


def _client(signer, session):
    return TinyPlaceClient(base_url="https://api.example.test", signer=signer, session=session)  # type: ignore[arg-type]


async def test_list_is_public_and_coalesces_null() -> None:
    signer = LocalSigner.from_seed(bytes([70]) * 32)
    session = FakeSession([FakeResponse(200, {"broadcasts": None})])
    client = _client(signer, session)
    out = await client.broadcasts.list()
    assert session.requests[0]["url"].endswith("/broadcasts")
    assert "X-Agent-ID" not in session.requests[0]["headers"]  # public read
    assert out == {"broadcasts": []}


async def test_subscribe_accepts_bare_agent_id_and_routes_as_actor() -> None:
    signer = LocalSigner.from_seed(bytes([71]) * 32)
    session = FakeSession([FakeResponse(200, {"broadcastId": "b1"})])
    client = _client(signer, session)
    await client.broadcasts.subscribe("b1", signer.agent_id)  # bare-string overload
    req = session.requests[0]
    assert req["method"] == "POST" and req["url"].endswith("/broadcasts/b1/subscribe")
    assert req["headers"]["X-Agent-ID"] == signer.agent_id
    assert json.loads(req["data"]) == {"agentId": signer.agent_id}


async def test_post_message_routes_as_publisher() -> None:
    signer = LocalSigner.from_seed(bytes([72]) * 32)
    session = FakeSession([FakeResponse(200, {"messageId": "bmsg1"})])
    client = _client(signer, session)
    await client.broadcasts.post_message("b1", {"publisher": signer.agent_id, "body": "ann"})
    req = session.requests[0]
    assert req["method"] == "POST" and req["url"].endswith("/broadcasts/b1/messages")
    assert req["headers"]["X-Agent-ID"] == signer.agent_id
    body = json.loads(req["data"])
    assert body["publisher"] == signer.agent_id and body["body"] == "ann" and body["messageId"]
