"""Async-from-sync runtime: one event loop, one client, one Signal session.

Hermes handlers are synchronous, but the tiny.place SDK is ``aiohttp``-async.
Calling :func:`asyncio.run` per handler would create and tear down a fresh
``aiohttp`` session (and a fresh in-memory ratchet) on every call, dropping
connection reuse and — worse — losing Signal session state mid-conversation.

Instead this module owns a single background thread running ONE dedicated
asyncio event loop, ONE long-lived :class:`~tinyplace.client.TinyPlaceClient`,
and ONE :class:`~tinyplace.signal.session.SignalSession` over a durable
file-backed store. The :meth:`TinyPlaceRuntime.run` helper submits a coroutine
to that loop and blocks for the result, so sync handlers can drive the async
SDK while the client/session/ratchet persist across calls.

The runtime is a thread-safe lazy singleton (:func:`get_runtime`); the first
handler call builds it, later calls reuse it.
"""

from __future__ import annotations

import asyncio
import json
import threading
from concurrent.futures import Future
from pathlib import Path
from typing import Any, Awaitable, TypeVar

import aiohttp

from ._sdk import sdk_import
from .config import PluginConfig, decode_key_material, load_config
from .store import FileSessionStore

TinyPlaceClient = sdk_import("client").TinyPlaceClient
ed25519_seed_to_x25519_keypair = sdk_import("signal.crypto").ed25519_seed_to_x25519_keypair
_keys = sdk_import("signal.keys")
build_pre_keys_request = _keys.build_pre_keys_request
build_signed_pre_key_request = _keys.build_signed_pre_key_request
generate_pre_keys = _keys.generate_pre_keys
generate_signed_pre_key = _keys.generate_signed_pre_key
SignalSession = sdk_import("signal.session").SignalSession
StoreKeyPair = sdk_import("signal.store").X25519KeyPair
LocalSigner = sdk_import("signer").LocalSigner


def _import_group_key_manager() -> Any:
    """The SDK's GroupKeyManager, or ``None`` if this SDK predates group messaging."""
    try:
        return sdk_import("messaging").GroupKeyManager
    except Exception:  # noqa: BLE001 - older SDK without the messaging module
        return None

T = TypeVar("T")

_CURSOR_FILE = "inbox_cursor.json"
_SESSION_FILE = "signal_session.json"
_KEYS_PUBLISHED_FILE = "keys_published.json"
_DEFAULT_PRE_KEY_COUNT = 20


def build_signer(agent_key: str) -> LocalSigner:
    """Build a :class:`LocalSigner` from configured key material.

    Accepts a 32-byte Ed25519 seed or a 64-byte Solana secret key (base58 or
    base64 encoded). The key never leaves this process and is never logged.
    """
    secret = decode_key_material(agent_key)
    if len(secret) == 64:
        return LocalSigner.from_solana_secret_key(secret)
    return LocalSigner.from_seed(secret)


class TinyPlaceRuntime:
    """Owns the dedicated event loop, client and Signal session."""

    def __init__(self, config: PluginConfig) -> None:
        self._config = config
        self._signer = build_signer(config.agent_key)
        # Derive the long-term X25519 identity key pair from the Ed25519 seed so
        # the agent's messaging identity is deterministic across restarts.
        seed = decode_key_material(config.agent_key)[:32]
        crypto_kp = ed25519_seed_to_x25519_keypair(seed)
        identity_kp = StoreKeyPair(
            public_key=crypto_kp.public_key, private_key=crypto_kp.private_key
        )
        config.state_dir.mkdir(parents=True, exist_ok=True)
        self._store = FileSessionStore(config.state_dir / _SESSION_FILE, identity_kp)
        self._cursor_path = config.state_dir / _CURSOR_FILE
        self._keys_published_path = config.state_dir / _KEYS_PUBLISHED_FILE

        # The agent's messaging address is its base58 cryptoId (== signer.agent_id),
        # used as the mailbox key, the /keys path id, and the sender/recipient
        # address in envelopes. The cryptoId is URL-safe; the base64 public key
        # would carry '/' and '=' that break the relay's signed-write auth on
        # path/query-addressed routes (e.g. PUT /keys/{id}/signed-prekey).
        self.address = self._signer.agent_id

        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._run_loop, name="tinyplace-runtime", daemon=True
        )
        self._thread.start()

        self._client: TinyPlaceClient | None = None
        self._session: SignalSession | None = None
        self._keys_ready = False
        self._async_lock: asyncio.Lock | None = None
        # Session-local group sender keys (own sending keys + installed receiver
        # keys), built lazily so the plugin still loads on an SDK that predates
        # group messaging. Not persisted, mirroring the TS GroupKeyManager.
        self._group_keys: Any = None

    def _run_loop(self) -> None:
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def run(self, coro: Awaitable[T]) -> T:
        """Submit ``coro`` to the runtime loop and block for its result."""
        future: Future[T] = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result()

    # --- Lazy async resources (built on the runtime loop) -------------------

    async def _client_session(self) -> tuple[TinyPlaceClient, SignalSession]:
        if self._async_lock is None:
            self._async_lock = asyncio.Lock()
        async with self._async_lock:
            if self._client is None:
                http_session = aiohttp.ClientSession()
                self._client = TinyPlaceClient(
                    base_url=self._config.api_base_url,
                    signer=self._signer,
                    session=http_session,
                )
                identity_kp = await self._store.get_identity_x25519_key_pair()
                self._session = SignalSession(self._store, identity_kp.public_key)
            assert self._session is not None
            return self._client, self._session

    async def get_client(self) -> TinyPlaceClient:
        client, _ = await self._client_session()
        return client

    async def get_session(self) -> SignalSession:
        _, session = await self._client_session()
        return session

    async def ensure_messaging_keys(self) -> None:
        """Bootstrap and publish this agent's prekeys for receiving messages.

        Idempotent and durable. Publication is only treated as complete once a
        ``keys_published.json`` marker is written, which happens **after both**
        the signed-prekey rotation and the one-time-prekey upload succeed. This
        is deliberately decoupled from local key storage: if a previous run
        stored the keys locally but a transient failure aborted publication, the
        marker is absent, so this run re-publishes the **same** stored keys
        (keeping the server bundle consistent with our local private keys)
        rather than skipping forever and leaving peers unable to message us.
        """
        client, _ = await self._client_session()
        # Only skip when keys were published for the CURRENT address. An install
        # that published under a previous address (e.g. the old base64 form) must
        # re-publish under the new one, or peers fetching /keys/<address>/bundle
        # find nothing and cannot start an X3DH session.
        if self._keys_ready or self._published_address() == self.address:
            self._keys_ready = True
            return

        if self._store.has_active_signed_pre_key():
            # Local keys exist from an earlier run whose publication did not
            # complete — reuse and re-publish them.
            signed_pre_key = await self._store.get_active_signed_pre_key()
            pre_keys = await self._store.get_all_pre_keys()
        else:
            signed_pre_key = await generate_signed_pre_key(self._signer, "spk_1")
            pre_keys = await generate_pre_keys(self._signer, 1, _DEFAULT_PRE_KEY_COUNT)
            await self._store.store_signed_pre_key(signed_pre_key)
            for pre_key in pre_keys:
                await self._store.store_pre_key(pre_key)

        identity_key = self._signer.public_key_base64
        await client.keys.rotate_signed_pre_key(
            self.address,
            build_signed_pre_key_request(signed_pre_key, identity_key),
        )
        if pre_keys:
            await client.keys.upload_pre_keys(
                self.address,
                build_pre_keys_request(pre_keys, identity_key),
            )
        # Only now — after both server calls succeeded — record publication,
        # tagged with the address it was published under (so a later address
        # change forces a re-publish).
        self._keys_published_path.parent.mkdir(parents=True, exist_ok=True)
        self._keys_published_path.write_text(
            json.dumps({"published": True, "address": self.address}), "utf-8"
        )
        self._keys_ready = True

    def _published_address(self) -> str | None:
        """Return the address the prekeys were last published under, if any."""
        try:
            data = json.loads(self._keys_published_path.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        if isinstance(data, dict) and data.get("published"):
            address = data.get("address")
            return address if isinstance(address, str) else None
        return None

    def payment_settlement(self) -> dict[str, Any] | None:
        """On-chain x402 settlement params for paid actions, or ``None``.

        Returns the Solana RPC URL, the agent's secret key (for signing the
        on-chain transfer), the optional USDC mint override and the network
        label — but only when a network + RPC are configured. ``None`` means
        paid actions should surface their 402 challenge instead of settling.
        """
        if not self._config.can_settle_payments:
            return None
        return {
            "rpc_url": self._config.solana_rpc_url,
            "secret_key": decode_key_material(self._config.agent_key),
            "mint": self._config.usdc_mint,
            "network": self._config.solana_network,
        }

    def maybe_group_keys(self) -> Any:
        """The session's GroupKeyManager, or ``None`` if the SDK lacks group messaging."""
        if self._group_keys is None:
            manager_cls = _import_group_key_manager()
            if manager_cls is None:
                return None
            self._group_keys = manager_cls()
        return self._group_keys

    @property
    def group_keys(self) -> Any:
        """The session's GroupKeyManager, raising a clear error if unavailable."""
        keys = self.maybe_group_keys()
        if keys is None:
            raise RuntimeError(
                "group messaging needs a tiny.place Python SDK that provides the "
                "'messaging' module; upgrade the installed SDK."
            )
        return keys

    # --- Cursor persistence -------------------------------------------------

    def read_cursor(self) -> str | None:
        try:
            data = json.loads(self._cursor_path.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        cursor = data.get("cursor")
        return cursor if isinstance(cursor, str) else None

    def write_cursor(self, cursor: str | None) -> None:
        if cursor is None:
            return
        self._cursor_path.parent.mkdir(parents=True, exist_ok=True)
        self._cursor_path.write_text(
            json.dumps({"cursor": cursor}), encoding="utf-8"
        )


_runtime_lock = threading.Lock()
_runtime: TinyPlaceRuntime | None = None


def get_runtime() -> TinyPlaceRuntime:
    """Return the process-wide runtime singleton, building it on first use."""
    global _runtime
    if _runtime is None:
        with _runtime_lock:
            if _runtime is None:
                _runtime = load_runtime()
    return _runtime


def load_runtime(config: PluginConfig | None = None) -> TinyPlaceRuntime:
    """Build a runtime from ``config`` (or the environment). For tests/wiring."""
    return TinyPlaceRuntime(config or load_config())


def reset_runtime_for_tests(runtime: TinyPlaceRuntime | None) -> None:
    """Replace the singleton (tests only). ``None`` clears it."""
    global _runtime
    with _runtime_lock:
        _runtime = runtime
