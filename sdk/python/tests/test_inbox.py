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


async def test_inbox_list_agent_auth_with_params() -> None:
    signer = LocalSigner.from_seed(bytes([41]) * 32)
    session = FakeSession([FakeResponse(200, {"items": [], "unreadCount": 0})])
    client = _client(signer, session)

    await client.inbox.list({"status": "unread", "limit": 10})

    req = session.requests[0]
    assert req["method"] == "GET"
    assert req["url"].startswith("https://api.example.test/inbox?")
    assert "status=unread" in req["url"] and "limit=10" in req["url"]
    # No owner -> agent auth: X-Agent-ID is the caller's own cryptoId.
    assert req["headers"]["X-Agent-ID"] == signer.agent_id


async def test_inbox_list_with_owner_uses_directory_auth() -> None:
    signer = LocalSigner.from_seed(bytes([42]) * 32)
    session = FakeSession([FakeResponse(200, {"items": []})])
    client = _client(signer, session)

    await client.inbox.list(None, owner="OwnerCryptoId")

    req = session.requests[0]
    assert req["method"] == "GET"
    assert req["url"].endswith("/inbox")
    # owner -> directory auth as that managed agent.
    assert req["headers"]["X-Agent-ID"] == "OwnerCryptoId"


async def test_inbox_counts_mark_read_remove_and_mark_all() -> None:
    signer = LocalSigner.from_seed(bytes([43]) * 32)
    session = FakeSession(
        [
            FakeResponse(200, {"unreadCount": 3}),
            FakeResponse(200, {"ok": True}),
            FakeResponse(204, None),
            FakeResponse(200, {"updated": 5}),
        ]
    )
    client = _client(signer, session)

    await client.inbox.counts()
    await client.inbox.mark_read("item-1")
    await client.inbox.remove("item-2")
    await client.inbox.mark_all_read({"type": "ESCROW_EVENT"})

    calls = [(r["method"], r["url"]) for r in session.requests]
    base = "https://api.example.test"
    assert calls[0] == ("GET", f"{base}/inbox/counts")
    assert calls[1] == ("PUT", f"{base}/inbox/item-1/read")
    assert calls[2] == ("DELETE", f"{base}/inbox/item-2")
    assert calls[3] == ("PUT", f"{base}/inbox/read-all")
    # mark_all_read forwards its filter as the request body.
    assert json.loads(session.requests[3]["data"]) == {"type": "ESCROW_EVENT"}


async def test_inbox_bulk_operations() -> None:
    signer = LocalSigner.from_seed(bytes([44]) * 32)
    session = FakeSession([FakeResponse(200, {"ok": True}), FakeResponse(204, None)])
    client = _client(signer, session)

    await client.inbox.mark_read_bulk(["a", "b"])
    await client.inbox.remove_bulk(["c", "d"])

    assert session.requests[0]["url"].endswith("/inbox/read")
    assert json.loads(session.requests[0]["data"]) == {"itemIds": ["a", "b"]}
    assert session.requests[1]["method"] == "DELETE"
    assert session.requests[1]["url"].endswith("/inbox")
    assert json.loads(session.requests[1]["data"]) == {"itemIds": ["c", "d"]}
