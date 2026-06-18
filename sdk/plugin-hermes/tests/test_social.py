"""Social graph + reputation tool handlers — injected fake namespaces."""

from __future__ import annotations

import base64
import json
from pathlib import Path

from conftest import config as cfg
from conftest import runtime as runtime_mod
from conftest import tools

_SEED = base64.b64encode(bytes(range(32))).decode("ascii")


class _FakeFollows:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    async def follow(self, agent_id):
        self.calls.append(("follow", agent_id))
        return {"following": True}

    async def unfollow(self, agent_id):
        self.calls.append(("unfollow", agent_id))


class _FakeFeeds:
    def __init__(self) -> None:
        self.home_params: object = "<unset>"

    async def home_feed(self, params=None):
        self.home_params = params
        return {"items": [{"id": "p1"}], "count": 1}


class _FakeReputation:
    def __init__(self) -> None:
        self.vouched: list[dict] = []

    async def get_score(self, agent_id):
        return {"agent": agent_id, "score": 42}

    async def get_vouches(self, agent_id):
        return {"vouches": []}

    async def get_attestations(self, agent_id):
        return {"attestations": []}

    async def create_vouch(self, vouch):
        self.vouched.append(vouch)
        return {"vouchId": "v1", **vouch}


class _FakeProfiles:
    async def get(self, username):
        return {"username": username, "bio": "hi"}


class _FakeClient:
    def __init__(self) -> None:
        self.follows = _FakeFollows()
        self.feeds = _FakeFeeds()
        self.reputation = _FakeReputation()
        self.profiles = _FakeProfiles()


def _make_runtime(tmp_path: Path, monkeypatch) -> "runtime_mod.TinyPlaceRuntime":
    monkeypatch.setenv(cfg.ENV_AGENT_KEY, _SEED)
    monkeypatch.setenv(cfg.ENV_STATE_DIR, str(tmp_path))
    rt = runtime_mod.load_runtime()
    rt._client = _FakeClient()
    rt._session = object()
    rt._keys_ready = True
    return rt


def test_follow_and_unfollow(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    assert json.loads(tools.follow({"agent": "AgentX"}, runtime=rt))["ok"] is True
    out = json.loads(tools.unfollow({"agent": "AgentX"}, runtime=rt))
    assert out["ok"] is True and out["unfollowed"] is True
    assert rt._client.follows.calls == [("follow", "AgentX"), ("unfollow", "AgentX")]
    assert json.loads(tools.follow({}, runtime=rt))["ok"] is False  # validation


def test_feed_and_profile(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.feed({"limit": "3"}, runtime=rt))
    assert out["ok"] is True and out["count"] == 1
    assert rt._client.feeds.home_params == {"limit": 3}

    out = json.loads(tools.profile({"username": "@alice"}, runtime=rt))
    assert out["ok"] is True and out["profile"]["username"] == "@alice"


def test_reputation_aggregates_score_vouches_attestations(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.reputation({"agent": "AgentX"}, runtime=rt))
    assert out["ok"] is True and out["agent"] == "AgentX"
    assert out["score"]["score"] == 42
    assert "vouches" in out and "attestations" in out


def test_vouch_signs_as_self(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.vouch({"subject": "AgentX", "comment": "solid"}, runtime=rt))
    assert out["ok"] is True
    vouched = rt._client.reputation.vouched[0]
    assert vouched["voucher"] == rt.address and vouched["subject"] == "AgentX"
    assert vouched["comment"] == "solid"
    assert json.loads(tools.vouch({}, runtime=rt))["ok"] is False  # validation


def test_social_errors_without_sdk_namespace(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    delattr(rt._client, "follows")
    out = json.loads(tools.follow({"agent": "AgentX"}, runtime=rt))
    assert out["ok"] is False
    assert "AttributeError" not in out["error"] and "follows" in out["error"]
