"""Session-store contract for the Signal Protocol session/ratchet layers.

This mirrors ``sdk/typescript/src/signal/store.ts``. It defines the record
types the session, Double Ratchet and Sender Key layers persist (identity,
sessions, one-time pre-keys, signed pre-keys, sender keys) plus the abstract
:class:`SessionStore` interface that ties them together.

The contract is intentionally storage-agnostic so it can be backed by an
in-memory map (see :mod:`tinyplace.signal.memory_store`) or a durable store
(e.g. Hermes) later. Only the in-memory implementation ships in this slice.

This module is self-contained: it does not import the (in-flight) crypto or
key modules. Key material is represented by the lightweight
:class:`X25519KeyPair` dataclass defined here; later slices may re-export a
richer type, but the field shape (``public_key`` / ``private_key`` bytes)
matches the TypeScript ``X25519KeyPair``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class X25519KeyPair:
    """An X25519 key pair (raw 32-byte public/private keys).

    Mirrors the TypeScript ``X25519KeyPair``. Defined locally so the store
    layer does not depend on the crypto module, which lands in a later slice.
    """

    public_key: bytes
    private_key: bytes


@dataclass
class SessionState:
    """Double Ratchet session state for a single conversation.

    Mirrors the TypeScript ``SessionState`` interface. ``skipped_keys`` maps a
    :func:`skipped_key_id` string to the derived message key bytes for
    out-of-order / skipped messages.
    """

    dh_send_key_pair: X25519KeyPair
    dh_recv_public_key: bytes | None
    root_key: bytes
    send_chain_key: bytes | None
    recv_chain_key: bytes | None
    send_message_number: int
    recv_message_number: int
    previous_chain_length: int
    skipped_keys: dict[str, bytes] = field(default_factory=dict)


@dataclass
class PreKeyPair:
    """A one-time pre-key: its server key id, key pair and signature.

    Mirrors the TypeScript ``PreKeyPair`` interface.
    """

    key_id: str
    key_pair: X25519KeyPair
    signature: bytes


@dataclass
class SignedPreKeyPair:
    """A signed pre-key: its server key id, key pair and signature.

    Mirrors the TypeScript ``SignedPreKeyPair`` interface.
    """

    key_id: str
    key_pair: X25519KeyPair
    signature: bytes


@dataclass
class SenderKeyState:
    """Sender-key state for a group distribution id.

    Persists both halves of the TypeScript sender-key model
    (``SenderKeyOwnState`` / ``SenderKeyReceiverState`` in ``sender-key.ts``).
    Group messages are authenticated with an **Ed25519** signing key (not
    X25519): ``signing_public_key`` is always present so receivers can verify a
    sender's messages, while ``signing_private_key`` is set only for our *own*
    sending key — a receiver never holds a remote sender's private key.
    ``skipped_keys`` caches message keys (by iteration) for out-of-order group
    messages on the receiver side.
    """

    distribution_id: str
    chain_key: bytes
    iteration: int
    signing_public_key: bytes
    signing_private_key: bytes | None = None
    skipped_keys: dict[int, bytes] = field(default_factory=dict)


class SessionStore(ABC):
    """Abstract persistence contract for Signal Protocol session material.

    Covers the four record families the session, ratchet and sender-key
    layers need: the long-term identity key pair, Double Ratchet sessions
    (keyed by peer address), one-time and signed pre-keys (keyed by server key
    id), and group sender keys (keyed by distribution id).

    All methods are async so a durable backend (network / disk) can implement
    the same contract as the in-memory store without changing call sites.
    """

    # --- Identity -----------------------------------------------------------

    @abstractmethod
    async def get_identity_x25519_key_pair(self) -> X25519KeyPair:
        """Return the agent's long-term identity X25519 key pair."""

    # --- Signed pre-keys ----------------------------------------------------

    @abstractmethod
    async def get_signed_pre_key(self, key_id: str) -> SignedPreKeyPair | None:
        """Return the signed pre-key with ``key_id``, or ``None`` if absent."""

    @abstractmethod
    async def get_active_signed_pre_key(self) -> SignedPreKeyPair:
        """Return the currently active signed pre-key.

        Raises:
            LookupError: if no signed pre-key has been stored / activated.
        """

    @abstractmethod
    async def store_signed_pre_key(self, pre_key: SignedPreKeyPair) -> None:
        """Persist ``pre_key`` and make it the active signed pre-key."""

    # --- One-time pre-keys --------------------------------------------------

    @abstractmethod
    async def get_pre_key(self, key_id: str) -> PreKeyPair | None:
        """Return the one-time pre-key with ``key_id``, or ``None``."""

    @abstractmethod
    async def store_pre_key(self, pre_key: PreKeyPair) -> None:
        """Persist a one-time ``pre_key``."""

    @abstractmethod
    async def remove_pre_key(self, key_id: str) -> None:
        """Delete the one-time pre-key with ``key_id`` (no-op if absent)."""

    @abstractmethod
    async def get_all_pre_keys(self) -> list[PreKeyPair]:
        """Return every stored one-time pre-key."""

    # --- Sessions -----------------------------------------------------------

    @abstractmethod
    async def get_session(self, address: str) -> SessionState | None:
        """Return the session for ``address``, or ``None`` if none exists."""

    @abstractmethod
    async def store_session(self, address: str, session: SessionState) -> None:
        """Persist ``session`` for the peer ``address``."""

    @abstractmethod
    async def remove_session(self, address: str) -> None:
        """Delete the session for ``address`` (no-op if absent)."""

    # --- Sender keys (groups) ----------------------------------------------

    @abstractmethod
    async def get_sender_key(self, distribution_id: str) -> SenderKeyState | None:
        """Return the sender-key state for ``distribution_id``, or ``None``."""

    @abstractmethod
    async def store_sender_key(self, sender_key: SenderKeyState) -> None:
        """Persist ``sender_key`` keyed by its distribution id."""

    @abstractmethod
    async def remove_sender_key(self, distribution_id: str) -> None:
        """Delete the sender key for ``distribution_id`` (no-op if absent)."""


def skipped_key_id(ratchet_public_key: bytes, message_number: int) -> str:
    """Build the map key for a skipped/out-of-order message key.

    Mirrors the TypeScript ``skippedKeyId``: lower-case hex of the ratchet
    public key, a colon, then the message number (e.g. ``"00ff:3"``).
    """

    return f"{ratchet_public_key.hex()}:{message_number}"
