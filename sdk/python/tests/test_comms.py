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


# -- Events -----------------------------------------------------------------


async def test_events_list_and_create_default_id() -> None:
    signer = LocalSigner.from_seed(bytes([11]) * 32)
    session = FakeSession(
        [FakeResponse(200, {"events": [{"eventId": "e0"}]}), FakeResponse(200, {"eventId": "e1"})]
    )
    client = _client(signer, session)

    assert (await client.events.list())["events"] == [{"eventId": "e0"}]
    await client.events.create({"title": "Launch", "host": "Host"})

    req = session.requests[1]
    assert req["url"].endswith("/events")
    assert json.loads(req["data"])["eventId"].startswith("evt_")
    assert req["headers"]["X-Agent-ID"] == "Host"


async def test_events_rsvp_string_tier_and_override() -> None:
    signer = LocalSigner.from_seed(bytes([12]) * 32)
    session = FakeSession([FakeResponse(200, {"rsvp": True})])
    await _client(signer, session).events.rsvp("e1", "vip", agent_id_override="AgentA")
    req = session.requests[0]
    assert req["url"].endswith("/events/e1/rsvp")
    assert json.loads(req["data"]) == {"tier": "vip", "agentId": "AgentA"}
    assert req["headers"]["X-Agent-ID"] == "AgentA"


async def test_events_cancel_rsvp_query_and_actor() -> None:
    signer = LocalSigner.from_seed(bytes([13]) * 32)
    session = FakeSession([FakeResponse(204, None)])
    await _client(signer, session).events.cancel_rsvp("e1", "AgentA")
    req = session.requests[0]
    assert req["method"] == "DELETE"
    assert req["url"].endswith("/events/e1/rsvp?agentId=AgentA")
    assert req["headers"]["X-Agent-ID"] == "AgentA"


async def test_events_attendees_directory_auth() -> None:
    signer = LocalSigner.from_seed(bytes([14]) * 32)
    session = FakeSession([FakeResponse(200, {"attendees": None})])
    out = await _client(signer, session).events.attendees("e1", actor="Host")
    assert out == {"attendees": []}
    assert session.requests[0]["headers"]["X-Agent-ID"] == "Host"


async def test_events_post_to_stage_infers_actor_from_sender() -> None:
    signer = LocalSigner.from_seed(bytes([15]) * 32)
    session = FakeSession([FakeResponse(200, {"messageId": "s1"})])
    await _client(signer, session).events.post_to_stage(
        "e1", {"sender": "Speaker", "message": "hi"}
    )
    req = session.requests[0]
    assert req["url"].endswith("/events/e1/stage")
    assert req["headers"]["X-Agent-ID"] == "Speaker"


async def test_events_questions_and_poll_vote() -> None:
    signer = LocalSigner.from_seed(bytes([16]) * 32)
    session = FakeSession(
        [
            FakeResponse(200, {"questionId": "q1"}),
            FakeResponse(200, {"pollId": "p1"}),
        ]
    )
    client = _client(signer, session)

    await client.events.post_question("e1", {"asker": "AgentA", "text": "why?"})
    await client.events.vote_poll("e1", "p1", "yes", voter_id="AgentA")

    assert session.requests[0]["url"].endswith("/events/e1/questions")
    assert session.requests[0]["headers"]["X-Agent-ID"] == "AgentA"
    assert session.requests[1]["url"].endswith("/events/e1/polls/p1/vote")
    assert json.loads(session.requests[1]["data"]) == {"option": "yes"}


async def test_events_series_lifecycle() -> None:
    signer = LocalSigner.from_seed(bytes([17]) * 32)
    session = FakeSession(
        [FakeResponse(200, {"series": None}), FakeResponse(204, None), FakeResponse(204, None)]
    )
    client = _client(signer, session)

    assert await client.events.list_series() == {"series": []}
    await client.events.follow_series("s1", "AgentA")
    await client.events.unfollow_series("s1", "AgentA")

    assert session.requests[1]["url"].endswith("/events/series/s1/follow")
    assert session.requests[1]["headers"]["X-Agent-ID"] == "AgentA"
    assert session.requests[2]["method"] == "DELETE"


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


async def test_events_full_surface_smoke() -> None:
    signer = LocalSigner.from_seed(bytes([32]) * 32)
    session = FakeSession([FakeResponse(200, {"ok": True}) for _ in range(24)])
    e = _client(signer, session).events

    await e.get("e1")
    await e.update("e1", {"title": "x"}, host_id="Host")
    await e.remove("e1", host_id="Host")
    await e.start("e1", host_id="Host")
    await e.end("e1", host_id="Host")
    await e.invite("e1", "A", host_id="Host")
    await e.remove_attendee("e1", "A", moderator_id="Mod")
    assert await e.get_stage("e1") == {"messages": []}
    await e.pause_stage("e1", moderator_id="Mod")
    await e.resume_stage("e1", moderator_id="Mod")
    await e.pin_stage_message("e1", "s1", {"x": 1}, moderator_id="Mod")
    await e.unpin_stage_message("e1", "s1", moderator_id="Mod")
    await e.add_speaker("e1", "A", moderator_id="Mod")
    await e.remove_speaker("e1", "A", moderator_id="Mod")
    await e.mute_speaker("e1", "A", moderator_id="Mod")
    await e.unmute_speaker("e1", "A", moderator_id="Mod")
    await e.activate_agenda_item("e1", "a1", moderator_id="Mod")
    assert await e.questions("e1") == {"questions": []}
    await e.upvote_question("e1", "q1", voter_id="A")
    await e.promote_question("e1", "q1", moderator_id="Mod")
    await e.dismiss_question("e1", "q1", moderator_id="Mod")
    await e.mark_question_answered("e1", "q1", moderator_id="Mod")
    assert await e.polls("e1") == {"polls": []}
    await e.create_poll("e1", {"question": "?"}, actor="Host")

    assert len(session.requests) == 24


async def test_events_poll_recording_series_no_actor_paths() -> None:
    signer = LocalSigner.from_seed(bytes([33]) * 32)
    session = FakeSession([FakeResponse(200, {"ok": True}) for _ in range(6)])
    e = _client(signer, session).events

    # No-actor branches sign as the configured signer.
    await e.close_poll("e1", "p1")
    await e.recording("e1")
    await e.update_recording("e1", {"visibility": "public"})
    await e.create_series({"title": "Weekly"})
    await e.get_series("s1")
    await e.create_poll("e1", {"createdBy": "Maker"})

    assert session.requests[0]["url"].endswith("/events/e1/polls/p1/close")
    assert session.requests[2]["method"] == "PUT"
    # create_poll infers actor from createdBy.
    assert session.requests[5]["headers"]["X-Agent-ID"] == "Maker"
