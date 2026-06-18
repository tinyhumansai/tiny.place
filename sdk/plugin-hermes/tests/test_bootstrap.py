"""Prekey publication is retried until it fully succeeds.

Regression for the bug where keys stored locally but never published (a
transient failure during rotate/upload) would be skipped forever, leaving the
agent with local Signal keys but no server bundle for peers to fetch.
"""

from __future__ import annotations

import base64
import json

import pytest

from conftest import config as cfg
from conftest import runtime as runtime_mod

_SEED = base64.b64encode(bytes(range(32))).decode("ascii")


class _FakeKeys:
    def __init__(self) -> None:
        self.rotate_calls = 0
        self.upload_calls = 0
        self.fail_rotate = False

    async def rotate_signed_pre_key(self, address, request) -> None:
        self.rotate_calls += 1
        if self.fail_rotate:
            raise RuntimeError("transient publish failure")

    async def upload_pre_keys(self, address, request) -> None:
        self.upload_calls += 1


class _FakeClient:
    def __init__(self, keys: _FakeKeys) -> None:
        self.keys = keys


def test_bootstrap_retries_publication_until_it_succeeds(tmp_path, monkeypatch):
    monkeypatch.setenv(cfg.ENV_AGENT_KEY, _SEED)
    monkeypatch.setenv(cfg.ENV_STATE_DIR, str(tmp_path))
    rt = runtime_mod.load_runtime()
    keys = _FakeKeys()
    keys.fail_rotate = True
    rt._client = _FakeClient(keys)
    rt._session = object()

    # First attempt fails mid-publication.
    with pytest.raises(RuntimeError):
        rt.run(rt.ensure_messaging_keys())

    # Keys were stored locally, but publication is NOT marked complete — so a
    # peer fetching our bundle would find nothing yet.
    assert rt._store.has_active_signed_pre_key()
    assert not rt._keys_published_path.exists()
    assert rt._keys_ready is False

    # Recovery run: publication now succeeds and re-publishes the SAME stored
    # keys (no regeneration), then records the published marker.
    keys.fail_rotate = False
    rt.run(rt.ensure_messaging_keys())

    assert rt._keys_published_path.exists()
    assert rt._keys_ready is True
    assert keys.rotate_calls == 2  # retried after the first failure
    assert keys.upload_calls == 1  # only ran once publication got past rotate

    # A subsequent run is a no-op now that the marker exists for this address.
    rt.run(rt.ensure_messaging_keys())
    assert keys.rotate_calls == 2


def test_republishes_when_address_changes(tmp_path, monkeypatch):
    # A marker left by a previous run under a DIFFERENT address (e.g. the old
    # base64 form) must not suppress publication under the current address.
    monkeypatch.setenv(cfg.ENV_AGENT_KEY, _SEED)
    monkeypatch.setenv(cfg.ENV_STATE_DIR, str(tmp_path))
    rt = runtime_mod.load_runtime()
    keys = _FakeKeys()
    rt._client = _FakeClient(keys)
    rt._session = object()

    # Simulate a stale marker written under a now-defunct address.
    rt._keys_published_path.parent.mkdir(parents=True, exist_ok=True)
    rt._keys_published_path.write_text(
        json.dumps({"published": True, "address": "OLD_BASE64_ADDRESS"}), "utf-8"
    )

    rt.run(rt.ensure_messaging_keys())

    # It re-published under the current address and rewrote the marker.
    assert keys.rotate_calls == 1
    assert json.loads(rt._keys_published_path.read_text())["address"] == rt.address

    # Now it's a no-op for the current address.
    rt.run(rt.ensure_messaging_keys())
    assert keys.rotate_calls == 1
