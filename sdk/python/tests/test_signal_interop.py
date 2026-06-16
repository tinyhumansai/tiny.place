"""Cross-language interop tests for the Signal Protocol port.

The headline deliverable of issue #48: prove that the Python Signal port is
byte-for-byte compatible with the flagship **TypeScript** SDK across every
layer of the stack — crypto KDFs / AEAD, the X3DH shared secret, the Double
Ratchet, and Sender Keys (group messaging).

Provenance of the pinned vectors
---------------------------------
Every vector in ``tests/vectors/signal_vectors.json`` was produced by the
generator ``tests/vectors/gen_signal_vectors.mjs``, which imports and executes
the **real** TypeScript Signal modules (``sdk/typescript/src/signal/*.ts``,
compiled verbatim with the SDK's own ``tsc`` and backed by ``@noble/curves`` /
``@noble/hashes``). The values are therefore genuine TypeScript-SDK output, not
numbers recomputed from this Python implementation — so a passing assertion here
demonstrates true cross-language interop, not a tautology.

What each test proves
---------------------
* ``test_crypto_*`` — the KDFs (HKDF root/chain, message-key derivation),
  HMAC, and the AES-CBC+HMAC AEAD all reproduce the TS bytes exactly. The AEAD
  is checked in **both directions**: Python decrypts the TS ciphertext, and
  Python re-encrypts the same input and gets the identical ciphertext.
* ``test_x3dh_*`` — the X3DH shared secret matches for both the 3-DH and 4-DH
  (one-time pre-key) cases, and the Python ``x3dh_respond`` reaches the same
  secret the TS initiator derived (reciprocity).
* ``test_ratchet_*`` — a Double Ratchet session decrypts a stream of messages
  that the TS ``ratchetEncrypt`` produced, and a Python sender reproduces the
  TS ciphertext byte-for-byte (deterministic initial state).
* ``test_sender_key_*`` — a Python ``GroupSenderKeyReceiver`` verifies the TS
  ed25519 signatures and decrypts the TS group ciphertexts, and a Python
  ``GroupSenderKey`` reproduces the TS ciphertexts/signatures.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tinyplace.signal import crypto as c
from tinyplace.signal.ratchet import (
    RatchetHeader,
    RatchetMessage,
    ratchet_decrypt,
    ratchet_encrypt,
)
from tinyplace.signal.sender_key import (
    GroupSenderKey,
    GroupSenderKeyReceiver,
    SenderKeyDistribution,
    SenderKeyMessage,
)
from tinyplace.signal.store import SessionState, X25519KeyPair
from tinyplace.signal.types import X25519KeyPair as TypesKeyPair
from tinyplace.signal.x3dh import x3dh_respond

_VECTORS_PATH = Path(__file__).parent / "vectors" / "signal_vectors.json"


@pytest.fixture(scope="module")
def vectors() -> dict:
    """Load the TypeScript-generated interop vectors (see module docstring)."""
    return json.loads(_VECTORS_PATH.read_text())


def _hx(value: str) -> bytes:
    return bytes.fromhex(value)


# --------------------------------------------------------------------------
# 1. crypto KDFs / AEAD
# --------------------------------------------------------------------------


def test_crypto_kdf_root_key(vectors: dict) -> None:
    v = vectors["crypto"]["kdf_root_key"]
    root_key, chain_key = c.kdf_root_key(_hx(v["root_key"]), _hx(v["dh_output"]))
    assert root_key.hex() == v["next_root_key"]
    assert chain_key.hex() == v["chain_key"]


def test_crypto_kdf_chain_key(vectors: dict) -> None:
    v = vectors["crypto"]["kdf_chain_key"]
    chain_key, message_key = c.kdf_chain_key(_hx(v["chain_key_in"]))
    assert chain_key.hex() == v["next_chain_key"]
    assert message_key.hex() == v["message_key"]


def test_crypto_derive_message_keys(vectors: dict) -> None:
    v = vectors["crypto"]["derive_message_keys"]
    enc_key, mac_key, iv = c.derive_message_keys(_hx(v["message_key"]))
    assert enc_key.hex() == v["enc_key"]
    assert mac_key.hex() == v["mac_key"]
    assert iv.hex() == v["iv"]


def test_crypto_compute_hmac(vectors: dict) -> None:
    v = vectors["crypto"]["compute_hmac"]
    assert c.compute_hmac(_hx(v["key"]), _hx(v["data"])).hex() == v["mac"]


def test_crypto_aead_decrypts_ts_ciphertext(vectors: dict) -> None:
    v = vectors["crypto"]["aead"]
    plaintext = c.decrypt(
        _hx(v["message_key"]), _hx(v["ciphertext"]), _hx(v["associated_data"])
    )
    assert plaintext == _hx(v["plaintext"])


def test_crypto_aead_python_reproduces_ts_ciphertext(vectors: dict) -> None:
    # Reverse direction: Python encrypt must yield the identical TS bytes
    # (deterministic — the message key fixes the IV via derive_message_keys).
    v = vectors["crypto"]["aead"]
    ciphertext = c.encrypt(
        _hx(v["message_key"]), _hx(v["plaintext"]), _hx(v["associated_data"])
    )
    assert ciphertext.hex() == v["ciphertext"]


def test_crypto_aead_empty_plaintext(vectors: dict) -> None:
    v = vectors["crypto"]["aead_empty"]
    ciphertext = c.encrypt(_hx(v["message_key"]), b"", b"")
    assert ciphertext.hex() == v["ciphertext"]
    assert c.decrypt(_hx(v["message_key"]), _hx(v["ciphertext"]), b"") == b""


# --------------------------------------------------------------------------
# 2. X3DH shared secret
# --------------------------------------------------------------------------


def _x3dh_initiator_secret(v: dict, *, with_otk: bool) -> bytes:
    """Reproduce the X3DH initiator computation with the vector's fixed keys.

    Mirrors ``x3dhInitiate`` exactly (same DH order, same 0xFF padding, same
    HKDF) but with a *fixed* ephemeral so the result is deterministic and can be
    pinned against the TS output.
    """
    padding = b"\xff" * 32
    alice_id_priv = _hx(v["alice_identity_priv"])
    alice_eph_priv = _hx(v["alice_ephemeral_priv"])
    bob_id_pub = _hx(v["bob_identity_pub"])
    bob_spk_pub = _hx(v["bob_signed_pre_key_pub"])

    dh1 = c.x25519_shared_secret(alice_id_priv, bob_spk_pub)
    dh2 = c.x25519_shared_secret(alice_eph_priv, bob_id_pub)
    dh3 = c.x25519_shared_secret(alice_eph_priv, bob_spk_pub)
    if with_otk:
        dh4 = c.x25519_shared_secret(alice_eph_priv, _hx(v["bob_one_time_pre_key_pub"]))
        dh_concat = padding + dh1 + dh2 + dh3 + dh4
    else:
        dh_concat = padding + dh1 + dh2 + dh3
    return c.hkdf(dh_concat, b"\x00" * 32, b"WhisperText", 32)


def test_x3dh_public_keys_match(vectors: dict) -> None:
    # The fixed private scalars must derive the same X25519 public keys noble did.
    v = vectors["x3dh"]
    from nacl.bindings import crypto_scalarmult_base

    pairs = [
        ("alice_identity_priv", "alice_identity_pub"),
        ("alice_ephemeral_priv", "alice_ephemeral_pub"),
        ("bob_identity_priv", "bob_identity_pub"),
        ("bob_signed_pre_key_priv", "bob_signed_pre_key_pub"),
        ("bob_one_time_pre_key_priv", "bob_one_time_pre_key_pub"),
    ]
    for priv_key, pub_key in pairs:
        assert crypto_scalarmult_base(_hx(v[priv_key])).hex() == v[pub_key]


def test_x3dh_shared_secret_with_otk(vectors: dict) -> None:
    v = vectors["x3dh"]
    assert _x3dh_initiator_secret(v, with_otk=True).hex() == v["shared_secret_with_otk"]


def test_x3dh_shared_secret_no_otk(vectors: dict) -> None:
    v = vectors["x3dh"]
    assert _x3dh_initiator_secret(v, with_otk=False).hex() == v["shared_secret_no_otk"]


def test_x3dh_responder_reaches_initiator_secret(vectors: dict) -> None:
    # Python's x3dh_respond (Bob) must derive the exact secret the TS initiator
    # (Alice) computed — the core interop guarantee for session establishment.
    v = vectors["x3dh"]
    bob_identity = TypesKeyPair(
        public_key=_hx(v["bob_identity_pub"]),
        private_key=_hx(v["bob_identity_priv"]),
    )
    bob_signed_pre_key = TypesKeyPair(
        public_key=_hx(v["bob_signed_pre_key_pub"]),
        private_key=_hx(v["bob_signed_pre_key_priv"]),
    )
    bob_one_time_pre_key = TypesKeyPair(
        public_key=_hx(v["bob_one_time_pre_key_pub"]),
        private_key=_hx(v["bob_one_time_pre_key_priv"]),
    )
    session = x3dh_respond(
        bob_identity,
        bob_signed_pre_key,
        _hx(v["alice_identity_pub"]),
        _hx(v["alice_ephemeral_pub"]),
        bob_one_time_pre_key,
    )
    assert session.root_key.hex() == v["shared_secret_with_otk"]
    # And it agrees with what TS's own x3dhRespond produced.
    assert session.root_key.hex() == v["responder_root_key_with_otk"]


# --------------------------------------------------------------------------
# 3. Double Ratchet
# --------------------------------------------------------------------------


def _bob_recv_session(v: dict) -> SessionState:
    """The receiver session mirroring the TS generator's initial Bob state."""
    return SessionState(
        dh_send_key_pair=X25519KeyPair(
            public_key=_hx(v["bob_ratchet_pub"]),
            private_key=_hx(v["bob_ratchet_priv"]),
        ),
        dh_recv_public_key=None,
        root_key=_hx(v["root_key"]),
        send_chain_key=None,
        recv_chain_key=None,
        send_message_number=0,
        recv_message_number=0,
        previous_chain_length=0,
    )


def _alice_send_session(v: dict) -> SessionState:
    """The sender session mirroring the TS generator's initial Alice state."""
    return SessionState(
        dh_send_key_pair=X25519KeyPair(
            public_key=_hx(v["alice_ratchet_pub"]),
            private_key=_hx(v["alice_ratchet_priv"]),
        ),
        dh_recv_public_key=_hx(v["bob_ratchet_pub"]),
        root_key=_hx(v["root_key"]),
        send_chain_key=None,
        recv_chain_key=None,
        send_message_number=0,
        recv_message_number=0,
        previous_chain_length=0,
    )


def test_ratchet_python_decrypts_ts_messages(vectors: dict) -> None:
    # Python (Bob) decrypts the in-order stream the TS ratchet (Alice) produced.
    v = vectors["ratchet"]
    ad = _hx(v["associated_data"])
    session = _bob_recv_session(v)
    for entry in v["messages"]:
        message = RatchetMessage(
            header=RatchetHeader(
                public_key=_hx(entry["header_public_key"]),
                previous_chain_length=entry["header_previous_chain_length"],
                message_number=entry["header_message_number"],
            ),
            ciphertext=_hx(entry["ciphertext"]),
        )
        plaintext = ratchet_decrypt(session, message, ad)
        assert plaintext == _hx(entry["plaintext"])


def test_ratchet_python_reproduces_ts_ciphertext(vectors: dict) -> None:
    # Reverse direction: Python (Alice) re-encrypts and must match the TS bytes.
    # The initial DH-ratchet step is deterministic for the fixed keys, so the
    # full ciphertext stream is reproducible.
    v = vectors["ratchet"]
    ad = _hx(v["associated_data"])
    session = _alice_send_session(v)
    for entry in v["messages"]:
        message = ratchet_encrypt(session, _hx(entry["plaintext"]), ad)
        assert message.header.public_key.hex() == entry["header_public_key"]
        assert message.header.message_number == entry["header_message_number"]
        assert (
            message.header.previous_chain_length
            == entry["header_previous_chain_length"]
        )
        assert message.ciphertext.hex() == entry["ciphertext"]


def test_ratchet_out_of_order_ts_messages(vectors: dict) -> None:
    # Deliver the TS messages out of order; the Python ratchet must cache the
    # skipped key and still decrypt, just like the TS receiver would.
    v = vectors["ratchet"]
    ad = _hx(v["associated_data"])
    session = _bob_recv_session(v)
    entries = v["messages"]
    order = [entries[2], entries[0], entries[1]]
    for entry in order:
        message = RatchetMessage(
            header=RatchetHeader(
                public_key=_hx(entry["header_public_key"]),
                previous_chain_length=entry["header_previous_chain_length"],
                message_number=entry["header_message_number"],
            ),
            ciphertext=_hx(entry["ciphertext"]),
        )
        assert ratchet_decrypt(session, message, ad) == _hx(entry["plaintext"])


# --------------------------------------------------------------------------
# 4. Sender Keys (group messaging)
# --------------------------------------------------------------------------


def test_sender_key_python_decrypts_ts_messages(vectors: dict) -> None:
    # Python receiver, initialised from the TS sender's distribution, must verify
    # the TS ed25519 signatures and decrypt every TS group ciphertext.
    v = vectors["sender_key"]
    dist = v["distribution"]
    receiver = GroupSenderKeyReceiver.from_distribution(
        SenderKeyDistribution(
            chain_key=dist["chain_key_b64"],
            iteration=dist["iteration"],
            signature_public_key=dist["signature_public_key_b64"],
        )
    )
    for entry in v["messages"]:
        message = SenderKeyMessage(
            iteration=entry["iteration"],
            ciphertext=entry["ciphertext_b64"],
            signature=entry["signature_b64"],
        )
        assert receiver.decrypt(message) == _hx(entry["plaintext"])


def test_sender_key_python_reproduces_ts_ciphertext(vectors: dict) -> None:
    # Reverse direction: a Python GroupSenderKey restored from the same fixed
    # state must reproduce the TS ciphertexts and signatures byte-for-byte.
    v = vectors["sender_key"]
    from tinyplace.signal.store import SenderKeyState

    signing_seed = _hx(v["signing_seed"])
    signing_pub = _hx(v["signing_public_key"])
    sender = GroupSenderKey.restore(
        SenderKeyState(
            distribution_id="interop",
            chain_key=_hx(v["chain_key"]),
            iteration=0,
            signing_public_key=signing_pub,
            signing_private_key=signing_seed,
        )
    )
    # The distribution snapshot must match the TS one.
    dist = sender.distribution()
    assert dist.chain_key == v["distribution"]["chain_key_b64"]
    assert dist.signature_public_key == v["distribution"]["signature_public_key_b64"]

    for entry in v["messages"]:
        message = sender.encrypt(_hx(entry["plaintext"]))
        assert message.iteration == entry["iteration"]
        assert message.ciphertext == entry["ciphertext_b64"]
        assert message.signature == entry["signature_b64"]


def test_sender_key_out_of_order_ts_messages(vectors: dict) -> None:
    # Out-of-order group delivery: the Python receiver caches skipped keys and
    # still verifies + decrypts the TS messages.
    v = vectors["sender_key"]
    dist = v["distribution"]
    receiver = GroupSenderKeyReceiver.from_distribution(
        SenderKeyDistribution(
            chain_key=dist["chain_key_b64"],
            iteration=dist["iteration"],
            signature_public_key=dist["signature_public_key_b64"],
        )
    )
    entries = v["messages"]
    for entry in [entries[2], entries[0], entries[1]]:
        message = SenderKeyMessage(
            iteration=entry["iteration"],
            ciphertext=entry["ciphertext_b64"],
            signature=entry["signature_b64"],
        )
        assert receiver.decrypt(message) == _hx(entry["plaintext"])
