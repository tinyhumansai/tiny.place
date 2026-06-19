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


# -- Conversations ----------------------------------------------------------


async def test_conversations_list_unwraps_null() -> None:
    signer = LocalSigner.from_seed(bytes([1]) * 32)
    session = FakeSession([FakeResponse(200, {"conversations": None})])
    out = await _client(signer, session).conversations.list({"limit": 5})
    assert out == {"conversations": []}
    assert session.requests[0]["url"].endswith("/conversations?limit=5")


async def test_conversations_create_defaults_id_and_signs_as_creator() -> None:
    signer = LocalSigner.from_seed(bytes([2]) * 32)
    session = FakeSession([FakeResponse(200, {"conversationId": "c1"})])
    await _client(signer, session).conversations.create(
        {"title": "Hi", "creator": signer.agent_id}
    )
    req = session.requests[0]
    assert req["method"] == "POST" and req["url"].endswith("/conversations")
    body = json.loads(req["data"])
    assert body["conversationId"].startswith("conv_")
    assert req["headers"]["X-Agent-ID"] == signer.agent_id


async def test_conversations_join_and_leave_route_agent_auth() -> None:
    signer = LocalSigner.from_seed(bytes([3]) * 32)
    session = FakeSession([FakeResponse(200, {"joined": True}), FakeResponse(204, None)])
    client = _client(signer, session)

    await client.conversations.join("c1", "AgentA")
    await client.conversations.leave("c1", "AgentA")

    assert session.requests[0]["url"].endswith("/conversations/c1/join")
    assert json.loads(session.requests[0]["data"]) == {"agentId": "AgentA"}
    assert session.requests[0]["headers"]["X-Agent-ID"] == "AgentA"
    assert session.requests[1]["method"] == "DELETE"
    assert session.requests[1]["url"].endswith("/conversations/c1/leave?agentId=AgentA")
    assert session.requests[1]["headers"]["X-Agent-ID"] == "AgentA"


async def test_conversations_remove_member_self_signs_as_agent() -> None:
    signer = LocalSigner.from_seed(bytes([4]) * 32)
    session = FakeSession([FakeResponse(204, None)])
    # No manager: self-removal still carries directory auth signed as the agent.
    await _client(signer, session).conversations.remove_member("c1", "AgentA")
    req = session.requests[0]
    assert req["method"] == "DELETE"
    assert req["url"].endswith("/conversations/c1/members/AgentA")
    assert req["headers"]["X-Agent-ID"] == "AgentA"


async def test_conversations_post_message_defaults_id_and_signs_as_author() -> None:
    signer = LocalSigner.from_seed(bytes([5]) * 32)
    session = FakeSession([FakeResponse(200, {"messageId": "m1"})])
    await _client(signer, session).conversations.post_message(
        "c1", {"author": "AgentA", "body": "hello"}
    )
    req = session.requests[0]
    assert req["url"].endswith("/conversations/c1/messages")
    body = json.loads(req["data"])
    assert body["messageId"].startswith("msg_") and body["body"] == "hello"
    assert req["headers"]["X-Agent-ID"] == "AgentA"


async def test_conversations_moderators_and_publishers() -> None:
    signer = LocalSigner.from_seed(bytes([6]) * 32)
    session = FakeSession([FakeResponse(200, {"ok": True}), FakeResponse(204, None)])
    client = _client(signer, session)

    await client.conversations.add_moderator("c1", "AgentA", owner_id="Owner")
    await client.conversations.remove_publisher("c1", "AgentA", owner_id="Owner")

    assert session.requests[0]["url"].endswith("/conversations/c1/moderators")
    assert json.loads(session.requests[0]["data"]) == {"agentId": "AgentA"}
    assert session.requests[1]["method"] == "DELETE"
    assert session.requests[1]["url"].endswith("/conversations/c1/publishers/AgentA")
    assert session.requests[1]["headers"]["X-Agent-ID"] == "Owner"


# -- Broadcasts -------------------------------------------------------------


async def test_broadcasts_list_and_create() -> None:
    signer = LocalSigner.from_seed(bytes([7]) * 32)
    session = FakeSession(
        [FakeResponse(200, {"broadcasts": None}), FakeResponse(200, {"broadcastId": "b1"})]
    )
    client = _client(signer, session)

    assert await client.broadcasts.list() == {"broadcasts": []}
    await client.broadcasts.create({"name": "News", "owner": "Owner"})

    req = session.requests[1]
    assert req["url"].endswith("/broadcasts")
    assert json.loads(req["data"])["broadcastId"].startswith("bcast_")
    assert req["headers"]["X-Agent-ID"] == "Owner"


async def test_broadcasts_subscribe_string_shortcut() -> None:
    signer = LocalSigner.from_seed(bytes([8]) * 32)
    session = FakeSession([FakeResponse(200, {"subscribed": True})])
    await _client(signer, session).broadcasts.subscribe("b1", "AgentA")
    req = session.requests[0]
    assert req["url"].endswith("/broadcasts/b1/subscribe")
    assert json.loads(req["data"]) == {"agentId": "AgentA"}
    assert req["headers"]["X-Agent-ID"] == "AgentA"


async def test_broadcasts_list_messages_with_payment_header() -> None:
    signer = LocalSigner.from_seed(bytes([9]) * 32)
    session = FakeSession([FakeResponse(200, {"messages": None})])
    out = await _client(signer, session).broadcasts.list_messages(
        "b1", agent_id="AgentA", limit=10, payment_authorization="pay-token"
    )
    assert out == {"messages": []}
    req = session.requests[0]
    assert req["url"].endswith("/broadcasts/b1/messages?limit=10")
    assert req["headers"]["X-Payment-Authorization"] == "pay-token"
    assert req["headers"]["X-Agent-ID"] == "AgentA"


async def test_broadcasts_post_message_signs_as_publisher() -> None:
    signer = LocalSigner.from_seed(bytes([10]) * 32)
    session = FakeSession([FakeResponse(200, {"messageId": "m1"})])
    await _client(signer, session).broadcasts.post_message(
        "b1", {"publisher": "Pub", "body": "ping"}
    )
    req = session.requests[0]
    assert req["url"].endswith("/broadcasts/b1/messages")
    assert json.loads(req["data"])["messageId"].startswith("bmsg_")
    assert req["headers"]["X-Agent-ID"] == "Pub"


# -- Remaining-surface smoke coverage ---------------------------------------


async def test_conversations_full_surface_smoke() -> None:
    signer = LocalSigner.from_seed(bytes([30]) * 32)
    session = FakeSession([FakeResponse(200, {"ok": True}) for _ in range(11)])
    c = _client(signer, session).conversations

    await c.get("c1")
    await c.update("c1", {"title": "x"}, actor="Mgr")
    await c.remove("c1", actor="Mgr")
    assert await c.members("c1") == {"members": []}
    await c.add_member("c1", "A", manager_id="Mgr")
    await c.approve_member("c1", "A", manager_id="Mgr")
    await c.reject_member("c1", "A", manager_id="Mgr")
    assert await c.list_messages("c1", {"limit": 2}) == {"messages": []}
    await c.delete_message("c1", "m1", actor="Mgr")
    await c.remove_moderator("c1", "A", owner_id="Owner")
    await c.add_publisher("c1", "A")

    methods = [r["method"] for r in session.requests]
    assert methods.count("DELETE") == 3  # remove, delete_message, remove_moderator


async def test_broadcasts_full_surface_smoke() -> None:
    signer = LocalSigner.from_seed(bytes([31]) * 32)
    session = FakeSession([FakeResponse(200, {"ok": True}) for _ in range(8)])
    b = _client(signer, session).broadcasts

    await b.get("b1")
    await b.update("b1", {"name": "x"}, actor="Owner")
    await b.remove("b1", actor="Owner")
    await b.add_publisher("b1", "A", actor="Owner")
    await b.remove_publisher("b1", "A")
    await b.unsubscribe("b1", "A")
    assert await b.subscribers("b1", actor="Owner") == {"subscribers": []}
    await b.remove_subscriber("b1", "A", actor="Owner")

    assert [r["method"] for r in session.requests].count("DELETE") == 4
