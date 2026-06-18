"""Commerce tool handlers (marketplace/jobs/escrow).

A fake ``TinyPlaceClient`` with ``jobs``/``escrow``/``marketplace`` namespaces is
injected into a real runtime; handlers are driven via the ``runtime=`` kwarg.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

from conftest import config as cfg
from conftest import runtime as runtime_mod
from conftest import tools

_SEED = base64.b64encode(bytes(range(32))).decode("ascii")


class _FakeJobs:
    def __init__(self) -> None:
        self.list_params: object = "<unset>"
        self.created: list[dict] = []
        self.applied: list[tuple[str, dict]] = []

    async def list(self, params=None):
        self.list_params = params
        return {"jobs": [{"jobId": "job1"}]}

    async def create(self, request):
        self.created.append(request)
        return {"jobId": "job1", **request}

    async def apply(self, job_id, request):
        self.applied.append((job_id, request))
        return {"proposalId": "p1", **request}


class _FakeEscrow:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    async def accept(self, escrow_id, actor=None):
        self.calls.append(("accept", escrow_id, actor))
        return {"id": escrow_id, "status": "accepted"}

    async def deliver(self, escrow_id, proof):
        self.calls.append(("deliver", escrow_id, proof))
        return {"id": escrow_id, "status": "delivered"}

    async def accept_delivery(self, escrow_id, actor=None, on_chain_tx=None):
        self.calls.append(("accept_delivery", escrow_id, actor, on_chain_tx))
        return {"id": escrow_id, "status": "released"}


class _FakeMarketplace:
    def __init__(self) -> None:
        self.list_params: object = "<unset>"

    async def list_products(self, params=None):
        self.list_params = params
        return {"products": [{"productId": "prod1"}]}

    async def buy_product_with_solana_payment(self, product_id, request, **kwargs):
        self.buy_calls = getattr(self, "buy_calls", [])
        self.buy_calls.append((product_id, request, kwargs))
        return {"purchase": {"purchaseId": "pur1"}, "payment": {"signature": "onchain-sig"}}


class _FakeClient:
    def __init__(self) -> None:
        self.jobs = _FakeJobs()
        self.escrow = _FakeEscrow()
        self.marketplace = _FakeMarketplace()


def _make_runtime(tmp_path: Path, monkeypatch) -> "runtime_mod.TinyPlaceRuntime":
    monkeypatch.setenv(cfg.ENV_AGENT_KEY, _SEED)
    monkeypatch.setenv(cfg.ENV_STATE_DIR, str(tmp_path))
    rt = runtime_mod.load_runtime()
    rt._client = _FakeClient()
    rt._session = object()
    rt._keys_ready = True
    return rt


def test_list_products_and_jobs_build_params(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.list_products({"query": "data", "limit": "5"}, runtime=rt))
    assert out["ok"] is True and out["products"][0]["productId"] == "prod1"
    assert rt._client.marketplace.list_params == {"q": "data", "limit": 5}

    out = json.loads(tools.list_jobs({"status": "open"}, runtime=rt))
    assert out["ok"] is True and out["jobs"][0]["jobId"] == "job1"
    assert rt._client.jobs.list_params == {"status": "open"}


def test_post_job_and_apply_address_as_self(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(
        tools.post_job({"title": "Build X", "budget": "10"}, runtime=rt)
    )
    assert out["ok"] is True
    created = rt._client.jobs.created[0]
    assert created["client"] == rt.address and created["title"] == "Build X"
    # The jobs API requires a budget object {amount, asset} (asset defaults USDC).
    assert created["budget"] == {"amount": "10", "asset": "USDC"}

    out = json.loads(tools.apply_to_job({"job_id": "job1", "proposal": "I can help"}, runtime=rt))
    assert out["ok"] is True and out["job_id"] == "job1"
    job_id, request = rt._client.jobs.applied[0]
    # proposal/rate map to the SDK's coverLetter/bidAmount.
    assert job_id == "job1" and request["candidate"] == rt.address
    assert request["coverLetter"] == "I can help"


def test_post_job_validation(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    assert json.loads(tools.post_job({}, runtime=rt))["ok"] is False  # no title
    # title but no budget -> rejected (budget is required by the jobs API).
    assert json.loads(tools.post_job({"title": "X"}, runtime=rt))["ok"] is False
    assert json.loads(tools.apply_to_job({}, runtime=rt))["ok"] is False


def test_escrow_accept_deliver_accept_delivery(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    json.loads(tools.accept_escrow({"escrow_id": "e1"}, runtime=rt))
    json.loads(
        tools.deliver_escrow(
            {"escrow_id": "e1", "description": "done", "refs": ["r1"]}, runtime=rt
        )
    )
    json.loads(
        tools.accept_escrow_delivery({"escrow_id": "e1", "on_chain_tx": "sig"}, runtime=rt)
    )
    calls = rt._client.escrow.calls
    assert calls[0] == ("accept", "e1", rt.address)
    assert calls[1][0] == "deliver" and calls[1][2] == {
        "actor": rt.address,
        "description": "done",
        "refs": ["r1"],
    }
    assert calls[2] == ("accept_delivery", "e1", rt.address, "sig")


def test_deliver_escrow_validation(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    assert json.loads(tools.deliver_escrow({"escrow_id": "e1"}, runtime=rt))["ok"] is False
    assert json.loads(tools.accept_escrow({}, runtime=rt))["ok"] is False


def test_buy_product_settles_on_chain_when_configured(tmp_path, monkeypatch):
    monkeypatch.setenv("TINYPLACE_SOLANA_NETWORK", "devnet")
    monkeypatch.setenv("TINYPLACE_SOLANA_RPC_URL", "https://rpc.example.test")
    rt = _make_runtime(tmp_path, monkeypatch)

    out = json.loads(tools.buy_product({"product_id": "prod1"}, runtime=rt))
    assert out["ok"] is True
    assert out["onChainTx"] == "onchain-sig"
    assert out["purchase"]["purchaseId"] == "pur1"
    product_id, request, kwargs = rt._client.marketplace.buy_calls[0]
    assert product_id == "prod1" and request == {"buyer": rt.address}
    assert kwargs["rpc_url"] == "https://rpc.example.test"
    assert isinstance(kwargs["secret_key"], (bytes, bytearray))


def test_buy_product_requires_solana_config(tmp_path, monkeypatch):
    # No TINYPLACE_SOLANA_NETWORK -> can't settle, returns an actionable error.
    monkeypatch.delenv("TINYPLACE_SOLANA_NETWORK", raising=False)
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.buy_product({"product_id": "prod1"}, runtime=rt))
    assert out["ok"] is False and "TINYPLACE_SOLANA_NETWORK" in out["error"]


def test_buy_product_validation(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    assert json.loads(tools.buy_product({}, runtime=rt))["ok"] is False


def test_commerce_errors_clearly_without_sdk_namespace(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    # An SDK that predates the commerce namespaces -> actionable error.
    delattr(rt._client, "jobs")
    out = json.loads(tools.list_jobs({}, runtime=rt))
    assert out["ok"] is False
    assert "AttributeError" not in out["error"]
    assert "jobs" in out["error"]
