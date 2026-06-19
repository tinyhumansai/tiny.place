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
        self.create_solana_calls: list[tuple[dict, dict]] = []
        self.submitted: list[tuple[str, dict]] = []

    async def list(self, params=None):
        self.list_params = params
        return {"bounties": [{"bountyId": "b1"}]}

    async def create(self, request):
        self.created.append(request)
        return {"bountyId": "b1", **request}

    async def create_with_solana_payment(self, request, **kwargs):
        # POST /bounties is a combined create+fund: the reward settles on chain and
        # the bounty is created already open.
        self.create_solana_calls.append((request, kwargs))
        return {"bounty": {"bountyId": "b1", "status": "open", **request}, "payment": {"signature": "sig"}}

    async def submit(self, bounty_id, request):
        self.submitted.append((bounty_id, request))
        return {"submissionId": "s1", **request}


class _FakeClient:
    def __init__(self) -> None:
        self.bounties = _FakeBounties()


def _make_runtime(tmp_path: Path, monkeypatch, *, fund: bool = True) -> "runtime_mod.TinyPlaceRuntime":
    monkeypatch.setenv(cfg.ENV_AGENT_KEY, _SEED)
    monkeypatch.setenv(cfg.ENV_STATE_DIR, str(tmp_path))
    # Creating a bounty creates AND funds it in one x402 flow, so the Solana
    # settlement config is required; tests opt out with fund=False to exercise the
    # "funding required" error path.
    if fund:
        monkeypatch.setenv("TINYPLACE_SOLANA_NETWORK", "devnet")
        monkeypatch.setenv("TINYPLACE_SOLANA_RPC_URL", "https://rpc.example.test")
    else:
        monkeypatch.delenv("TINYPLACE_SOLANA_NETWORK", raising=False)
    rt = runtime_mod.load_runtime()
    rt._client = _FakeClient()
    rt._session = object()
    rt._keys_ready = True
    return rt


def _last_create(rt: "runtime_mod.TinyPlaceRuntime") -> dict:
    """The most recent create+fund request payload."""
    return rt._client.bounties.create_solana_calls[-1][0]


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
    created = _last_create(rt)
    assert created["creator"] == rt.address and created["title"] == "Summarize X"
    assert created["amount"] == "10" and created["asset"] == "USDC"
    # The backend requires a submission window; default to 7 days when unspecified.
    assert created["durationDays"] == 7 and "deadline" not in created


def test_create_bounty_window_from_duration_or_deadline(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    base = {"title": "X", "description": "do it", "amount": "10"}

    json.loads(tools.create_bounty({**base, "duration_days": 14}, runtime=rt))
    assert _last_create(rt)["durationDays"] == 14

    json.loads(tools.create_bounty({**base, "deadline": "2026-07-01T00:00:00Z"}, runtime=rt))
    last = _last_create(rt)
    # An explicit deadline wins; no durationDays is sent alongside it.
    assert last["deadline"] == "2026-07-01T00:00:00Z" and "durationDays" not in last

    # When both are given, the explicit deadline still wins.
    json.loads(
        tools.create_bounty(
            {**base, "duration_days": 14, "deadline": "2026-07-02T00:00:00Z"}, runtime=rt
        )
    )
    both = _last_create(rt)
    assert both["deadline"] == "2026-07-02T00:00:00Z" and "durationDays" not in both


def test_create_bounty_rejects_out_of_range_duration_days(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    base = {"title": "X", "description": "do it", "amount": "10"}
    before = len(rt._client.bounties.create_solana_calls)
    for bad in (0, 32):
        out = json.loads(tools.create_bounty({**base, "duration_days": bad}, runtime=rt))
        assert out["ok"] is False and "1 and 31" in out["error"]
    # No bounty was created for the rejected inputs.
    assert len(rt._client.bounties.create_solana_calls) == before


def test_create_bounty_settles_when_configured(tmp_path, monkeypatch):
    # With a Solana network + RPC set, POST /bounties is a combined create+fund:
    # the tool settles on chain via create_with_solana_payment and the bounty is
    # created already open.
    rt = _make_runtime(tmp_path, monkeypatch)

    out = json.loads(
        tools.create_bounty({"title": "X", "description": "do it", "amount": "5"}, runtime=rt)
    )
    assert out["ok"] is True and out["settled"] is True and out["onChainTx"] == "sig"
    # Always uses the combined create+fund settlement path (no plain draft create).
    assert rt._client.bounties.created == []
    request, kwargs = rt._client.bounties.create_solana_calls[0]
    assert request["creator"] == rt.address and request["durationDays"] == 7
    assert kwargs["rpc_url"] == "https://rpc.example.test"


def test_create_bounty_requires_funding_config(tmp_path, monkeypatch):
    # Creating a bounty creates AND funds it in one flow; without a configured
    # Solana network it returns an actionable error and creates nothing.
    rt = _make_runtime(tmp_path, monkeypatch, fund=False)

    out = json.loads(
        tools.create_bounty({"title": "X", "description": "do it", "amount": "5"}, runtime=rt)
    )
    assert out["ok"] is False and "TINYPLACE_SOLANA_NETWORK" in out["error"]
    assert rt._client.bounties.create_solana_calls == []
    assert rt._client.bounties.created == []


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
