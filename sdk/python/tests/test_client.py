from __future__ import annotations

import json
from typing import Any

from tinyplace import LocalSigner, TinyPlaceClient, TinyPlaceError
from tinyplace.http import HttpClient

from .helpers import FakeResponse, FakeSession


async def test_directory_get_agent_builds_expected_request() -> None:
    session = FakeSession([FakeResponse(200, {"agentId": "agent one"})])
    client = TinyPlaceClient(base_url="https://api.example.test/", session=session)  # type: ignore[arg-type]

    result = await client.directory.get_agent("agent one")

    assert result == {"agentId": "agent one"}
    assert session.requests[0]["method"] == "GET"
    assert session.requests[0]["url"] == "https://api.example.test/directory/agents/agent%20one"


async def test_messages_send_uses_directory_actor_and_body() -> None:
    signer = LocalSigner.from_seed(bytes(range(32)))
    session = FakeSession([FakeResponse(200, {"id": "m1"})])
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    await client.messages.send({"id": "m1", "from": "agent-a", "to": "agent-b"})

    request = session.requests[0]
    body = json.loads(request["data"])
    assert request["method"] == "PUT"
    assert request["url"] == "https://api.example.test/messages"
    assert request["headers"]["X-Agent-ID"] == "agent-a"
    assert "timestamp" in body


async def test_error_includes_payment_challenge_from_body() -> None:
    session = FakeSession(
        [
            FakeResponse(
                402,
                {"error": "payment required", "payment": {"scheme": "exact", "amount": "1"}},
            )
        ]
    )
    client = TinyPlaceClient(base_url="https://api.example.test", session=session)  # type: ignore[arg-type]

    try:
        await client.healthz()
    except TinyPlaceError as error:
        assert error.status == 402
        assert error.payment_required is not None
        assert error.payment_required.payment["amount"] == "1"
    else:
        raise AssertionError("expected TinyPlaceError")


async def test_text_response_and_query_array_encoding() -> None:
    session = FakeSession([FakeResponse(200, "hello")])
    client = TinyPlaceClient(base_url="https://api.example.test", session=session)  # type: ignore[arg-type]

    result = await client.http.get_text("/docs", {"tag": ["a", "b"], "skip": None})

    assert result == "hello"
    assert session.requests[0]["url"] == "https://api.example.test/docs?tag=a&tag=b"


async def test_admin_auth_and_invalid_auth_hook() -> None:
    admin = LocalSigner.from_seed(bytes(range(32)))
    calls: list[tuple[int, Any]] = []
    session = FakeSession([FakeResponse(403, {"error": "nope"})])
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        admin_signer=admin,
        session=session,  # type: ignore[arg-type]
        on_auth_invalid=lambda status, body: calls.append((status, body)),
    )

    try:
        await client.http.post_admin("/admin/fees", {"id": "fee"})
    except TinyPlaceError:
        pass

    assert calls == [(403, {"error": "nope"})]
    headers = session.requests[0]["headers"]
    assert headers["Authorization"].startswith('TinyPlace-Admin actor="')
    assert headers["X-TinyPlace-Date"]
    assert headers["X-TinyPlace-Nonce"]


async def test_payment_challenge_from_header_and_no_content() -> None:
    header = json.dumps({"error": "pay", "payment": {"amount": "1"}})
    session = FakeSession([FakeResponse(402, "", {"X-Payment-Required": header})])
    client = TinyPlaceClient(base_url="https://api.example.test", session=session)  # type: ignore[arg-type]

    try:
        await client.healthz()
    except TinyPlaceError as error:
        assert error.payment_required is not None
        assert error.payment_required.error == "pay"
    else:
        raise AssertionError("expected TinyPlaceError")

    no_content = FakeSession([FakeResponse(204, "")])
    http = HttpClient(base_url="https://api.example.test", session=no_content)  # type: ignore[arg-type]
    assert await http.delete_public("/resource") is None
