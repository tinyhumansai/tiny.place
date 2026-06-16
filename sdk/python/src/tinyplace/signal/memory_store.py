"""In-memory implementation of :class:`SessionStore`.

Mirrors ``sdk/typescript/src/signal/memory-store.ts``. Holds all session
material in process-local dicts; nothing is persisted across restarts. Useful
for tests and short-lived agents. A durable backend (e.g. Hermes) implements
the same :class:`~tinyplace.signal.store.SessionStore` contract.
"""

from __future__ import annotations

from copy import deepcopy

from .store import (
    PreKeyPair,
    SenderKeyState,
    SessionState,
    SessionStore,
    SignedPreKeyPair,
    X25519KeyPair,
)


class MemorySessionStore(SessionStore):
    """A non-durable, in-process :class:`SessionStore`."""

    def __init__(self, identity_key_pair: X25519KeyPair) -> None:
        # deepcopy on store/get so callers can never mutate in-store state by
        # holding a reference — matching how a durable (serializing) backend
        # behaves.
        self._identity_key_pair = deepcopy(identity_key_pair)
        self._signed_pre_keys: dict[str, SignedPreKeyPair] = {}
        self._pre_keys: dict[str, PreKeyPair] = {}
        self._sessions: dict[str, SessionState] = {}
        self._sender_keys: dict[str, SenderKeyState] = {}
        self._active_signed_pre_key_id: str | None = None

    # --- Identity -----------------------------------------------------------

    async def get_identity_x25519_key_pair(self) -> X25519KeyPair:
        return deepcopy(self._identity_key_pair)

    # --- Signed pre-keys ----------------------------------------------------

    async def get_signed_pre_key(self, key_id: str) -> SignedPreKeyPair | None:
        return deepcopy(self._signed_pre_keys.get(key_id))

    async def get_active_signed_pre_key(self) -> SignedPreKeyPair:
        if self._active_signed_pre_key_id is None:
            raise LookupError("No active signed pre-key")
        key = self._signed_pre_keys.get(self._active_signed_pre_key_id)
        if key is None:
            raise LookupError("Active signed pre-key not found")
        return deepcopy(key)

    async def store_signed_pre_key(self, pre_key: SignedPreKeyPair) -> None:
        self._signed_pre_keys[pre_key.key_id] = deepcopy(pre_key)
        self._active_signed_pre_key_id = pre_key.key_id

    # --- One-time pre-keys --------------------------------------------------

    async def get_pre_key(self, key_id: str) -> PreKeyPair | None:
        return deepcopy(self._pre_keys.get(key_id))

    async def store_pre_key(self, pre_key: PreKeyPair) -> None:
        self._pre_keys[pre_key.key_id] = deepcopy(pre_key)

    async def remove_pre_key(self, key_id: str) -> None:
        self._pre_keys.pop(key_id, None)

    async def get_all_pre_keys(self) -> list[PreKeyPair]:
        return [deepcopy(pre_key) for pre_key in self._pre_keys.values()]

    # --- Sessions -----------------------------------------------------------

    async def get_session(self, address: str) -> SessionState | None:
        return deepcopy(self._sessions.get(address))

    async def store_session(self, address: str, session: SessionState) -> None:
        self._sessions[address] = deepcopy(session)

    async def remove_session(self, address: str) -> None:
        self._sessions.pop(address, None)

    # --- Sender keys (groups) ----------------------------------------------

    async def get_sender_key(self, distribution_id: str) -> SenderKeyState | None:
        return deepcopy(self._sender_keys.get(distribution_id))

    async def store_sender_key(self, sender_key: SenderKeyState) -> None:
        self._sender_keys[sender_key.distribution_id] = deepcopy(sender_key)

    async def remove_sender_key(self, distribution_id: str) -> None:
        self._sender_keys.pop(distribution_id, None)
