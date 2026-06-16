"""Signal Protocol implementation for the tiny.place Python SDK.

A byte-compatible port of the flagship TypeScript SDK's ``src/signal`` modules.
This package currently ships the crypto primitives
(:mod:`tinyplace.signal.crypto`) and the session-store contract with an
in-memory implementation; X3DH, the Double Ratchet, key management and sender
keys land in later slices.

Note: ``crypto`` and ``store`` each currently define an identical
``X25519KeyPair`` dataclass; the package re-exports the crypto one. Unifying the
two into a single shared type is tracked for the session-layer slice (#46).
"""

from __future__ import annotations

from .crypto import (
    X25519KeyPair,
    aes_decrypt,
    aes_encrypt,
    compute_hmac,
    decrypt,
    derive_message_keys,
    ed25519_keypair_from_seed,
    ed25519_pub_to_x25519_pub,
    ed25519_seed_to_x25519_keypair,
    ed25519_seed_to_x25519_private,
    ed25519_sign,
    ed25519_verify,
    encrypt,
    from_base64,
    generate_x25519_keypair,
    hkdf,
    kdf_chain_key,
    kdf_root_key,
    to_base64,
    x25519_shared_secret,
)
from .memory_store import MemorySessionStore
from .store import (
    PreKeyPair,
    SenderKeyState,
    SessionState,
    SessionStore,
    SignedPreKeyPair,
    skipped_key_id,
)

__all__ = [
    # crypto primitives
    "X25519KeyPair",
    "generate_x25519_keypair",
    "x25519_shared_secret",
    "ed25519_seed_to_x25519_private",
    "ed25519_seed_to_x25519_keypair",
    "ed25519_pub_to_x25519_pub",
    "ed25519_keypair_from_seed",
    "ed25519_sign",
    "ed25519_verify",
    "hkdf",
    "kdf_root_key",
    "kdf_chain_key",
    "derive_message_keys",
    "aes_encrypt",
    "aes_decrypt",
    "compute_hmac",
    "encrypt",
    "decrypt",
    "to_base64",
    "from_base64",
    # session store
    "MemorySessionStore",
    "PreKeyPair",
    "SenderKeyState",
    "SessionState",
    "SessionStore",
    "SignedPreKeyPair",
    "skipped_key_id",
]
