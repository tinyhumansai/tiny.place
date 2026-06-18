"""Discovery handlers (directory + search), returning valid JSON strings.

Like ``test_tools.py``, these never touch a live backend: a fake
``TinyPlaceClient`` exposing ``.directory`` and ``.search`` namespaces is
injected into a real :class:`TinyPlaceRuntime` and handlers are driven via the
``runtime=`` kwarg.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

from conftest import config as cfg
from conftest import runtime as runtime_mod
from conftest import tools

# A deterministic 32-byte Ed25519 seed, base64 — valid TINYPLACE_AGENT_KEY.
_SEED = base64.b64encode(bytes(range(32))).decode("ascii")


# --- fakes ------------------------------------------------------------------


class _FakeDirectory:
    def __init__(self) -> None:
        self.list_params: object = "<unset>"
        self.list_result = {
            "agents": [
                {
                    "agentId": "agent-1",
                    "cryptoId": "CryptoId1",
                    "username": "@alice",
                    "name": "Alice",
                    "description": "Research agent",
                    "skills": ["research"],
                    "tags": ["ai"],
                    "metadata": {"encryptionPublicKey": "ALICE_ADDR=="},
                }
            ]
        }
        self.get_calls: list[str] = []

    async def list_agents(self, params=None):
        self.list_params = params
        return self.list_result

    async def get_agent(self, agent_id):
        self.get_calls.append(agent_id)
        return {
            "agentId": agent_id,
            "cryptoId": agent_id,
            "username": "@bob",
            "name": "Bob",
            "publicKey": "BOB_PUBKEY==",
        }


class _FakeSearch:
    def __init__(self) -> None:
        self.queries: list[str] = []
        self.result = {"agents": [{"name": "Alice"}], "groups": []}

    async def unified(self, query):
        self.queries.append(query)
        return self.result


class _FakeClient:
    def __init__(self) -> None:
        self.directory = _FakeDirectory()
        self.search = _FakeSearch()
        self.resolve_user_calls: list[str] = []

    async def resolve_user(self, handle):
        # Mirrors the SDK convenience method get_agent delegates handle lookups
        # to; the real one normalizes the handle (adds a leading '@').
        self.resolve_user_calls.append(handle)
        return {
            "identity": {"username": handle},
            "agentCard": {
                "agentId": "agent-9",
                "username": handle,
                "metadata": {"encryptionPublicKey": "RESOLVED_ADDR=="},
            },
        }


def _make_runtime(tmp_path: Path, monkeypatch) -> "runtime_mod.TinyPlaceRuntime":
    monkeypatch.setenv(cfg.ENV_AGENT_KEY, _SEED)
    monkeypatch.setenv(cfg.ENV_STATE_DIR, str(tmp_path))
    rt = runtime_mod.load_runtime()
    rt._client = _FakeClient()
    rt._session = object()
    rt._keys_ready = True
    return rt


# --- discover_agents --------------------------------------------------------


def test_discover_agents_success_summaries(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.discover_agents({}, runtime=rt))
    assert out["ok"] is True and out["count"] == 1
    agent = out["agents"][0]
    assert agent["username"] == "@alice"
    assert agent["cryptoId"] == "CryptoId1"
    # The summary carries the messaging address (from encryptionPublicKey
    # metadata) so the model can hand it to tinyplace_send_message.
    assert agent["messaging_address"] == "ALICE_ADDR=="


def test_discover_agents_builds_filter_params(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    json.loads(
        tools.discover_agents(
            {"query": " researcher ", "skill": "nlp", "limit": "5"}, runtime=rt
        )
    )
    assert rt._client.directory.list_params == {
        "q": "researcher",
        "skill": "nlp",
        "limit": 5,
    }


def test_discover_agents_no_params_passes_none(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    json.loads(tools.discover_agents({"limit": 0}, runtime=rt))
    # Empty/invalid filters collapse to None rather than an empty query string.
    assert rt._client.directory.list_params is None


# --- get_agent --------------------------------------------------------------


def test_get_agent_by_crypto_id_uses_get_agent(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    # rt.address is a valid base58 cryptoId, so it routes through get_agent.
    out = json.loads(tools.get_agent({"agent": rt.address}, runtime=rt))
    assert out["ok"] is True
    assert rt._client.directory.get_calls == [rt.address]
    assert rt._client.resolve_user_calls == []
    assert out["messaging_address"] == "BOB_PUBKEY=="


def test_get_agent_by_handle_resolves(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.get_agent({"agent": "@alice"}, runtime=rt))
    assert out["ok"] is True
    # A @handle is resolved via resolve_user (which normalizes the handle),
    # passed through verbatim — NOT stripped of its leading '@'.
    assert rt._client.resolve_user_calls == ["@alice"]
    assert rt._client.directory.get_calls == []
    assert out["messaging_address"] == "RESOLVED_ADDR=="


def test_get_agent_bare_username_resolves(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.get_agent({"agent": "bob"}, runtime=rt))
    assert out["ok"] is True
    # A bare username is not a messaging address, so it also routes through
    # resolve_user (the SDK adds the leading '@').
    assert rt._client.resolve_user_calls == ["bob"]
    assert rt._client.directory.get_calls == []


def test_get_agent_validation(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    err = json.loads(tools.get_agent({}, runtime=rt))
    assert err["ok"] is False and "agent" in err["error"]


# --- search -----------------------------------------------------------------


def test_search_success_and_validation(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.search({"query": "trading bots"}, runtime=rt))
    assert out["ok"] is True
    assert rt._client.search.queries == ["trading bots"]
    assert "agents" in out["results"]

    err = json.loads(tools.search({}, runtime=rt))
    assert err["ok"] is False and "query" in err["error"]
