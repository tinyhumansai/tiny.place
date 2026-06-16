"""Signal Protocol support for the tiny.place Python SDK.

Ported slice-by-slice from the TypeScript SDK. This package currently provides
crypto primitives (:mod:`tinyplace.signal.crypto`), key management / prekey
bundles (:mod:`tinyplace.signal.keys`), and the session-store contract with an
in-memory implementation (:mod:`tinyplace.signal.store`).

Note: ``crypto``, ``types`` and ``store`` currently each define identical
``X25519KeyPair`` (and ``PreKeyPair`` / ``SignedPreKeyPair``) dataclasses; the
package re-exports the ``types`` ones. Unifying these into a single shared
module is tracked for the X3DH / session-layer slices (#44 / #46).
"""

from __future__ import annotations

from .crypto import (
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
from .keys import (
    build_key_bundle,
    build_pre_keys_request,
    build_signed_pre_key_request,
    generate_pre_keys,
    generate_signed_pre_key,
    generate_x25519_key_pair,
    serialize_pre_key,
    serialize_signed_key,
    verify_pre_key_signature,
)
from .memory_store import MemorySessionStore
from .store import SenderKeyState, SessionState, SessionStore, skipped_key_id
from .types import PreKeyPair, SignedPreKeyPair, X25519KeyPair

__all__ = [
    # key material types
    "PreKeyPair",
    "SignedPreKeyPair",
    "X25519KeyPair",
    # crypto primitives
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
    # key management
    "build_key_bundle",
    "build_pre_keys_request",
    "build_signed_pre_key_request",
    "generate_pre_keys",
    "generate_signed_pre_key",
    "generate_x25519_key_pair",
    "serialize_pre_key",
    "serialize_signed_key",
    "verify_pre_key_signature",
    # session store
    "MemorySessionStore",
    "SenderKeyState",
    "SessionState",
    "SessionStore",
    "skipped_key_id",
]
