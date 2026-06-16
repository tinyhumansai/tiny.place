from __future__ import annotations

import json

import pytest

from tinyplace import InboxPage, LocalSigner, TinyPlaceClient

from .helpers import FakeResponse, FakeSession


def _client(session: FakeSession) -> TinyPlaceClient:
    signer = LocalSigner.from_seed(bytes([42]) * 32)
    return TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )


def _msg(message_id: str, timestamp: str) -> dict[str, str]:
    return {"id": message_id, "timestamp": timestamp, "from": "@a", "to": "@b"}


# -- poll_inbox -------------------------------------------------------------


async def test_poll_inbox_without_cursor_returns_all_sorted() -> None:
    inbox = [
        _msg("msg_2", "2026-01-01T00:00:02Z"),
        _msg("msg_1", "2026-01-01T00:00:01Z"),
    ]
    session = FakeSession([FakeResponse(200, {"messages": inbox})])
    client = _client(session)

    page = await client.messages.poll_inbox("@b")

    assert isinstance(page, InboxPage)
    assert [m["id"] for m in page.messages] == ["msg_1", "msg_2"]  # oldest-first
    assert page.cursor == "2026-01-01T00:00:02Z|msg_2"


async def test_poll_inbox_filters_already_seen_with_cursor() -> None:
    inbox = [
        _msg("msg_1", "2026-01-01T00:00:01Z"),
        _msg("msg_2", "2026-01-01T00:00:02Z"),
        _msg("msg_3", "2026-01-01T00:00:03Z"),
    ]
    session = FakeSession([FakeResponse(200, {"messages": inbox})])
    client = _client(session)

    page = await client.messages.poll_inbox("@b", cursor="2026-01-01T00:00:02Z|msg_2")

    assert [m["id"] for m in page.messages] == ["msg_3"]
    assert page.cursor == "2026-01-01T00:00:03Z|msg_3"


async def test_poll_inbox_empty_page_keeps_prior_cursor() -> None:
    session = FakeSession([FakeResponse(200, {"messages": []})])
    client = _client(session)

    cursor = "2026-01-01T00:00:02Z|msg_2"
    page = await client.messages.poll_inbox("@b", cursor=cursor)

    assert page.messages == []
    assert page.cursor == cursor


async def test_poll_inbox_tolerates_bare_timestamp_cursor() -> None:
    inbox = [
        _msg("msg_1", "2026-01-01T00:00:01Z"),
        _msg("msg_2", "2026-01-01T00:00:02Z"),
        _msg("msg_3", "2026-01-01T00:00:00Z"),
    ]
    session = FakeSession([FakeResponse(200, {"messages": inbox})])
    client = _client(session)

    # A cursor with no "|" separator (e.g. a legacy bare timestamp) still filters.
    # It is inclusive at that second — messages from before are dropped, messages
    # at-or-after are kept (re-read rather than risk losing one).
    page = await client.messages.poll_inbox("@b", cursor="2026-01-01T00:00:01Z")

    assert [m["id"] for m in page.messages] == ["msg_1", "msg_2"]


async def test_poll_inbox_disambiguates_equal_timestamps_by_id() -> None:
    inbox = [
        _msg("msg_a", "2026-01-01T00:00:01Z"),
        _msg("msg_b", "2026-01-01T00:00:01Z"),
    ]
    session = FakeSession([FakeResponse(200, {"messages": inbox})])
    client = _client(session)

    page = await client.messages.poll_inbox("@b", cursor="2026-01-01T00:00:01Z|msg_a")

    assert [m["id"] for m in page.messages] == ["msg_b"]


# -- search_domain ----------------------------------------------------------


async def test_search_domain_available_from_body_flag() -> None:
    # The backend returns 200 with an AvailabilityResponse, not a 404.
    response = {"available": True, "name": "@cooldomain"}
    session = FakeSession([FakeResponse(200, response)])
    client = _client(session)

    result = await client.search_domain("cooldomain")

    assert result == {"name": "@cooldomain", "available": True, "record": response}


async def test_search_domain_taken_returns_record() -> None:
    response = {
        "available": False,
        "name": "@taken",
        "identity": {"username": "@taken", "cryptoId": "abc"},
    }
    session = FakeSession([FakeResponse(200, response)])
    client = _client(session)

    result = await client.search_domain("@taken")

    assert result["available"] is False
    assert result["record"] == response
    assert session.requests[0]["url"].endswith("/registry/names/%40taken")


# -- register_domain --------------------------------------------------------


async def test_register_domain_fills_identity_from_signer() -> None:
    session = FakeSession([FakeResponse(200, {"ok": True})])
    client = _client(session)

    await client.register_domain("mybot", actorType="agent")

    body = json.loads(session.requests[0]["data"])
    assert body["username"] == "@mybot"
    assert body["actorType"] == "agent"
    assert body["cryptoId"] == client._signer.agent_id
    assert body["publicKey"] == client._signer.public_key_base64
    assert body["signature"]  # registration is signed


async def test_register_domain_argument_wins_over_fields() -> None:
    session = FakeSession([FakeResponse(200, {"ok": True})])
    client = _client(session)

    # A stray username in **fields must not override the explicit domain arg.
    await client.register_domain("mybot", username="@evil")

    body = json.loads(session.requests[0]["data"])
    assert body["username"] == "@mybot"


# -- get_identity / resolve_user -------------------------------------------


async def test_get_identity_reverse_resolves_signer() -> None:
    session = FakeSession([FakeResponse(200, {"identities": []})])
    client = _client(session)

    await client.get_identity()

    expected = f"/directory/reverse/{client._signer.agent_id}"
    assert session.requests[0]["url"].endswith(expected)


async def test_get_identity_without_signer_raises() -> None:
    session = FakeSession([])
    client = TinyPlaceClient(base_url="https://api.example.test", session=session)  # type: ignore[arg-type]

    with pytest.raises(ValueError):
        await client.get_identity()


async def test_resolve_user_normalizes_handle() -> None:
    session = FakeSession([FakeResponse(200, {"ok": True})])
    client = _client(session)

    await client.resolve_user("agent")

    assert session.requests[0]["url"].endswith("/directory/resolve/%40agent")
