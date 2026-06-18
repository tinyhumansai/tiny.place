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


async def test_escrow_list_and_get_use_signed_auth() -> None:
    signer = LocalSigner.from_seed(bytes([71]) * 32)
    session = FakeSession([FakeResponse(200, {"escrows": []}), FakeResponse(200, {"id": "e1"})])
    client = _client(signer, session)
    await client.escrow.list({"status": "active"})
    await client.escrow.get("e1")
    assert "/escrow?status=active" in session.requests[0]["url"]
    assert session.requests[1]["url"].endswith("/escrow/e1")
    # signed (own) auth -> an Authorization header, not directory X-Agent-ID.
    assert session.requests[1]["headers"]["Authorization"].startswith("tiny.place ")
    assert "X-Agent-ID" not in session.requests[1]["headers"]


async def test_escrow_accept_with_actor_routes_directory_auth() -> None:
    signer = LocalSigner.from_seed(bytes([72]) * 32)
    session = FakeSession([FakeResponse(200, {"id": "e1", "status": "accepted"})])
    await _client(signer, session).escrow.accept("e1", actor="ProviderId")
    req = session.requests[0]
    assert req["url"].endswith("/escrow/e1/accept")
    assert req["headers"]["X-Agent-ID"] == "ProviderId"
    assert json.loads(req["data"]) == {"actor": "ProviderId"}


async def test_escrow_deliver_and_accept_delivery() -> None:
    signer = LocalSigner.from_seed(bytes([73]) * 32)
    session = FakeSession([FakeResponse(200, {"id": "e1"}), FakeResponse(200, {"id": "e1"})])
    client = _client(signer, session)
    await client.escrow.deliver("e1", {"actor": "ProviderId", "description": "done", "refs": ["r1"]})
    await client.escrow.accept_delivery("e1", actor="ClientId", on_chain_tx="sig123")
    deliver_body = json.loads(session.requests[0]["data"])
    assert deliver_body["description"] == "done" and deliver_body["actor"] == "ProviderId"
    assert session.requests[0]["url"].endswith("/escrow/e1/deliver")
    accept_body = json.loads(session.requests[1]["data"])
    assert accept_body == {"onChainTx": "sig123", "actor": "ClientId"}
    assert session.requests[1]["url"].endswith("/escrow/e1/accept-delivery")
