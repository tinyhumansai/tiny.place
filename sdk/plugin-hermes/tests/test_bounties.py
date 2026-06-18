"""Bounty tool handlers — injected fake ``bounties`` namespace + settlement gating."""

from __future__ import annotations

import base64
import json
from pathlib import Path

from conftest import config as cfg
from conftest import runtime as runtime_mod
from conftest import tools

_SEED = base64.b64encode(bytes(range(32))).decode("ascii")


class _FakeBounties:
    def __init__(self) -> None:
        self.list_params: object = "<unset>"
        self.created: list[dict] = []
        self.submitted: list[tuple[str, dict]] = []
        self.fund_calls: list[tuple] = []

    async def list(self, params=None):
        self.list_params = params
        return {"bounties": [{"bountyId": "b1"}]}

    async def create(self, request):
        self.created.append(request)
        return {"bountyId": "b1", **request}

    async def submit(self, bounty_id, request):
        self.submitted.append((bounty_id, request))
        return {"submissionId": "s1", **request}

    async def fund_with_solana_payment(self, bounty_id, creator, **kwargs):
        self.fund_calls.append((bounty_id, creator, kwargs))
        return {"bounty": {"bountyId": bounty_id, "status": "funded"}, "payment": {"signature": "sig"}}


class _FakeClient:
    def __init__(self) -> None:
        self.bounties = _FakeBounties()


def _make_runtime(tmp_path: Path, monkeypatch) -> "runtime_mod.TinyPlaceRuntime":
    monkeypatch.setenv(cfg.ENV_AGENT_KEY, _SEED)
    monkeypatch.setenv(cfg.ENV_STATE_DIR, str(tmp_path))
    rt = runtime_mod.load_runtime()
    rt._client = _FakeClient()
    rt._session = object()
    rt._keys_ready = True
    return rt


def test_list_bounties_builds_params(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    # query is ignored (the bounty list API has no text search); status passes through.
    out = json.loads(tools.list_bounties({"query": "summarize", "status": "open"}, runtime=rt))
    assert out["ok"] is True and out["bounties"][0]["bountyId"] == "b1"
    assert rt._client.bounties.list_params == {"status": "open"}


def test_create_bounty_addresses_as_self(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(
        tools.create_bounty(
            {"title": "Summarize X", "description": "do it", "amount": "10"}, runtime=rt
        )
    )
    assert out["ok"] is True
    created = rt._client.bounties.created[0]
    assert created["creator"] == rt.address and created["title"] == "Summarize X"
    assert created["amount"] == "10" and created["asset"] == "USDC"
    # The backend requires a submission window; default to 7 days when unspecified.
    assert created["durationDays"] == 7 and "deadline" not in created


def test_create_bounty_window_from_duration_or_deadline(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    base = {"title": "X", "description": "do it", "amount": "10"}

    json.loads(tools.create_bounty({**base, "duration_days": 14}, runtime=rt))
    assert rt._client.bounties.created[-1]["durationDays"] == 14

    json.loads(tools.create_bounty({**base, "deadline": "2026-07-01T00:00:00Z"}, runtime=rt))
    last = rt._client.bounties.created[-1]
    # An explicit deadline wins; no durationDays is sent alongside it.
    assert last["deadline"] == "2026-07-01T00:00:00Z" and "durationDays" not in last

    # When both are given, the explicit deadline still wins.
    json.loads(
        tools.create_bounty(
            {**base, "duration_days": 14, "deadline": "2026-07-02T00:00:00Z"}, runtime=rt
        )
    )
    both = rt._client.bounties.created[-1]
    assert both["deadline"] == "2026-07-02T00:00:00Z" and "durationDays" not in both


def test_create_bounty_rejects_out_of_range_duration_days(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    base = {"title": "X", "description": "do it", "amount": "10"}
    before = len(rt._client.bounties.created)
    for bad in (0, 32):
        out = json.loads(tools.create_bounty({**base, "duration_days": bad}, runtime=rt))
        assert out["ok"] is False and "1 and 31" in out["error"]
    # No bounty was created for the rejected inputs.
    assert len(rt._client.bounties.created) == before


def test_submit_bounty_addresses_as_self(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(
        tools.submit_bounty({"bounty_id": "b1", "url": "https://x", "note": "here"}, runtime=rt)
    )
    assert out["ok"] is True and out["bounty_id"] == "b1"
    bounty_id, request = rt._client.bounties.submitted[0]
    assert bounty_id == "b1" and request["submitter"] == rt.address
    assert request["url"] == "https://x" and request["note"] == "here"


def test_create_and_submit_validation(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    assert json.loads(tools.create_bounty({"title": "X"}, runtime=rt))["ok"] is False  # no desc/amount
    assert json.loads(tools.submit_bounty({"bounty_id": "b1"}, runtime=rt))["ok"] is False  # no url


def test_fund_bounty_settles_when_configured(tmp_path, monkeypatch):
    monkeypatch.setenv("TINYPLACE_SOLANA_NETWORK", "devnet")
    monkeypatch.setenv("TINYPLACE_SOLANA_RPC_URL", "https://rpc.example.test")
    rt = _make_runtime(tmp_path, monkeypatch)

    out = json.loads(tools.fund_bounty({"bounty_id": "b1"}, runtime=rt))
    assert out["ok"] is True and out["onChainTx"] == "sig"
    bounty_id, creator, kwargs = rt._client.bounties.fund_calls[0]
    assert bounty_id == "b1" and creator == rt.address
    assert kwargs["rpc_url"] == "https://rpc.example.test"
    assert isinstance(kwargs["secret_key"], (bytes, bytearray))


def test_fund_bounty_requires_solana_config(tmp_path, monkeypatch):
    monkeypatch.delenv("TINYPLACE_SOLANA_NETWORK", raising=False)
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.fund_bounty({"bounty_id": "b1"}, runtime=rt))
    assert out["ok"] is False and "TINYPLACE_SOLANA_NETWORK" in out["error"]
