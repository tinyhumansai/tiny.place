"""Signal Protocol support for the tiny.place Python SDK.

A complete, byte-compatible port of the flagship TypeScript SDK's Signal stack
(``sdk/typescript/src/signal/``). The Python SDK now has full Signal end-to-end
parity: crypto primitives (:mod:`tinyplace.signal.crypto`), key management /
prekey bundles (:mod:`tinyplace.signal.keys`), the session-store contract with
an in-memory implementation (:mod:`tinyplace.signal.store` /
:mod:`tinyplace.signal.memory_store`), X3DH key agreement
(:mod:`tinyplace.signal.x3dh`), the Double Ratchet
(:mod:`tinyplace.signal.ratchet`), Sender Keys for group messaging
(:mod:`tinyplace.signal.sender_key`), and the 1:1 session layer that ties them
together (:mod:`tinyplace.signal.session`).

Cross-language interop with the TypeScript SDK is verified by
``tests/test_signal_interop.py`` against vectors generated from the real TS
implementation (see ``tests/vectors/gen_signal_vectors.mjs``).

Note: ``crypto``, ``types`` and ``store`` each define identical
``X25519KeyPair`` (and ``PreKeyPair`` / ``SignedPreKeyPair``) dataclasses; the
package re-exports the ``types`` ones.
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
from .sender_key import (
    GroupSenderKey,
    GroupSenderKeyReceiver,
    SenderKeyDistribution,
    SenderKeyMessage,
)
from .ratchet import (
    MAX_SKIP,
    RatchetHeader,
    RatchetMessage,
    encode_header,
    ratchet_decrypt,
    ratchet_encrypt,
)
from .session import EncryptedMessage, SignalSession, parse_key_bundle
from .store import SenderKeyState, SessionState, SessionStore, skipped_key_id
from .types import PreKeyPair, SignedPreKeyPair, X25519KeyPair
from .x3dh import (
    X3DHBundle,
    X3DHInitResult,
    build_associated_data,
    verify_pre_key_signature_raw,
    x3dh_initiate,
    x3dh_respond,
)

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
    # X3DH key agreement
    "X3DHBundle",
    "X3DHInitResult",
    "x3dh_initiate",
    "x3dh_respond",
    "build_associated_data",
    "verify_pre_key_signature_raw",
    # double ratchet
    "MAX_SKIP",
    "RatchetHeader",
    "RatchetMessage",
    "encode_header",
    "ratchet_encrypt",
    "ratchet_decrypt",
    # sender keys (group messaging)
    "GroupSenderKey",
    "GroupSenderKeyReceiver",
    "SenderKeyDistribution",
    "SenderKeyMessage",
    # 1:1 session layer
    "EncryptedMessage",
    "SignalSession",
    "parse_key_bundle",
]
