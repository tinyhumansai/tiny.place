"""Sender Keys (group messaging) for the tiny.place Signal Protocol port.

A byte-compatible Python port of the TypeScript SDK's
``sdk/typescript/src/signal/sender-key.ts``. Implements both halves of the
Signal Sender Key construction used for efficient group messaging:

* :class:`GroupSenderKey` — the **sending** half. A symmetric chain key
  ratcheted once per message (via :func:`~tinyplace.signal.crypto.kdf_chain_key`)
  plus an Ed25519 signing key pair that signs every ciphertext so receivers can
  attribute it to this sender. One instance per (group, sender, membership
  epoch); a membership change means a fresh key (rotation).
* :class:`GroupSenderKeyReceiver` — the **receiving** half. Holds another
  member's chain key and their Ed25519 signature public key, derived from a
  :class:`SenderKeyDistribution`. Verifies the signature first, then decrypts,
  tolerating out-of-order delivery by caching skipped message keys (capped at
  :data:`MAX_SKIP`).

Both halves persist through the store's
:class:`~tinyplace.signal.store.SenderKeyState` record (own = has a
``signing_private_key``; receiver = ``signing_public_key`` + ``skipped_keys``).

Every algorithmic choice mirrors the reference so a group message produced by
one SDK can be consumed by the other:

* Chain ratchet: HMAC-SHA256 (:func:`~tinyplace.signal.crypto.kdf_chain_key`).
* Message AEAD: AES-256-CBC + HMAC-SHA256 with **empty** associated data
  (:func:`~tinyplace.signal.crypto.encrypt`); the Ed25519 signature over the
  raw ciphertext bytes authenticates the sender.

The crypto primitives are reused verbatim from
:mod:`tinyplace.signal.crypto`; this module never reimplements crypto.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from .crypto import (
    decrypt,
    ed25519_keypair_from_seed,
    ed25519_sign,
    ed25519_verify,
    encrypt,
    from_base64,
    kdf_chain_key,
    to_base64,
)
from .store import SenderKeyState

__all__ = [
    "MAX_SKIP",
    "SenderKeyDistribution",
    "SenderKeyMessage",
    "GroupSenderKey",
    "GroupSenderKeyReceiver",
]

# Cap on how far a receiver will fast-forward to reach an out-of-order message.
# Mirrors ``MAX_SKIP`` in sender-key.ts.
MAX_SKIP = 2000

# Group sender-key messages carry no extra associated data; the Ed25519
# signature authenticates the sender. Mirrors ``EMPTY_AD`` in sender-key.ts.
_EMPTY_AD = b""


@dataclass
class SenderKeyDistribution:
    """Public, distributable snapshot of a sender's group key.

    This is what a sender shares — over an already-secure 1:1 channel — so other
    members can decrypt its group messages. It exposes the chain key at a single
    iteration; a receiver initialised from it can read messages from that
    iteration forward (earlier messages stay secret, by forward secrecy).

    Mirrors the TypeScript ``SenderKeyDistribution`` interface (base64 fields).
    """

    chain_key: str
    iteration: int
    signature_public_key: str


@dataclass
class SenderKeyMessage:
    """A single encrypted group message produced by a :class:`GroupSenderKey`.

    Mirrors the TypeScript ``SenderKeyMessage`` interface (base64 fields).
    """

    iteration: int
    ciphertext: str
    signature: str


class GroupSenderKey:
    """The sending half of a Signal Sender Key.

    A symmetric chain key ratcheted once per message, plus an Ed25519 key pair
    that signs every message so receivers can attribute it to this sender. One
    instance per (group, sender, membership epoch); a new epoch (membership
    change) means a fresh key.
    """

    def __init__(
        self,
        chain_key: bytes,
        iteration: int,
        signing_seed: bytes,
        signing_public_key: bytes,
    ) -> None:
        self._chain_key = chain_key
        self._iteration = iteration
        # 32-byte Ed25519 seed (libsodium "secret key" produced by
        # ``randomSecretKey()`` in the reference). ``ed25519_sign`` accepts the
        # seed directly.
        self._signing_seed = signing_seed
        self._signing_public_key = signing_public_key

    @classmethod
    def create(cls) -> GroupSenderKey:
        """Generate a brand-new sender key with a random chain key and signing pair."""
        chain_key = os.urandom(32)
        signing_seed = os.urandom(32)
        signing_public_key, _secret = ed25519_keypair_from_seed(signing_seed)
        return cls(chain_key, 0, signing_seed, signing_public_key)

    @classmethod
    def restore(cls, state: SenderKeyState) -> GroupSenderKey:
        """Rebuild a sender key from a :class:`SenderKeyState` (own half).

        Raises:
            ValueError: if ``state`` carries no ``signing_private_key`` (i.e. it
                is a receiver record, which cannot sign).
        """
        if state.signing_private_key is None:
            raise ValueError("SenderKeyState has no signing_private_key (not an own key)")
        return cls(
            state.chain_key,
            state.iteration,
            state.signing_private_key,
            state.signing_public_key,
        )

    @property
    def current_iteration(self) -> int:
        """The current message number (advances after each :meth:`encrypt`)."""
        return self._iteration

    def serialize(self, distribution_id: str) -> SenderKeyState:
        """Persistable snapshot including the private signing seed. Keep secret."""
        return SenderKeyState(
            distribution_id=distribution_id,
            chain_key=self._chain_key,
            iteration=self._iteration,
            signing_public_key=self._signing_public_key,
            signing_private_key=self._signing_seed,
        )

    def distribution(self) -> SenderKeyDistribution:
        """Snapshot to hand to other members so they can decrypt from here forward."""
        return SenderKeyDistribution(
            chain_key=to_base64(self._chain_key),
            iteration=self._iteration,
            signature_public_key=to_base64(self._signing_public_key),
        )

    def encrypt(self, plaintext: bytes) -> SenderKeyMessage:
        """Encrypt and sign one group message, ratcheting the chain forward."""
        iteration = self._iteration
        chain_key, message_key = kdf_chain_key(self._chain_key)
        ciphertext = encrypt(message_key, plaintext, _EMPTY_AD)
        signature = ed25519_sign(self._signing_seed, ciphertext)
        self._chain_key = chain_key
        self._iteration = iteration + 1
        return SenderKeyMessage(
            iteration=iteration,
            ciphertext=to_base64(ciphertext),
            signature=to_base64(signature),
        )


class GroupSenderKeyReceiver:
    """The receiving half of a Sender Key.

    Holds another member's chain key and their signature public key, derived
    from a :class:`SenderKeyDistribution`. Verifies and decrypts that sender's
    group messages, tolerating out-of-order delivery by caching skipped message
    keys.
    """

    def __init__(
        self,
        chain_key: bytes,
        iteration: int,
        signing_public_key: bytes,
        skipped: dict[int, bytes] | None = None,
    ) -> None:
        self._chain_key = chain_key
        self._iteration = iteration
        self._signing_public_key = signing_public_key
        self._skipped: dict[int, bytes] = skipped if skipped is not None else {}

    @classmethod
    def from_distribution(
        cls, distribution: SenderKeyDistribution
    ) -> GroupSenderKeyReceiver:
        """Initialise a receiver from a sender's distribution snapshot."""
        return cls(
            from_base64(distribution.chain_key),
            distribution.iteration,
            from_base64(distribution.signature_public_key),
            {},
        )

    @classmethod
    def restore(cls, state: SenderKeyState) -> GroupSenderKeyReceiver:
        """Rebuild a receiver from a :class:`SenderKeyState` (receiver half)."""
        return cls(
            state.chain_key,
            state.iteration,
            state.signing_public_key,
            dict(state.skipped_keys),
        )

    def serialize(self, distribution_id: str) -> SenderKeyState:
        """Persistable snapshot of the receiver chain and any cached skipped keys."""
        return SenderKeyState(
            distribution_id=distribution_id,
            chain_key=self._chain_key,
            iteration=self._iteration,
            signing_public_key=self._signing_public_key,
            signing_private_key=None,
            skipped_keys=dict(self._skipped),
        )

    def decrypt(self, message: SenderKeyMessage) -> bytes:
        """Verify the signature, then decrypt the message at its iteration."""
        ciphertext = from_base64(message.ciphertext)
        signature = from_base64(message.signature)
        if not ed25519_verify(self._signing_public_key, ciphertext, signature):
            raise ValueError("Sender key signature verification failed")
        message_key = self._message_key_for(message.iteration)
        return decrypt(message_key, ciphertext, _EMPTY_AD)

    def _message_key_for(self, target: int) -> bytes:
        """Return the message key for ``target``, advancing the chain and caching
        keys for any skipped (not-yet-seen) iterations along the way.
        """
        cached = self._skipped.pop(target, None)
        if cached is not None:
            return cached
        if target < self._iteration:
            raise ValueError("Sender key message is older than the current chain")
        if target - self._iteration > MAX_SKIP:
            raise ValueError("Too many skipped sender key messages")
        while self._iteration < target:
            chain_key, message_key = kdf_chain_key(self._chain_key)
            self._skipped[self._iteration] = message_key
            self._chain_key = chain_key
            self._iteration += 1
        chain_key, message_key = kdf_chain_key(self._chain_key)
        self._chain_key = chain_key
        self._iteration += 1
        return message_key
