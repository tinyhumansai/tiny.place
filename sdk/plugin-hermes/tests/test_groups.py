"""Group tool handlers + poll_inbox routing of group sender-key handoffs.

These never import the SDK's group-messaging module: the heavy orchestration is
faked via ``tools._group_messaging`` and a fake ``group_keys``, so the tests
exercise the plugin's wiring/routing independently of the SDK version installed.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

from conftest import config as cfg
from conftest import runtime as runtime_mod
from conftest import tools

_SEED = base64.b64encode(bytes(range(32))).decode("ascii")


class _FakeGroups:
    def __init__(self) -> None:
        self.list_params: object = "<unset>"
        self.joined: list[tuple[str, object]] = []
        self.members_result = {
            "members": [
                {"agentId": "a", "status": "active"},
                {"agentId": "b", "status": "active"},
                # Pending/approval-queue member: must NOT receive the sender key.
                {"agentId": "pending", "status": "pending"},
            ]
        }

    async def list(self, params=None):
        self.list_params = params
        return {"groups": [{"groupId": "grp1"}]}

    async def get(self, group_id):
        return {"groupId": group_id, "membershipEpoch": 2}

    async def members(self, group_id):
        return self.members_result

    async def join(self, group_id, request=None):
        self.joined.append((group_id, request))
        return {"status": "joined"}


class _Msg:
    def __init__(self, id, sender, plaintext, timestamp):
        self.id = id
        self.sender = sender
        self.plaintext = plaintext
        self.timestamp = timestamp


class _FakeMessages:
    def __init__(self, decrypted) -> None:
        self._decrypted = decrypted

    async def poll_inbox_decrypted(self, session, agent_id, **_):
        return list(self._decrypted)


class _FakeClient:
    def __init__(self) -> None:
        self.groups = _FakeGroups()


def _make_runtime(tmp_path: Path, monkeypatch) -> "runtime_mod.TinyPlaceRuntime":
    monkeypatch.setenv(cfg.ENV_AGENT_KEY, _SEED)
    monkeypatch.setenv(cfg.ENV_STATE_DIR, str(tmp_path))
    rt = runtime_mod.load_runtime()
    rt._client = _FakeClient()
    rt._session = object()
    rt._keys_ready = True
    return rt


def test_list_groups_builds_params(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.list_groups({"query": "ai", "limit": "5"}, runtime=rt))
    assert out["ok"] is True
    assert out["groups"][0]["groupId"] == "grp1"
    assert rt._client.groups.list_params == {"q": "ai", "limit": 5}


def test_join_group_joins_as_self(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.join_group({"group_id": "grp1"}, runtime=rt))
    assert out["ok"] is True and out["group_id"] == "grp1"
    assert rt._client.groups.joined == [("grp1", rt.address)]


def test_join_group_validation(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    assert json.loads(tools.join_group({}, runtime=rt))["ok"] is False


def test_send_group_message_uses_epoch_and_members(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    rt._group_keys = object()  # group key manager (faked; not exercised here)
    captured: dict = {}

    class _Sent:
        id = "grp_1"
        group_id = "grp1"
        text = "hi"

    async def fake_send(client, session, group_keys, **kwargs):
        captured.update(kwargs)
        return _Sent()

    class _Messaging:
        send_group_message = staticmethod(fake_send)

    monkeypatch.setattr(tools, "_group_messaging", lambda: _Messaging())

    out = json.loads(
        tools.send_group_message({"group_id": "grp1", "message": "hi"}, runtime=rt)
    )
    assert out["ok"] is True
    assert out["epoch"] == 2 and out["recipients"] == 2 and out["text"] == "hi"
    # epoch from group metadata, members from groups.members, addressed as self.
    assert captured["group_id"] == "grp1" and captured["epoch"] == 2
    # Only active members receive the sender key — the pending member is excluded.
    assert captured["members"] == ["a", "b"]
    assert captured["sender"] == rt.address and captured["enc_address"] == rt.address


def test_send_group_message_validation(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    assert json.loads(tools.send_group_message({"message": "x"}, runtime=rt))["ok"] is False
    assert json.loads(tools.send_group_message({"group_id": "g"}, runtime=rt))["ok"] is False


def test_send_group_message_errors_without_sdk_support(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    monkeypatch.setattr(tools, "_group_messaging", lambda: None)
    out = json.loads(tools.send_group_message({"group_id": "g", "message": "hi"}, runtime=rt))
    assert out["ok"] is False and "messaging" in out["error"]


def test_poll_group_inbox_renders_messages(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    rt._group_keys = object()

    class _M:
        def __init__(self, id, group_id, sender, text, at):
            self.id = id
            self.group_id = group_id
            self.sender = sender
            self.text = text
            self.at = at

    async def fake_fetch(client, actor, group_keys):
        return [_M("e1", "grp1", "SenderA", "hello", "2026-01-01T00:00:00Z")]

    class _Messaging:
        fetch_group_inbox = staticmethod(fake_fetch)

    monkeypatch.setattr(tools, "_group_messaging", lambda: _Messaging())

    out = json.loads(tools.poll_group_inbox({}, runtime=rt))
    assert out["ok"] is True and out["count"] == 1
    assert out["messages"][0] == {
        "id": "e1",
        "group_id": "grp1",
        "from": "SenderA",
        "text": "hello",
        "timestamp": "2026-01-01T00:00:00Z",
    }


def test_poll_inbox_routes_group_key_handoff(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    rt._client.messages = _FakeMessages(
        [
            _Msg("m1", "SenderA", b"HANDOFF:grp1", "2026-01-01T00:00:00Z"),
            _Msg("m2", "peer", b"a normal dm", "2026-01-02T00:00:00Z"),
        ]
    )

    installed: list[object] = []

    class _GroupKeys:
        def install_receiver(self, payload):
            installed.append(payload)

    class _Messaging:
        @staticmethod
        def parse_group_key_distribution(text):
            return {"groupId": "grp1"} if text.startswith("HANDOFF") else None

    rt._group_keys = _GroupKeys()
    monkeypatch.setattr(tools, "_group_messaging", lambda: _Messaging())

    out = json.loads(tools.poll_inbox({}, runtime=rt))
    assert out["ok"] is True
    # The handoff is routed to the key manager, not surfaced; only the real DM is.
    assert [m["text"] for m in out["messages"]] == ["a normal dm"]
    assert installed == [{"groupId": "grp1"}]


def test_poll_inbox_without_sdk_support_surfaces_all(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    rt._client.messages = _FakeMessages(
        [_Msg("m1", "peer", b"hello", "2026-01-01T00:00:00Z")]
    )
    # No group-messaging SDK -> routing is skipped, DMs still flow.
    monkeypatch.setattr(tools, "_group_messaging", lambda: None)
    out = json.loads(tools.poll_inbox({}, runtime=rt))
    assert out["ok"] is True and [m["text"] for m in out["messages"]] == ["hello"]
