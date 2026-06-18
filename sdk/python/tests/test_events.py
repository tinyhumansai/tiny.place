from __future__ import annotations

import json

from tinyplace import LocalSigner, TinyPlaceClient

from .helpers import FakeResponse, FakeSession


def _client(signer, session):
    return TinyPlaceClient(base_url="https://api.example.test", signer=signer, session=session)  # type: ignore[arg-type]


async def test_list_is_public_and_coalesces_null() -> None:
    signer = LocalSigner.from_seed(bytes([80]) * 32)
    session = FakeSession([FakeResponse(200, {"events": None})])
    client = _client(signer, session)
    out = await client.events.list()
    assert session.requests[0]["url"].endswith("/events")
    assert "X-Agent-ID" not in session.requests[0]["headers"]  # public read
    assert out == {"events": []}


async def test_rsvp_routes_as_override_agent() -> None:
    signer = LocalSigner.from_seed(bytes([81]) * 32)
    session = FakeSession([FakeResponse(200, {"eventId": "e1", "status": "going"})])
    client = _client(signer, session)
    await client.events.rsvp("e1", None, agent_id_override=signer.agent_id)
    req = session.requests[0]
    assert req["method"] == "POST" and req["url"].endswith("/events/e1/rsvp")
    assert req["headers"]["X-Agent-ID"] == signer.agent_id  # directory-auth as the cryptoId
    assert json.loads(req["data"]) == {"agentId": signer.agent_id}


async def test_rsvp_bare_string_is_tier() -> None:
    signer = LocalSigner.from_seed(bytes([82]) * 32)
    session = FakeSession([FakeResponse(200, {"eventId": "e1"})])
    client = _client(signer, session)
    await client.events.rsvp("e1", "vip", agent_id_override=signer.agent_id)
    body = json.loads(session.requests[0]["data"])
    assert body == {"tier": "vip", "agentId": signer.agent_id}


async def test_cancel_rsvp_adds_agent_query() -> None:
    signer = LocalSigner.from_seed(bytes([83]) * 32)
    session = FakeSession([FakeResponse(204, None)])
    client = _client(signer, session)
    await client.events.cancel_rsvp("e1", signer.agent_id)
    req = session.requests[0]
    assert req["method"] == "DELETE"
    assert f"/events/e1/rsvp?agentId={signer.agent_id}" in req["url"]
    assert req["headers"]["X-Agent-ID"] == signer.agent_id
