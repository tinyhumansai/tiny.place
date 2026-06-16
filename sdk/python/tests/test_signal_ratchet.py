"""Tests for the Signal Double Ratchet port (:mod:`tinyplace.signal.ratchet`).

Covers in-order encrypt/decrypt round-trips, a DH-ratchet (reply) step, and
out-of-order / skipped-message-key delivery, plus a fixed known-answer (KAT)
interop vector that pins the exact ciphertext bytes for a deterministic
ratchet step.

Full TS-runtime interop is tracked separately (#48); the KAT here is derived
independently from the crypto primitives (see ``test_known_answer_vector``).
"""

from __future__ import annotations

from copy import deepcopy

import pytest
from nacl.bindings import crypto_scalarmult_base

from tinyplace.signal import crypto as c
from tinyplace.signal.ratchet import (
    MAX_SKIP,
    RatchetHeader,
    RatchetMessage,
    _skip_message_keys,
    encode_header,
    ratchet_decrypt,
    ratchet_encrypt,
)
from tinyplace.signal.store import SessionState, X25519KeyPair, skipped_key_id


# --------------------------------------------------------------------------
# Helpers — build a fresh, deterministic-but-handshaken Alice/Bob pair.
# --------------------------------------------------------------------------


def _clamp(raw: bytes) -> bytes:
    scalar = bytearray(raw)
    scalar[0] &= 248
    scalar[31] &= 127
    scalar[31] |= 64
    return bytes(scalar)


def _key_pair(raw_private: bytes) -> X25519KeyPair:
    private_key = _clamp(raw_private)
    return X25519KeyPair(
        public_key=crypto_scalarmult_base(private_key),
        private_key=private_key,
    )


def _fresh_sessions(
    shared_root: bytes = b"\xAA" * 32,
) -> tuple[SessionState, SessionState]:
    """Return ``(alice, bob)`` sessions sharing a root key.

    Models the post-X3DH state: Alice (initiator) knows Bob's ratchet public
    key and has no chains yet; Bob holds the matching key pair and the same
    root key. This is exactly the seam X3DH (#44) hands the ratchet.
    """
    bob_key = _key_pair(bytes(range(32, 64)))
    alice_key = _key_pair(bytes(range(32)))

    alice = SessionState(
        dh_send_key_pair=alice_key,
        dh_recv_public_key=bob_key.public_key,
        root_key=shared_root,
        send_chain_key=None,
        recv_chain_key=None,
        send_message_number=0,
        recv_message_number=0,
        previous_chain_length=0,
    )
    bob = SessionState(
        dh_send_key_pair=bob_key,
        dh_recv_public_key=None,
        root_key=shared_root,
        send_chain_key=None,
        recv_chain_key=None,
        send_message_number=0,
        recv_message_number=0,
        previous_chain_length=0,
    )
    return alice, bob


AD = b"associated-data"


# --------------------------------------------------------------------------
# Header encoding
# --------------------------------------------------------------------------


def test_encode_header_layout() -> None:
    pub = bytes(range(32))
    header = RatchetHeader(
        public_key=pub, previous_chain_length=0x01020304, message_number=0x0A0B0C0D
    )
    encoded = encode_header(header)
    assert len(encoded) == 40
    assert encoded[:32] == pub
    # Big-endian u32 fields, matching ratchet.ts encodeHeader.
    assert encoded[32:36] == bytes([0x01, 0x02, 0x03, 0x04])
    assert encoded[36:40] == bytes([0x0A, 0x0B, 0x0C, 0x0D])


# --------------------------------------------------------------------------
# In-order round trip
# --------------------------------------------------------------------------


def test_in_order_round_trip() -> None:
    alice, bob = _fresh_sessions()
    for i in range(5):
        plaintext = f"message {i}".encode()
        msg = ratchet_encrypt(alice, plaintext, AD)
        assert msg.header.message_number == i
        assert ratchet_decrypt(bob, msg, AD) == plaintext

    # Alice advanced her sending chain once per message.
    assert alice.send_message_number == 5
    assert bob.recv_message_number == 5
    # No skipping happened on the in-order path.
    assert bob.skipped_keys == {}


def test_wrong_associated_data_fails() -> None:
    alice, bob = _fresh_sessions()
    msg = ratchet_encrypt(alice, b"secret", AD)
    with pytest.raises(ValueError):
        ratchet_decrypt(bob, msg, b"different-ad")


def test_tampered_ciphertext_fails() -> None:
    alice, bob = _fresh_sessions()
    msg = ratchet_encrypt(alice, b"secret", AD)
    tampered = bytearray(msg.ciphertext)
    tampered[0] ^= 0xFF
    bad = RatchetMessage(header=msg.header, ciphertext=bytes(tampered))
    with pytest.raises(ValueError):
        ratchet_decrypt(bob, bad, AD)


def test_failed_decrypt_does_not_mutate_session() -> None:
    # A tampered message carrying a NEW ratchet public key would, without
    # staging, advance Bob's session (root key, recv chain, counters, send key)
    # before the MAC check — corrupting it so the legitimate message can no
    # longer be decrypted. Verify the session is rolled back on failure.
    alice, bob = _fresh_sessions()
    msg = ratchet_encrypt(alice, b"hi bob", AD)  # fresh ratchet key, triggers DH step

    before = deepcopy(bob)
    tampered = bytearray(msg.ciphertext)
    tampered[0] ^= 0xFF
    bad = RatchetMessage(header=msg.header, ciphertext=bytes(tampered))
    with pytest.raises(ValueError):
        ratchet_decrypt(bob, bad, AD)

    # Bob's session is byte-for-byte unchanged after the failed decrypt...
    assert bob == before
    # ...so the genuine message still decrypts correctly.
    assert ratchet_decrypt(bob, msg, AD) == b"hi bob"


# --------------------------------------------------------------------------
# DH ratchet step (reply path)
# --------------------------------------------------------------------------


def test_dh_ratchet_reply_path() -> None:
    alice, bob = _fresh_sessions()

    # Alice -> Bob (Bob performs his first receiving DH ratchet).
    a1 = ratchet_encrypt(alice, b"hi bob", AD)
    assert ratchet_decrypt(bob, a1, AD) == b"hi bob"
    # Bob adopted Alice's ratchet key and derived his own sending key pair.
    assert bob.dh_recv_public_key == alice.dh_send_key_pair.public_key

    bob_send_key_after_first = bob.dh_send_key_pair.public_key

    # Bob -> Alice (reply triggers Alice's receiving DH ratchet).
    b1 = ratchet_encrypt(bob, b"hi alice", AD)
    assert b1.header.public_key == bob_send_key_after_first
    # previous_chain_length reflects Bob's (empty) prior sending chain.
    assert b1.header.previous_chain_length == 0
    assert ratchet_decrypt(alice, b1, AD) == b"hi alice"
    assert alice.dh_recv_public_key == bob_send_key_after_first

    # Alice replies again; this is a second DH ratchet round-trip.
    a2 = ratchet_encrypt(alice, b"how are you", AD)
    # Alice generated a new sending ratchet key during her recv ratchet step.
    assert a2.header.public_key != a1.header.public_key
    assert a2.header.previous_chain_length == 1  # she sent 1 msg before ratcheting
    assert ratchet_decrypt(bob, a2, AD) == b"how are you"


# --------------------------------------------------------------------------
# Out-of-order / skipped message keys
# --------------------------------------------------------------------------


def test_out_of_order_within_chain() -> None:
    alice, bob = _fresh_sessions()
    m0 = ratchet_encrypt(alice, b"zero", AD)
    m1 = ratchet_encrypt(alice, b"one", AD)
    m2 = ratchet_encrypt(alice, b"two", AD)

    # Deliver out of order: 2, 0, 1.
    assert ratchet_decrypt(bob, m2, AD) == b"two"
    # Keys for 0 and 1 were cached while skipping ahead to 2.
    assert len(bob.skipped_keys) == 2
    assert ratchet_decrypt(bob, m0, AD) == b"zero"
    assert ratchet_decrypt(bob, m1, AD) == b"one"
    # Both cached keys were consumed exactly once.
    assert bob.skipped_keys == {}


def test_skipped_across_dh_ratchet() -> None:
    alice, bob = _fresh_sessions()

    # Alice sends 3 in her first chain; only the last is delivered first.
    a0 = ratchet_encrypt(alice, b"a0", AD)
    a1 = ratchet_encrypt(alice, b"a1", AD)
    a2 = ratchet_encrypt(alice, b"a2", AD)
    assert ratchet_decrypt(bob, a2, AD) == b"a2"

    # Bob replies, then Alice ratchets and sends in a new chain.
    b0 = ratchet_encrypt(bob, b"b0", AD)
    assert ratchet_decrypt(alice, b0, AD) == b"b0"
    a3 = ratchet_encrypt(alice, b"a3", AD)  # new sending chain after ratchet

    # The new-chain message arrives before the stragglers from the old chain.
    assert ratchet_decrypt(bob, a3, AD) == b"a3"
    # The old chain's skipped keys (a0, a1) are still recoverable.
    assert ratchet_decrypt(bob, a0, AD) == b"a0"
    assert ratchet_decrypt(bob, a1, AD) == b"a1"


def test_too_many_skipped_raises() -> None:
    alice, bob = _fresh_sessions()
    # Bob must first establish a receiving chain.
    first = ratchet_encrypt(alice, b"first", AD)
    assert ratchet_decrypt(bob, first, AD) == b"first"

    # Forge a header far beyond MAX_SKIP in the same chain.
    forged_header = RatchetHeader(
        public_key=alice.dh_send_key_pair.public_key,
        previous_chain_length=0,
        message_number=MAX_SKIP + 5,
    )
    forged = RatchetMessage(header=forged_header, ciphertext=b"\x00" * 24)
    with pytest.raises(ValueError, match="Too many skipped messages"):
        ratchet_decrypt(bob, forged, AD)


def test_skip_message_keys_noop_without_recv_chain() -> None:
    # Guard path: skipping is a no-op before any receiving chain exists.
    _alice, bob = _fresh_sessions()
    assert bob.recv_chain_key is None
    _skip_message_keys(bob, 5)
    assert bob.skipped_keys == {}
    assert bob.recv_message_number == 0


def test_initial_send_requires_recv_public_key() -> None:
    alice, _ = _fresh_sessions()
    alice.dh_recv_public_key = None
    with pytest.raises(ValueError, match="without recipient public key"):
        ratchet_encrypt(alice, b"oops", AD)


# --------------------------------------------------------------------------
# Known-answer / interop vector (pinned bytes)
# --------------------------------------------------------------------------
#
# These bytes were derived independently from the crypto primitives
# (x25519_shared_secret -> kdf_root_key -> kdf_chain_key -> encrypt) for a
# fully deterministic first ratchet step, then cross-checked against
# ratchet_encrypt below. Provenance: fixed clamped private scalars
# 0x00..0x1f (Alice) and 0x20..0x3f (Bob), root key 0xAA*32, plaintext
# b"hello ratchet", associated data b"AD". The encrypt IV is HKDF-derived
# from the message key, so the ciphertext is deterministic. This pins
# byte-compatibility with the TS SDK ahead of full TS-runtime interop (#48).

_KAT_ALICE_PUB = bytes.fromhex(
    "8f40c5adb68f25624ae5b214ea767a6ec94d829d3d7b5e1ad1ba6f3e2138285f"
)
_KAT_ROOT = b"\xAA" * 32
_KAT_PLAINTEXT = b"hello ratchet"
_KAT_AD = b"AD"
_KAT_NEW_ROOT = bytes.fromhex(
    "e1bdd18cce97a925b11f6d516a991e15952aa6a02f078f551c48740e7a597f30"
)
_KAT_SEND_CHAIN = bytes.fromhex(
    "73322a962b06be7ed11f8f63d67a1dd151aac4fbe3a467e420a31dac1c451a21"
)
_KAT_CIPHERTEXT = bytes.fromhex(
    "b6df0eb6ef4061fa86d9768d642581026c5bf6443c7d0031"
)


def test_known_answer_vector() -> None:
    # Independent derivation using only crypto primitives.
    alice = _key_pair(bytes(range(32)))
    bob = _key_pair(bytes(range(32, 64)))
    assert alice.public_key == _KAT_ALICE_PUB

    dh = c.x25519_shared_secret(alice.private_key, bob.public_key)
    new_root, send_chain = c.kdf_root_key(_KAT_ROOT, dh)
    assert new_root == _KAT_NEW_ROOT
    assert send_chain == _KAT_SEND_CHAIN

    _chain, mk = c.kdf_chain_key(send_chain)
    header = encode_header(
        RatchetHeader(public_key=alice.public_key, previous_chain_length=0, message_number=0)
    )
    ct = c.encrypt(mk, _KAT_PLAINTEXT, _KAT_AD + header)
    assert ct == _KAT_CIPHERTEXT


def test_known_answer_matches_ratchet_encrypt() -> None:
    # The high-level ratchet API must produce the same pinned ciphertext.
    alice = SessionState(
        dh_send_key_pair=_key_pair(bytes(range(32))),
        dh_recv_public_key=_key_pair(bytes(range(32, 64))).public_key,
        root_key=_KAT_ROOT,
        send_chain_key=None,
        recv_chain_key=None,
        send_message_number=0,
        recv_message_number=0,
        previous_chain_length=0,
    )
    msg = ratchet_encrypt(alice, _KAT_PLAINTEXT, _KAT_AD)
    assert msg.header.public_key == _KAT_ALICE_PUB
    assert msg.header.message_number == 0
    assert msg.header.previous_chain_length == 0
    assert msg.ciphertext == _KAT_CIPHERTEXT
    # State advanced exactly as the independent derivation predicts.
    assert alice.root_key == _KAT_NEW_ROOT


def test_skipped_key_id_consistency() -> None:
    # The ratchet caches under the same id the store helper builds.
    pub = bytes(range(32))
    assert skipped_key_id(pub, 7) == f"{pub.hex()}:7"
