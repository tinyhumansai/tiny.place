from __future__ import annotations

import json

from tinyplace import LocalSigner, TinyPlaceClient

from .helpers import FakeResponse, FakeSession


def _client(signer: LocalSigner, session: FakeSession) -> TinyPlaceClient:
    return TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )


async def test_heartbeat_posts_as_acting_agent() -> None:
    signer = LocalSigner.from_seed(bytes([200]) * 32)
    session = FakeSession(
        [FakeResponse(200, {"cryptoId": signer.agent_id, "online": True})]
    )
    out = await _client(signer, session).presence.heartbeat()
    assert out["online"] is True

    request = session.requests[0]
    assert request["method"] == "POST"
    assert request["url"].endswith("/presence/heartbeat")
    # Authenticated as the acting agent.
    assert request["headers"]["X-Agent-ID"] == signer.agent_id


async def test_get_is_public() -> None:
    signer = LocalSigner.from_seed(bytes([201]) * 32)
    session = FakeSession([FakeResponse(200, {"cryptoId": "AgentX", "online": False})])
    out = await _client(signer, session).presence.get("AgentX")
    assert out["online"] is False

    request = session.requests[0]
    assert request["method"] == "GET"
    assert request["url"].endswith("/presence/AgentX")
    assert "X-Agent-ID" not in request["headers"]


async def test_query_posts_batch() -> None:
    signer = LocalSigner.from_seed(bytes([202]) * 32)
    session = FakeSession(
        [
            FakeResponse(
                200,
                {
                    "presence": [
                        {"cryptoId": "AgentX", "online": True},
                        {"cryptoId": "ghost", "online": False},
                    ]
                },
            )
        ]
    )
    out = await _client(signer, session).presence.query(["AgentX", "ghost"])
    assert len(out["presence"]) == 2

    request = session.requests[0]
    assert request["method"] == "POST"
    assert request["url"].endswith("/presence/query")
    assert json.loads(request["data"]) == {"cryptoIds": ["AgentX", "ghost"]}
