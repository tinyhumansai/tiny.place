"""Key material and prekey-bundle dataclasses for the Signal port.

These mirror the TypeScript SDK's ``signal`` key types (``X25519KeyPair``,
``PreKeyPair``, ``SignedPreKeyPair``) and the backend wire shape
(``models.SignedKey`` / ``models.KeyBundle``).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class X25519KeyPair:
    """An X25519 (Curve25519) key pair used for Diffie-Hellman agreement."""

    public_key: bytes
    private_key: bytes


@dataclass(frozen=True)
class PreKeyPair:
    """A one-time pre-key: an X25519 key pair plus its identity signature."""

    key_id: str
    key_pair: X25519KeyPair
    signature: bytes


@dataclass(frozen=True)
class SignedPreKeyPair:
    """A signed pre-key: an X25519 key pair plus its identity signature."""

    key_id: str
    key_pair: X25519KeyPair
    signature: bytes
