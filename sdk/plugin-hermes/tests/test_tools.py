"""Handler success + error paths, returning valid JSON strings.

These tests never touch a live backend: a fake ``TinyPlaceClient`` + Signal
session is injected into a real :class:`TinyPlaceRuntime` (so the dedicated
event loop / ``run`` helper is exercised), and handlers are driven via the
``runtime=`` kwarg.
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path

import pytest

from conftest import config as cfg
from conftest import runtime as runtime_mod
from conftest import tools

# A deterministic 32-byte Ed25519 seed, base64 — valid TINYPLACE_AGENT_KEY.
_SEED = base64.b64encode(bytes(range(32))).decode("ascii")


# --- fakes ------------------------------------------------------------------


class _FakeMessages:
    def __init__(self) -> None:
        self.sent: list[dict] = []
        self._decrypted: list = []
        self.poll_error: Exception | None = None

    async def send_encrypted(self, session, from_address, to_address, plaintext, **_):
        self.sent.append(
            {"from": from_address, "to": to_address, "text": plaintext.decode()}
        )
        return {"id": "msg_1", "status": "sent"}

    async def poll_inbox_decrypted(self, session, agent_id, **_):
        if self.poll_error is not None:
            raise self.poll_error
        return list(self._decrypted)


class _Msg:
    def __init__(self, id, sender, plaintext, timestamp):
        self.id = id
        self.sender = sender
        self.plaintext = plaintext
        self.timestamp = timestamp


class _FakeClient:
    def __init__(self) -> None:
        self.messages = _FakeMessages()
        self.search_result = {"name": "@alice", "available": True, "record": {}}
        self.register_result = {"username": "@alice", "status": "registered"}
        self.identity_result = {"handle": "@me", "cryptoId": "abc"}
        self.register_error: Exception | None = None
        self.resolve_result: dict = {
            "agentCard": {"metadata": {"encryptionPublicKey": "PEER_ADDR=="}}
        }

    async def search_domain(self, query):
        return {**self.search_result, "name": query}

    async def register_domain(self, domain, **fields):
        if self.register_error is not None:
            raise self.register_error
        return {**self.register_result, "username": domain, "fields": fields}

    async def get_identity(self):
        return self.identity_result

    async def resolve_user(self, handle):
        return self.resolve_result


def _make_runtime(tmp_path: Path, monkeypatch) -> "runtime_mod.TinyPlaceRuntime":
    monkeypatch.setenv(cfg.ENV_AGENT_KEY, _SEED)
    monkeypatch.setenv(cfg.ENV_STATE_DIR, str(tmp_path))
    rt = runtime_mod.load_runtime()
    # Inject the fake client/session so no network or key bootstrap happens.
    rt._client = _FakeClient()
    rt._session = object()
    rt._keys_ready = True
    return rt


# --- tests ------------------------------------------------------------------


def test_get_identity_success(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.get_identity({}, runtime=rt))
    assert out["ok"] is True
    assert out["identity"]["handle"] == "@me"
    assert out["address"] == rt.address


def test_search_domain_success_and_validation(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(tools.search_domain({"query": "@alice"}, runtime=rt))
    assert out["ok"] is True and out["name"] == "@alice" and out["available"] is True

    err = json.loads(tools.search_domain({}, runtime=rt))
    assert err["ok"] is False and "query" in err["error"]


def test_register_domain_success(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(
        tools.register_domain({"domain": "@alice", "actor_type": "agent"}, runtime=rt)
    )
    assert out["ok"] is True
    assert out["record"]["fields"] == {"actorType": "agent"}


def test_register_domain_payment_required(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    http = runtime_mod.sdk_import("http")
    challenge = http.PaymentRequiredChallenge(
        error="payment required", payment={"amount": "100", "asset": "USDC"}
    )
    rt._client.register_error = http.TinyPlaceError(
        402, {"error": "payment required"}, "HTTP 402", payment_required=challenge
    )
    out = json.loads(tools.register_domain({"domain": "@paid"}, runtime=rt))
    assert out["ok"] is False
    assert out["status"] == 402
    assert out["payment_required"]["payment"]["amount"] == "100"
    assert "x402" in out["hint"]
    # No Solana network configured -> the challenge is surfaced, not settled.
    assert "settled" not in out


def test_register_domain_auto_settles_when_solana_configured(tmp_path, monkeypatch):
    monkeypatch.setenv("TINYPLACE_SOLANA_NETWORK", "devnet")
    monkeypatch.setenv("TINYPLACE_SOLANA_RPC_URL", "https://rpc.example.test")
    monkeypatch.setenv("TINYPLACE_SOLANA_USDC_MINT", "DevnetUsdcMint11111111111111111111111111111")
    rt = _make_runtime(tmp_path, monkeypatch)

    captured: dict = {}

    async def fake_paid(domain, **kwargs):
        captured["domain"] = domain
        captured["kwargs"] = kwargs
        return {"identity": {"username": domain}, "onChainTx": "onchain-sig", "payment": {}}

    rt._client.register_domain_with_solana_payment = fake_paid

    out = json.loads(tools.register_domain({"domain": "@paid"}, runtime=rt))
    assert out["ok"] is True
    assert out["settled"] is True
    assert out["record"]["onChainTx"] == "onchain-sig"
    # The runtime handed the SDK the configured RPC/mint/network + a secret key.
    assert captured["domain"] == "@paid"
    assert captured["kwargs"]["rpc_url"] == "https://rpc.example.test"
    assert captured["kwargs"]["network"] == "devnet"
    assert captured["kwargs"]["mint"] == "DevnetUsdcMint11111111111111111111111111111"
    assert isinstance(captured["kwargs"]["secret_key"], (bytes, bytearray))


def test_register_domain_auto_settle_without_sdk_support_errors_clearly(tmp_path, monkeypatch):
    monkeypatch.setenv("TINYPLACE_SOLANA_NETWORK", "devnet")
    monkeypatch.setenv("TINYPLACE_SOLANA_RPC_URL", "https://rpc.example.test")
    rt = _make_runtime(tmp_path, monkeypatch)
    # The fake client has no register_domain_with_solana_payment (an SDK that
    # predates on-chain settlement) -> actionable error, not a raw AttributeError.
    assert not hasattr(rt._client, "register_domain_with_solana_payment")

    out = json.loads(tools.register_domain({"domain": "@paid"}, runtime=rt))
    assert out["ok"] is False
    assert "AttributeError" not in out["error"]
    assert "register_domain_with_solana_payment" in out["error"]


def test_poll_inbox_returns_every_decrypted_message(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    rt._client.messages._decrypted = [
        _Msg(f"m{i}", "peer", f"msg{i}".encode(), f"2026-01-0{i}T00:00:00Z")
        for i in range(1, 5)
    ]
    # poll_inbox_decrypted already acknowledged the whole mailbox and the ratchet
    # consumed each message once, so a stray `limit` must NOT drop any — dropping
    # an acknowledged message would lose it permanently.
    out = json.loads(tools.poll_inbox({"limit": 1}, runtime=rt))
    assert out["ok"] is True
    assert out["count"] == 4
    assert [m["id"] for m in out["messages"]] == ["m1", "m2", "m3", "m4"]


def test_send_message_success(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    out = json.loads(
        tools.send_message({"to": "@alice", "message": "hello"}, runtime=rt)
    )
    assert out["ok"] is True
    assert out["address"] == "PEER_ADDR=="
    assert rt._client.messages.sent[0]["text"] == "hello"


def test_send_message_to_raw_address(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    raw = base64.b64encode(bytes(range(32))).decode("ascii")
    out = json.loads(tools.send_message({"to": raw, "message": "hi"}, runtime=rt))
    assert out["ok"] is True
    # raw 32-byte base64 used as-is, no directory resolution
    assert out["address"] == raw


def test_send_message_validation(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    assert json.loads(tools.send_message({"message": "x"}, runtime=rt))["ok"] is False
    assert json.loads(tools.send_message({"to": "@a"}, runtime=rt))["ok"] is False


def test_poll_inbox_returns_new_messages(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    rt._client.messages._decrypted = [
        _Msg("m1", "peerA", b"first", "2026-01-01T00:00:00Z"),
        _Msg("m2", "peerB", b"second", "2026-01-02T00:00:00Z"),
    ]
    out = json.loads(tools.poll_inbox({}, runtime=rt))
    assert out["ok"] is True and out["count"] == 2
    assert [m["text"] for m in out["messages"]] == ["first", "second"]


def test_poll_inbox_error_path(tmp_path, monkeypatch):
    rt = _make_runtime(tmp_path, monkeypatch)
    rt._client.messages.poll_error = RuntimeError("relay down")
    out = json.loads(tools.poll_inbox({}, runtime=rt))
    assert out["ok"] is False and "relay down" in out["error"]


def test_handler_never_raises_on_missing_config(tmp_path, monkeypatch):
    # No runtime injected and no env -> handler returns config error JSON.
    monkeypatch.delenv(cfg.ENV_AGENT_KEY, raising=False)
    runtime_mod.reset_runtime_for_tests(None)
    out = json.loads(tools.get_identity({}))
    assert out["ok"] is False and "not configured" in out["error"]
