"""Tests for the Signal Sender Key port (:mod:`tinyplace.signal.sender_key`).

Covers the group-messaging flow: a sender's distribution snapshot fanning out
to multiple receivers, iteration advance, out-of-order / skipped delivery,
Ed25519 signature-verification rejection (forged / tampered messages),
serialize/restore round-trips through :class:`SenderKeyState` (both halves),
membership-change rotation (a fresh key supersedes the old), and a fixed
known-answer (KAT) interop vector pinning the exact ciphertext / signature
bytes for a deterministic encrypt step.

Full TS-runtime interop is tracked separately (#48); the KAT here is derived
independently from the crypto primitives (see ``test_known_answer_vector``).
"""

from __future__ import annotations

import pytest

from tinyplace.signal.crypto import (
    ed25519_keypair_from_seed,
    encrypt,
    from_base64,
    kdf_chain_key,
    to_base64,
)
from tinyplace.signal.memory_store import MemorySessionStore
from tinyplace.signal.sender_key import (
    MAX_SKIP,
    GroupSenderKey,
    GroupSenderKeyReceiver,
    SenderKeyDistribution,
    SenderKeyMessage,
)
from tinyplace.signal.store import SenderKeyState, X25519KeyPair

DISTRIBUTION_ID = "group-1:alice"


def _receiver_from(sender: GroupSenderKey) -> GroupSenderKeyReceiver:
    return GroupSenderKeyReceiver.from_distribution(sender.distribution())


# --------------------------------------------------------------------------
# Send -> all receivers decrypt; iteration advances.
# --------------------------------------------------------------------------


def test_send_fans_out_to_all_receivers() -> None:
    sender = GroupSenderKey.create()
    # Each member initialises its own receiver from the same distribution.
    receivers = [_receiver_from(sender) for _ in range(3)]

    plaintext = b"hello group"
    message = sender.encrypt(plaintext)

    for receiver in receivers:
        assert receiver.decrypt(message) == plaintext


def test_iteration_advances_per_message() -> None:
    sender = GroupSenderKey.create()
    receiver = _receiver_from(sender)

    assert sender.current_iteration == 0
    messages = []
    for index in range(4):
        message = sender.encrypt(f"msg-{index}".encode())
        assert message.iteration == index
        messages.append(message)
    assert sender.current_iteration == 4

    for index, message in enumerate(messages):
        assert receiver.decrypt(message) == f"msg-{index}".encode()


# --------------------------------------------------------------------------
# Out-of-order / skipped delivery.
# --------------------------------------------------------------------------


def test_out_of_order_delivery() -> None:
    sender = GroupSenderKey.create()
    receiver = _receiver_from(sender)

    m0 = sender.encrypt(b"zero")
    m1 = sender.encrypt(b"one")
    m2 = sender.encrypt(b"two")

    # Deliver 2, then 0, then 1 — the receiver caches skipped keys.
    assert receiver.decrypt(m2) == b"two"
    assert receiver.decrypt(m0) == b"zero"
    assert receiver.decrypt(m1) == b"one"


def test_replayed_or_too_old_message_rejected() -> None:
    sender = GroupSenderKey.create()
    receiver = _receiver_from(sender)

    m0 = sender.encrypt(b"zero")
    m1 = sender.encrypt(b"one")

    assert receiver.decrypt(m0) == b"zero"
    assert receiver.decrypt(m1) == b"one"
    # m0 is now behind the chain head and no longer cached.
    with pytest.raises(ValueError, match="older than the current chain"):
        receiver.decrypt(m0)


def test_too_many_skipped_rejected() -> None:
    sender = GroupSenderKey.create()
    receiver = _receiver_from(sender)

    # Forge a message claiming an iteration far beyond MAX_SKIP. Re-sign with
    # the sender's real key so we exercise the skip cap, not signature checks.
    far = sender.encrypt(b"first")  # iteration 0
    forged = SenderKeyMessage(
        iteration=MAX_SKIP + 5,
        ciphertext=far.ciphertext,
        signature=far.signature,
    )
    with pytest.raises(ValueError, match="Too many skipped"):
        receiver.decrypt(forged)


# --------------------------------------------------------------------------
# Signature-verification rejection.
# --------------------------------------------------------------------------


def test_tampered_ciphertext_rejected() -> None:
    sender = GroupSenderKey.create()
    receiver = _receiver_from(sender)

    message = sender.encrypt(b"authentic")
    raw = bytearray(from_base64(message.ciphertext))
    raw[0] ^= 0x01
    tampered = SenderKeyMessage(
        iteration=message.iteration,
        ciphertext=to_base64(bytes(raw)),
        signature=message.signature,
    )
    with pytest.raises(ValueError, match="signature verification failed"):
        receiver.decrypt(tampered)


def test_forged_signature_from_wrong_key_rejected() -> None:
    sender = GroupSenderKey.create()
    receiver = _receiver_from(sender)

    message = sender.encrypt(b"authentic")
    # An attacker re-signs the same ciphertext with a different (wrong) key.
    attacker = GroupSenderKey.create()
    attacker_sig = attacker.encrypt(b"throwaway")  # any sig from wrong key
    forged = SenderKeyMessage(
        iteration=message.iteration,
        ciphertext=message.ciphertext,
        signature=attacker_sig.signature,
    )
    with pytest.raises(ValueError, match="signature verification failed"):
        receiver.decrypt(forged)


# --------------------------------------------------------------------------
# Serialize / restore round-trip through SenderKeyState (both halves).
# --------------------------------------------------------------------------


def test_own_serialize_restore_round_trip() -> None:
    sender = GroupSenderKey.create()
    sender.encrypt(b"warm up")  # advance to iteration 1

    state = sender.serialize(DISTRIBUTION_ID)
    assert isinstance(state, SenderKeyState)
    assert state.distribution_id == DISTRIBUTION_ID
    assert state.signing_private_key is not None
    assert state.iteration == 1

    restored = GroupSenderKey.restore(state)
    assert restored.current_iteration == sender.current_iteration

    # The restored sender continues the exact same chain: its iteration-1
    # output is byte-identical to what the original would have produced, and a
    # receiver seeded from the (iteration-1) distribution decrypts it.
    receiver = _receiver_from(restored)
    message = restored.encrypt(b"after restore")
    assert message.iteration == 1
    assert receiver.decrypt(message) == b"after restore"


def test_restore_own_without_private_key_rejected() -> None:
    receiver_state = SenderKeyState(
        distribution_id=DISTRIBUTION_ID,
        chain_key=b"\x00" * 32,
        iteration=0,
        signing_public_key=b"\x00" * 32,
        signing_private_key=None,
    )
    with pytest.raises(ValueError, match="no signing_private_key"):
        GroupSenderKey.restore(receiver_state)


def test_receiver_serialize_restore_round_trip_preserves_skipped() -> None:
    sender = GroupSenderKey.create()
    receiver = _receiver_from(sender)

    m0 = sender.encrypt(b"zero")
    m1 = sender.encrypt(b"one")
    m2 = sender.encrypt(b"two")

    # Decrypt out of order so the receiver caches a skipped key for iteration 1.
    assert receiver.decrypt(m0) == b"zero"
    assert receiver.decrypt(m2) == b"two"

    state = receiver.serialize(DISTRIBUTION_ID)
    assert state.signing_private_key is None
    assert 1 in state.skipped_keys  # iteration 1 cached while waiting

    restored = GroupSenderKeyReceiver.restore(state)
    # The restored receiver can still decrypt the previously-skipped message.
    assert restored.decrypt(m1) == b"one"


async def test_round_trip_through_memory_store() -> None:
    identity = X25519KeyPair(public_key=b"\x01" * 32, private_key=b"\x02" * 32)
    store = MemorySessionStore(identity)

    sender = GroupSenderKey.create()
    # Snapshot the receiver distribution BEFORE encrypting (iteration 0).
    receiver = _receiver_from(sender)
    message = sender.encrypt(b"persisted")
    await store.store_sender_key(sender.serialize(DISTRIBUTION_ID))

    loaded = await store.get_sender_key(DISTRIBUTION_ID)
    assert loaded is not None
    restored = GroupSenderKey.restore(loaded)
    assert restored.current_iteration == 1

    # A receiver persisted and reloaded also works.
    receiver_id = "group-1:alice:recv"
    rstate = receiver.serialize(receiver_id)
    rstate.distribution_id = receiver_id
    await store.store_sender_key(rstate)
    rloaded = await store.get_sender_key(receiver_id)
    assert rloaded is not None
    rrestored = GroupSenderKeyReceiver.restore(rloaded)
    assert rrestored.decrypt(message) == b"persisted"


# --------------------------------------------------------------------------
# Membership-change rotation.
# --------------------------------------------------------------------------


def test_rotation_supersedes_old_key() -> None:
    old = GroupSenderKey.create()
    old_receiver = _receiver_from(old)
    old_message = old.encrypt(b"before rotation")
    assert old_receiver.decrypt(old_message) == b"before rotation"

    # Membership changes -> a fresh sender key with a new chain + signing pair.
    new = GroupSenderKey.create()
    assert new.distribution().chain_key != old.distribution().chain_key
    assert (
        new.distribution().signature_public_key
        != old.distribution().signature_public_key
    )

    new_receiver = _receiver_from(new)
    new_message = new.encrypt(b"after rotation")
    assert new_receiver.decrypt(new_message) == b"after rotation"

    # The old receiver must NOT be able to verify messages from the new key
    # (different signing key) — confirming the rotation is a clean break.
    with pytest.raises(ValueError, match="signature verification failed"):
        old_receiver.decrypt(new_message)


# --------------------------------------------------------------------------
# Known-answer (KAT) interop vector.
# --------------------------------------------------------------------------


def test_known_answer_vector() -> None:
    """Pin exact bytes for a deterministic encrypt step.

    Provenance: derived independently from the Python crypto primitives with a
    fixed chain key (0x00..0x1f) and a fixed Ed25519 seed (0xAA * 32). These
    are the same primitives the TypeScript reference uses, so the values double
    as an interop anchor for the full TS-runtime check tracked in #48.
    """
    chain_key = bytes(range(32))
    seed = bytes([0xAA]) * 32
    public_key, _secret = ed25519_keypair_from_seed(seed)

    expected_public_key = "5zTqbCtiV95yNV5HKqBaTEh+a0Y8Ap7TBt8vAbVja1g="
    expected_ciphertext = "HniLoazpN9WdAhgLPPQ42eJ3igUSDfZe"
    expected_signature = (
        "gmQ/bDL9DZHibIw3auk5SqcXnTsoXSd6CuC/r18EjQQR"
        "MwMVnSfLib4QUKlAi1QJq6G/rXdNo2usolazizAXBA=="
    )
    assert to_base64(public_key) == expected_public_key

    # Drive the sending half through this exact state and pin the output.
    sender = GroupSenderKey(chain_key, 0, seed, public_key)
    message = sender.encrypt(b"hello group")
    assert message.iteration == 0
    assert message.ciphertext == expected_ciphertext
    assert message.signature == expected_signature
    assert sender.current_iteration == 1

    # Cross-check the primitives produced the same bytes directly.
    _ck, message_key = kdf_chain_key(chain_key)
    assert to_base64(encrypt(message_key, b"hello group", b"")) == expected_ciphertext

    # A receiver seeded with the same distribution decrypts it.
    receiver = GroupSenderKeyReceiver.from_distribution(
        SenderKeyDistribution(
            chain_key=to_base64(chain_key),
            iteration=0,
            signature_public_key=to_base64(public_key),
        )
    )
    assert receiver.decrypt(message) == b"hello group"
