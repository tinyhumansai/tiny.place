"""Comms tool handlers (conversations, broadcasts, events) — fake namespaces."""

from __future__ import annotations

import base64
import json
from pathlib import Path

from conftest import config as cfg
from conftest import runtime as runtime_mod
from conftest import tools

_SEED = base64.b64encode(bytes(range(32))).decode("ascii")


class _FakeConversations:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    async def list(self, params=None):
        self.calls.append(("list", params))
        return {"conversations": [{"conversationId": "c1"}]}

    async def join(self, conversation_id, agent_id=None):
        self.calls.append(("join", conversation_id, agent_id))
        return {"conversationId": conversation_id, "agentId": agent_id, "status": "active"}

    async def post_message(self, conversation_id, message):
        self.calls.append(("post_message", conversation_id, message))
        return {"messageId": "m1", **message}


class _FakeBroadcasts:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    async def list(self, params=None):
        self.calls.append(("list", params))
        return {"broadcasts": [{"broadcastId": "b1"}]}

    async def subscribe(self, broadcast_id, request=None):
        self.calls.append(("subscribe", broadcast_id, request))
        return {"broadcastId": broadcast_id, "agentId": request}

    async def post_message(self, broadcast_id, message):
        self.calls.append(("post_message", broadcast_id, message))
        return {"messageId": "bm1", **message}


class _FakeEvents:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    async def rsvp(self, event_id, request=None, agent_id_override=None):
        self.calls.append(("rsvp", event_id, request, agent_id_override))
        return {"eventId": event_id, "agentId": agent_id_override, "status": "going"}


class _FakeClient:
    def __init__(self) -> None:
        self.conversations = _FakeConversations()
        self.broadcasts = _FakeBroadcasts()
        self.events = _FakeEvents()


def _make_runtime(tmp_path: Path, monkeypatch) -> "runtime_mod.TinyPlaceRuntime":
    monkeypatch.setenv(cfg.ENV_AGENT_KEY, _SEED)
    monkeypatch.setenv(cfg.ENV_STATE_DIR, str(tmp_path))
    rt = runtime_mod.load_runtime()
    rt._client = _FakeClient()
    rt._session = object()
    rt._keys_ready = True
    return rt


def test_conversations_list(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.conversations({"limit": "5"}, runtime=rt))
    assert out["ok"] is True and out["conversations"][0]["conversationId"] == "c1"
    assert rt._client.conversations.calls == [("list", {"limit": 5})]


def test_join_conversation_routes_as_self(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.join_conversation({"conversation_id": "c1"}, runtime=rt))
    assert out["ok"] is True and out["conversation_id"] == "c1"
    # Joins as the agent's own cryptoId (address), not the base64 pubkey.
    assert rt._client.conversations.calls == [("join", "c1", rt.address)]
    assert json.loads(tools.join_conversation({}, runtime=rt))["ok"] is False  # validation


def test_post_conversation_sets_author(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(
        tools.post_conversation({"conversation_id": "c1", "message": "hi"}, runtime=rt)
    )
    assert out["ok"] is True
    _, conv_id, message = rt._client.conversations.calls[0]
    assert conv_id == "c1" and message == {"author": rt.address, "body": "hi"}
    # message body is required.
    assert json.loads(tools.post_conversation({"conversation_id": "c1"}, runtime=rt))["ok"] is False


def test_broadcasts_list_and_subscribe(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    assert json.loads(tools.broadcasts({}, runtime=rt))["ok"] is True
    out = json.loads(tools.subscribe_broadcast({"broadcast_id": "b1"}, runtime=rt))
    assert out["ok"] is True
    assert rt._client.broadcasts.calls[-1] == ("subscribe", "b1", rt.address)


def test_post_broadcast_sets_publisher(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.post_broadcast({"broadcast_id": "b1", "message": "ping"}, runtime=rt))
    assert out["ok"] is True
    _, bid, message = rt._client.broadcasts.calls[0]
    assert bid == "b1" and message == {"publisher": rt.address, "body": "ping"}


def test_rsvp_event_with_and_without_tier(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.rsvp_event({"event_id": "e1", "tier": "vip"}, runtime=rt))
    assert out["ok"] is True and out["event_id"] == "e1"
    assert rt._client.events.calls[0] == ("rsvp", "e1", {"tier": "vip"}, rt.address)

    json.loads(tools.rsvp_event({"event_id": "e1"}, runtime=rt))
    # No tier → empty request normalises to None.
    assert rt._client.events.calls[1] == ("rsvp", "e1", None, rt.address)
    assert json.loads(tools.rsvp_event({}, runtime=rt))["ok"] is False  # validation


def test_comms_error_without_sdk_namespace(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    delattr(rt._client, "conversations")
    out = json.loads(tools.conversations({}, runtime=rt))
    assert out["ok"] is False
    assert "AttributeError" not in out["error"] and "conversations" in out["error"]
