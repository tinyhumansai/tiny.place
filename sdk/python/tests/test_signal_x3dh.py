"""Tests for the X3DH key agreement slice (issue #44).

Covers initiator/responder agreement (both sides derive the *same* shared
secret), the with/without one-time-pre-key code paths, the associated-data
construction, the raw pre-key signature verification, and a pinned
known-answer vector for byte-level interop.

The known-answer vector is computed independently from this implementation via
Node's built-in ``node:crypto`` (X25519 + HKDF-SHA256), reproducing the exact
DH order / padding / salt / info of ``sdk/typescript/src/signal/x3dh.ts``. See
``EXPECTED_*`` below for provenance.
"""

from __future__ import annotations

import base64

import pytest
from nacl.bindings import crypto_scalarmult_base

from tinyplace.signal import generate_x25519_keypair
from tinyplace.signal.crypto import (
    ed25519_keypair_from_seed,
    ed25519_sign,
    to_base64,
)
from tinyplace.signal.store import SessionState
from tinyplace.signal.types import X25519KeyPair
from tinyplace.signal.x3dh import (
    X3DHBundle,
    X3DHInitResult,
    build_associated_data,
    verify_pre_key_signature_raw,
    x3dh_initiate,
    x3dh_respond,
)

# ---------------------------------------------------------------------------
# Known-answer vector (provenance)
# ---------------------------------------------------------------------------
#
# Fixed raw 32-byte X25519 private scalars (filled with a constant byte). The
# expected public keys and shared secrets below were produced by an INDEPENDENT
# Node script using only `node:crypto` (no @noble, no PyNaCl):
#
#   import crypto from "node:crypto";
#   // X25519 keypairs from raw scalars via PKCS8/SPKI DER wrapping,
#   // crypto.diffieHellman(...) for each DH, crypto.hkdfSync("sha256", ikm,
#   // salt=32x0x00, info="WhisperText", 32) over PADDING||DH1||DH2||DH3[||DH4],
#   // with PADDING = 32 bytes of 0xFF. DH order matches x3dh.ts exactly.
#
# Roles (initiator "Alice" derives these): our identity = ID_PRIV, ephemeral =
# EPH_PRIV; their bundle = {identity: THEIR_ID, signedPreKey: SPK, oneTimePreKey
# OTP}. Because node:crypto and libsodium both clamp per RFC 7748, the raw
# constant scalars yield identical results in both runtimes.
ID_PRIV = bytes([1]) * 32
EPH_PRIV = bytes([2]) * 32
SPK_PRIV = bytes([3]) * 32
OTP_PRIV = bytes([4]) * 32
THEIR_ID_PRIV = bytes([5]) * 32

EXPECTED_ID_PUB = "a4e09292b651c278b9772c569f5fa9bb13d906b46ab68c9df9dc2b4409f8a209"
EXPECTED_EPH_PUB = "ce8d3ad1ccb633ec7b70c17814a5c76ecd029685050d344745ba05870e587d59"
EXPECTED_SPK_PUB = "5dfedd3b6bd47f6fa28ee15d969d5bb0ea53774d488bdaf9df1c6e0124b3ef22"
EXPECTED_OTP_PUB = "ac01b2209e86354fb853237b5de0f4fab13c7fcbf433a61c019369617fecf10b"
EXPECTED_THEIR_ID_PUB = "50a61409b1ddd0325e9b16b700e719e9772c07000b1bd7786e907c653d20495d"
EXPECTED_SS_WITH_OTP = "47c75718c86c89e9d9ade14ef19144e7846f83e5a7ab13424f235ce909bd8c39"
EXPECTED_SS_NO_OTP = "1d926cba2a6c7ae50370697f285334214d92753ee913d17b9448dbdb2e117d82"


def _pub(priv: bytes) -> bytes:
    return crypto_scalarmult_base(priv)


def _kp(priv: bytes) -> X25519KeyPair:
    return X25519KeyPair(public_key=_pub(priv), private_key=priv)


# ---------------------------------------------------------------------------
# Known-answer vectors
# ---------------------------------------------------------------------------


def test_public_keys_match_known_answer_vector() -> None:
    assert _pub(ID_PRIV).hex() == EXPECTED_ID_PUB
    assert _pub(EPH_PRIV).hex() == EXPECTED_EPH_PUB
    assert _pub(SPK_PRIV).hex() == EXPECTED_SPK_PUB
    assert _pub(OTP_PRIV).hex() == EXPECTED_OTP_PUB
    assert _pub(THEIR_ID_PRIV).hex() == EXPECTED_THEIR_ID_PUB


def _initiate_with_fixed_ephemeral(*, with_otp: bool) -> X3DHInitResult:
    """Initiate with the pinned ephemeral key (monkeypatched generator)."""
    import tinyplace.signal.x3dh as x3dh_mod

    fixed_eph = _kp(EPH_PRIV)
    # The send key pair is also generated; its value does not affect the root
    # key, so any deterministic stand-in is fine for the KAT.
    real_generate = x3dh_mod.generate_x25519_keypair
    calls = {"n": 0}

    def fake_generate() -> X25519KeyPair:
        calls["n"] += 1
        if calls["n"] == 1:
            return fixed_eph
        return real_generate()

    x3dh_mod.generate_x25519_keypair = fake_generate  # type: ignore[assignment]
    try:
        bundle = X3DHBundle(
            identity_key=_pub(THEIR_ID_PRIV),
            signed_pre_key_id="spk_1",
            signed_pre_key=_pub(SPK_PRIV),
            one_time_pre_key_id="pk_1" if with_otp else None,
            one_time_pre_key=_pub(OTP_PRIV) if with_otp else None,
        )
        return x3dh_initiate(_kp(ID_PRIV), bundle)
    finally:
        x3dh_mod.generate_x25519_keypair = real_generate  # type: ignore[assignment]


def test_initiate_shared_secret_matches_known_answer_with_otp() -> None:
    result = _initiate_with_fixed_ephemeral(with_otp=True)
    assert result.ephemeral_public_key.hex() == EXPECTED_EPH_PUB
    assert result.session.root_key.hex() == EXPECTED_SS_WITH_OTP
    assert result.signed_pre_key_id == "spk_1"
    assert result.one_time_pre_key_id == "pk_1"


def test_initiate_shared_secret_matches_known_answer_without_otp() -> None:
    result = _initiate_with_fixed_ephemeral(with_otp=False)
    assert result.session.root_key.hex() == EXPECTED_SS_NO_OTP
    assert result.one_time_pre_key_id is None


def test_respond_shared_secret_matches_known_answer_with_otp() -> None:
    session = x3dh_respond(
        our_identity_key_pair=_kp(THEIR_ID_PRIV),
        our_signed_pre_key_pair=_kp(SPK_PRIV),
        their_identity_key=_pub(ID_PRIV),
        their_ephemeral_key=_pub(EPH_PRIV),
        our_one_time_pre_key_pair=_kp(OTP_PRIV),
    )
    assert session.root_key.hex() == EXPECTED_SS_WITH_OTP


def test_respond_shared_secret_matches_known_answer_without_otp() -> None:
    session = x3dh_respond(
        our_identity_key_pair=_kp(THEIR_ID_PRIV),
        our_signed_pre_key_pair=_kp(SPK_PRIV),
        their_identity_key=_pub(ID_PRIV),
        their_ephemeral_key=_pub(EPH_PRIV),
        our_one_time_pre_key_pair=None,
    )
    assert session.root_key.hex() == EXPECTED_SS_NO_OTP


# ---------------------------------------------------------------------------
# Initiator <-> responder agreement (fresh random keys)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("with_otp", [True, False])
def test_initiator_and_responder_derive_same_secret(with_otp: bool) -> None:
    alice_identity = generate_x25519_keypair()
    bob_identity = generate_x25519_keypair()
    bob_signed_pre_key = generate_x25519_keypair()
    bob_one_time_pre_key = generate_x25519_keypair() if with_otp else None

    bundle = X3DHBundle(
        identity_key=bob_identity.public_key,
        signed_pre_key_id="spk_99",
        signed_pre_key=bob_signed_pre_key.public_key,
        one_time_pre_key_id="pk_7" if with_otp else None,
        one_time_pre_key=bob_one_time_pre_key.public_key if with_otp else None,
    )

    init = x3dh_initiate(alice_identity, bundle)

    session = x3dh_respond(
        our_identity_key_pair=bob_identity,
        our_signed_pre_key_pair=bob_signed_pre_key,
        their_identity_key=alice_identity.public_key,
        their_ephemeral_key=init.ephemeral_public_key,
        our_one_time_pre_key_pair=bob_one_time_pre_key,
    )

    assert init.session.root_key == session.root_key
    assert len(init.session.root_key) == 32


def test_otp_mismatch_yields_different_secret() -> None:
    """Dropping the one-time pre-key on one side breaks agreement (as expected)."""
    alice = generate_x25519_keypair()
    bob = generate_x25519_keypair()
    spk = generate_x25519_keypair()
    otp = generate_x25519_keypair()

    bundle = X3DHBundle(
        identity_key=bob.public_key,
        signed_pre_key_id="spk_1",
        signed_pre_key=spk.public_key,
        one_time_pre_key_id="pk_1",
        one_time_pre_key=otp.public_key,
    )
    init = x3dh_initiate(alice, bundle)

    # Responder forgets to supply the one-time pre-key -> different secret.
    session = x3dh_respond(
        our_identity_key_pair=bob,
        our_signed_pre_key_pair=spk,
        their_identity_key=alice.public_key,
        their_ephemeral_key=init.ephemeral_public_key,
        our_one_time_pre_key_pair=None,
    )
    assert init.session.root_key != session.root_key


# ---------------------------------------------------------------------------
# Session-state handoff shape
# ---------------------------------------------------------------------------


def test_initiate_session_state_shape() -> None:
    alice = generate_x25519_keypair()
    bob = generate_x25519_keypair()
    spk = generate_x25519_keypair()
    bundle = X3DHBundle(
        identity_key=bob.public_key,
        signed_pre_key_id="spk_1",
        signed_pre_key=spk.public_key,
    )
    init = x3dh_initiate(alice, bundle)
    s = init.session
    assert isinstance(s, SessionState)
    assert s.dh_recv_public_key == spk.public_key
    assert s.send_chain_key is None
    assert s.recv_chain_key is None
    assert s.send_message_number == 0
    assert s.recv_message_number == 0
    assert s.previous_chain_length == 0
    assert s.skipped_keys == {}
    assert len(s.dh_send_key_pair.public_key) == 32


def test_respond_session_state_shape() -> None:
    session = x3dh_respond(
        our_identity_key_pair=_kp(THEIR_ID_PRIV),
        our_signed_pre_key_pair=_kp(SPK_PRIV),
        their_identity_key=_pub(ID_PRIV),
        their_ephemeral_key=_pub(EPH_PRIV),
    )
    assert session.dh_recv_public_key is None
    assert session.dh_send_key_pair.public_key == _pub(SPK_PRIV)
    assert session.dh_send_key_pair.private_key == SPK_PRIV


# ---------------------------------------------------------------------------
# Associated data
# ---------------------------------------------------------------------------


def test_build_associated_data_is_sender_then_recipient() -> None:
    sender = bytes([0xAA]) * 32
    recipient = bytes([0xBB]) * 32
    ad = build_associated_data(sender, recipient)
    assert ad == sender + recipient
    assert ad[:32] == sender
    assert ad[32:] == recipient


# ---------------------------------------------------------------------------
# Raw pre-key signature verification (x3dh.ts parity)
# ---------------------------------------------------------------------------


def _signed_pre_key_b64_and_sig(seed: bytes) -> tuple[bytes, str, str]:
    """Return (ed_pub, prekey_pub_b64, signature_b64) for a freshly signed key."""
    ed_pub, ed_secret = ed25519_keypair_from_seed(seed)
    prekey = generate_x25519_keypair()
    prekey_b64 = to_base64(prekey.public_key)
    # Backend/keys.py sign the UTF-8 bytes of the base64 public key string.
    sig = ed25519_sign(ed_secret, prekey_b64.encode("utf-8"))
    return ed_pub, prekey_b64, to_base64(sig)


def test_verify_pre_key_signature_raw_accepts_valid() -> None:
    ed_pub, prekey_b64, sig_b64 = _signed_pre_key_b64_and_sig(b"\x07" * 32)
    # Should not raise.
    verify_pre_key_signature_raw(ed_pub, prekey_b64, sig_b64, "signed pre-key")


def test_verify_pre_key_signature_raw_rejects_missing_signature() -> None:
    ed_pub, prekey_b64, _ = _signed_pre_key_b64_and_sig(b"\x08" * 32)
    with pytest.raises(ValueError, match="missing its Ed25519 signature"):
        verify_pre_key_signature_raw(ed_pub, prekey_b64, None, "signed pre-key")
    with pytest.raises(ValueError, match="missing its Ed25519 signature"):
        verify_pre_key_signature_raw(ed_pub, prekey_b64, "", "one-time pre-key")


def test_verify_pre_key_signature_raw_rejects_wrong_identity() -> None:
    _, prekey_b64, sig_b64 = _signed_pre_key_b64_and_sig(b"\x09" * 32)
    other_ed_pub, _ = ed25519_keypair_from_seed(b"\x0a" * 32)
    with pytest.raises(ValueError, match="invalid Ed25519 signature"):
        verify_pre_key_signature_raw(other_ed_pub, prekey_b64, sig_b64, "signed pre-key")


def test_verify_pre_key_signature_raw_rejects_tampered_prekey() -> None:
    ed_pub, prekey_b64, sig_b64 = _signed_pre_key_b64_and_sig(b"\x0b" * 32)
    tampered = to_base64(bytes([(prekey_b64.encode()[0] ^ 0xFF)]) + base64.b64decode(prekey_b64)[1:])
    with pytest.raises(ValueError, match="invalid Ed25519 signature"):
        verify_pre_key_signature_raw(ed_pub, tampered, sig_b64, "signed pre-key")


def test_verify_pre_key_signature_raw_rejects_malformed_signature() -> None:
    ed_pub, prekey_b64, _ = _signed_pre_key_b64_and_sig(b"\x0c" * 32)
    with pytest.raises(ValueError, match="invalid Ed25519 signature"):
        verify_pre_key_signature_raw(ed_pub, prekey_b64, "not!base64!!", "signed pre-key")
