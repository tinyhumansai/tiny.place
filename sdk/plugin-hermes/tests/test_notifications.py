"""Notification handlers (platform inbox), returning valid JSON strings.

Mirrors test_discovery.py: a fake ``TinyPlaceClient`` exposing an ``.inbox``
namespace is injected into a real :class:`TinyPlaceRuntime`, and handlers are
driven via the ``runtime=`` kwarg.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

from conftest import config as cfg
from conftest import runtime as runtime_mod
from conftest import tools

_SEED = base64.b64encode(bytes(range(32))).decode("ascii")


class _FakeInbox:
    def __init__(self) -> None:
        self.list_params: object = "<unset>"
        self.list_result = {
            "items": [{"id": "n1", "type": "ESCROW_EVENT"}],
            "unreadCount": 1,
        }
        self.mark_read_calls: list[str] = []
        self.mark_all_calls = 0

    async def list(self, params=None, owner=None):
        self.list_params = params
        return self.list_result

    async def mark_read(self, item_id, owner=None):
        self.mark_read_calls.append(item_id)
        return {"ok": True, "id": item_id}

    async def mark_all_read(self, params=None, owner=None):
        self.mark_all_calls += 1
        return {"updated": 7}


class _FakeClient:
    def __init__(self) -> None:
        self.inbox = _FakeInbox()


def _make_runtime(tmp_path: Path, monkeypatch) -> "runtime_mod.TinyPlaceRuntime":
    monkeypatch.setenv(cfg.ENV_AGENT_KEY, _SEED)
    monkeypatch.setenv(cfg.ENV_STATE_DIR, str(tmp_path))
    rt = runtime_mod.load_runtime()
    rt._client = _FakeClient()
    rt._session = object()
    rt._keys_ready = True
    return rt


def test_notifications_defaults_to_unread(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.notifications({}, runtime=rt))
    assert out["ok"] is True
    assert out["inbox"]["unreadCount"] == 1
    # Omitting status defaults to unread explicitly (the backend default is broader).
    assert rt._client.inbox.list_params == {"status": "unread"}


def test_notifications_builds_filter_params(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    json.loads(tools.notifications({"status": "all", "limit": "5"}, runtime=rt))
    assert rt._client.inbox.list_params == {"status": "all", "limit": 5}


def test_mark_notifications_read_single(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.mark_notifications_read({"item_id": "n1"}, runtime=rt))
    assert out["ok"] is True and out["scope"] == "item"
    assert rt._client.inbox.mark_read_calls == ["n1"]
    assert rt._client.inbox.mark_all_calls == 0


def test_mark_notifications_read_all_when_no_id(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.mark_notifications_read({}, runtime=rt))
    assert out["ok"] is True and out["scope"] == "all"
    assert rt._client.inbox.mark_all_calls == 1
    assert rt._client.inbox.mark_read_calls == []


def test_mark_notifications_read_rejects_blank_item_id(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    # A provided-but-blank item_id is an error, NOT a silent "mark all".
    out = json.loads(tools.mark_notifications_read({"item_id": "  "}, runtime=rt))
    assert out["ok"] is False and "item_id" in out["error"]
    assert rt._client.inbox.mark_all_calls == 0
    assert rt._client.inbox.mark_read_calls == []


def test_notifications_errors_clearly_without_inbox_support(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    # An SDK that predates the inbox namespace -> actionable error, not AttributeError.
    delattr(rt._client, "inbox")
    out = json.loads(tools.notifications({}, runtime=rt))
    assert out["ok"] is False
    assert "AttributeError" not in out["error"]
    assert "inbox" in out["error"]
