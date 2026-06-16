"""Tests for the 1:1 Signal session layer (:mod:`tinyplace.signal.session`).

Covers a full Python<->Python round-trip (Alice establishes a session from
Bob's fetched bundle, encrypts -> envelope -> Bob decrypts, then Bob replies),
session persistence across a simulated restart (sessions are re-loaded from the
store into fresh :class:`SignalSession` objects), bundle verification
(``parse_key_bundle`` rejects a tampered / unsigned bundle), the
``PREKEY_BUNDLE`` -> ``CIPHERTEXT`` envelope typing, and the message-wiring
helpers on :class:`MessagesApi` over a mocked HTTP layer (the ``FakeSession``
pattern from ``tests/helpers.py``).

A deterministic known-answer assertion pins the exact ``signal.ratchetKey`` /
envelope ``type`` for a fixed-seed first message, ahead of full TS-runtime
interop (#48).
"""

from __future__ import annotations

import asyncio
import base64
import json
from dataclasses import dataclass

import pytest

from tinyplace.api.messages import DecryptedMessage, MessagesApi
from tinyplace.client import TinyPlaceClient
from tinyplace.signal import (
    MemorySessionStore,
    SignalSession,
    parse_key_bundle,
)
from tinyplace.signal.crypto import (
    ed25519_keypair_from_seed,
    ed25519_pub_to_x25519_pub,
    ed25519_seed_to_x25519_keypair,
    ed25519_sign,
    to_base64,
)
from tinyplace.signal.store import (
    PreKeyPair,
    SignedPreKeyPair,
    X25519KeyPair,
)
from tinyplace.signer import LocalSigner

from .helpers import FakeResponse, FakeSession


# --------------------------------------------------------------------------
# A test identity: an Ed25519 addressing key + its derived X25519 identity key,
# a memory store seeded with a signed pre-key and a one-time pre-key, and a
# fetchable KeyBundle wire dict. Mirrors how the website provisions an identity.
# --------------------------------------------------------------------------


@dataclass
class Identity:
    """A self-contained test identity for one agent (Alice or Bob)."""

    address: str  # base64 Ed25519 public key (messaging address)
    ed25519_public_key: bytes
    x25519_public_key: bytes
    store: MemorySessionStore
    bundle: dict


def _make_identity(seed: bytes) -> Identity:
    """Build an :class:`Identity` from a 32-byte Ed25519 seed.

    The signed/one-time pre-keys are signed with the Ed25519 identity key over
    the UTF-8 bytes of the pre-key's base64 public key, exactly as the backend
    verifies (and as ``keys.py`` produces).
    """
    ed_public, ed_secret = ed25519_keypair_from_seed(seed)
    address = to_base64(ed_public)
    x_identity = ed25519_seed_to_x25519_keypair(seed)

    store = MemorySessionStore(
        X25519KeyPair(
            public_key=x_identity.public_key,
            private_key=x_identity.private_key,
        )
    )

    # Signed pre-key.
    spk = ed25519_seed_to_x25519_keypair(bytes((b + 1) & 0xFF for b in seed))
    spk_b64 = to_base64(spk.public_key)
    spk_sig = ed25519_sign(ed_secret, spk_b64.encode("utf-8"))
    signed_pre_key = SignedPreKeyPair(
        key_id="spk_1",
        key_pair=X25519KeyPair(public_key=spk.public_key, private_key=spk.private_key),
        signature=spk_sig,
    )

    # One-time pre-key.
    otk = ed25519_seed_to_x25519_keypair(bytes((b + 2) & 0xFF for b in seed))
    otk_b64 = to_base64(otk.public_key)
    otk_sig = ed25519_sign(ed_secret, otk_b64.encode("utf-8"))
    one_time_pre_key = PreKeyPair(
        key_id="pk_1",
        key_pair=X25519KeyPair(public_key=otk.public_key, private_key=otk.private_key),
        signature=otk_sig,
    )

    asyncio.run(store.store_signed_pre_key(signed_pre_key))
    asyncio.run(store.store_pre_key(one_time_pre_key))

    bundle = {
        "agentId": address,
        "identityKey": address,
        "signedPreKey": {
            "keyId": "spk_1",
            "publicKey": spk_b64,
            "signature": to_base64(spk_sig),
        },
        "oneTimePreKey": {
            "keyId": "pk_1",
            "publicKey": otk_b64,
            "signature": to_base64(otk_sig),
        },
        "updatedAt": "2026-01-01T00:00:00Z",
    }

    return Identity(
        address=address,
        ed25519_public_key=ed_public,
        x25519_public_key=x_identity.public_key,
        store=store,
        bundle=bundle,
    )


ALICE_SEED = bytes(range(32))
BOB_SEED = bytes(range(32, 64))


@pytest.fixture
def alice() -> Identity:
    return _make_identity(ALICE_SEED)


@pytest.fixture
def bob() -> Identity:
    return _make_identity(BOB_SEED)


def _session(identity: Identity) -> SignalSession:
    return SignalSession(identity.store, identity.x25519_public_key)


# --------------------------------------------------------------------------
# parse_key_bundle
# --------------------------------------------------------------------------


def test_parse_key_bundle_converts_and_verifies(bob: Identity) -> None:
    x3dh_bundle = parse_key_bundle(
        bob.bundle,
        ed25519_pub_to_x25519_pub(bob.ed25519_public_key),
        bob.ed25519_public_key,
    )
    # Identity key carried in X25519 form.
    assert x3dh_bundle.identity_key == bob.x25519_public_key
    assert x3dh_bundle.signed_pre_key_id == "spk_1"
    assert x3dh_bundle.one_time_pre_key_id == "pk_1"
    assert x3dh_bundle.signed_pre_key == base64.b64decode(
        bob.bundle["signedPreKey"]["publicKey"]
    )


def test_parse_key_bundle_requires_ed25519_key(bob: Identity) -> None:
    with pytest.raises(ValueError, match="Ed25519 identity key is required"):
        parse_key_bundle(
            bob.bundle, ed25519_pub_to_x25519_pub(bob.ed25519_public_key), None
        )


def test_parse_key_bundle_rejects_mismatched_x25519_identity(
    bob: Identity, alice: Identity
) -> None:
    # The supplied X25519 identity must derive from the verified Ed25519 key;
    # passing someone else's X25519 (Alice's) against Bob's Ed25519 is rejected.
    with pytest.raises(ValueError, match="does not match"):
        parse_key_bundle(
            bob.bundle,
            ed25519_pub_to_x25519_pub(alice.ed25519_public_key),
            bob.ed25519_public_key,
        )


def test_parse_key_bundle_rejects_tampered_signed_pre_key(bob: Identity) -> None:
    tampered = {**bob.bundle, "signedPreKey": {**bob.bundle["signedPreKey"]}}
    # Flip the advertised public key but keep the original signature.
    bad_key = bytearray(base64.b64decode(tampered["signedPreKey"]["publicKey"]))
    bad_key[0] ^= 0xFF
    tampered["signedPreKey"]["publicKey"] = to_base64(bytes(bad_key))
    with pytest.raises(ValueError, match="invalid Ed25519 signature"):
        parse_key_bundle(
            tampered,
            ed25519_pub_to_x25519_pub(bob.ed25519_public_key),
            bob.ed25519_public_key,
        )


def test_parse_key_bundle_without_one_time_pre_key(bob: Identity) -> None:
    bundle = {k: v for k, v in bob.bundle.items() if k != "oneTimePreKey"}
    x3dh_bundle = parse_key_bundle(
        bundle,
        ed25519_pub_to_x25519_pub(bob.ed25519_public_key),
        bob.ed25519_public_key,
    )
    assert x3dh_bundle.one_time_pre_key is None
    assert x3dh_bundle.one_time_pre_key_id is None


# --------------------------------------------------------------------------
# Full round trip
# --------------------------------------------------------------------------


def _bob_x25519(bob: Identity) -> bytes:
    return ed25519_pub_to_x25519_pub(bob.ed25519_public_key)


def _alice_x25519(alice: Identity) -> bytes:
    return ed25519_pub_to_x25519_pub(alice.ed25519_public_key)


def _envelope(from_addr: str, to_addr: str, encrypted) -> dict:
    return {
        "id": "m1",
        "from": from_addr,
        "to": to_addr,
        "deviceId": 1,
        "type": encrypted.type,
        "body": encrypted.body,
        "signal": encrypted.signal,
    }


@pytest.mark.asyncio
async def test_full_round_trip_and_reply(alice: Identity, bob: Identity) -> None:
    alice_session = _session(alice)
    bob_session = _session(bob)

    # Alice -> Bob, first message bootstraps X3DH (PREKEY_BUNDLE).
    enc1 = await alice_session.encrypt(
        bob.address,
        _bob_x25519(bob),
        b"hello bob",
        bob.bundle,
        bob.ed25519_public_key,
    )
    assert enc1.type == "PREKEY_BUNDLE"
    assert "ephemeralKey" in enc1.signal
    assert enc1.signal["signedPreKeyId"] == "spk_1"
    assert enc1.signal["oneTimePreKeyId"] == "pk_1"

    env1 = _envelope(alice.address, bob.address, enc1)
    plaintext = await bob_session.decrypt(alice.address, _alice_x25519(alice), env1)
    assert plaintext == b"hello bob"

    # Bob consumed the one-time pre-key.
    assert await bob.store.get_pre_key("pk_1") is None

    # Second Alice -> Bob message is now a plain CIPHERTEXT (session exists).
    enc2 = await alice_session.encrypt(bob.address, _bob_x25519(bob), b"second")
    assert enc2.type == "CIPHERTEXT"
    env2 = _envelope(alice.address, bob.address, enc2)
    assert await bob_session.decrypt(alice.address, _alice_x25519(alice), env2) == b"second"

    # Bob -> Alice reply (DH ratchet step on Alice's receive side).
    reply = await bob_session.encrypt(alice.address, _alice_x25519(alice), b"hi alice")
    assert reply.type == "CIPHERTEXT"
    reply_env = _envelope(bob.address, alice.address, reply)
    assert await alice_session.decrypt(bob.address, _bob_x25519(bob), reply_env) == b"hi alice"


@pytest.mark.asyncio
async def test_encrypt_without_bundle_or_session_raises(
    alice: Identity, bob: Identity
) -> None:
    alice_session = _session(alice)
    with pytest.raises(ValueError, match="No session"):
        await alice_session.encrypt(bob.address, _bob_x25519(bob), b"oops")


@pytest.mark.asyncio
async def test_has_and_remove_session(alice: Identity, bob: Identity) -> None:
    alice_session = _session(alice)
    assert not await alice_session.has_session(bob.address)
    await alice_session.encrypt(
        bob.address, _bob_x25519(bob), b"hi", bob.bundle, bob.ed25519_public_key
    )
    assert await alice_session.has_session(bob.address)
    await alice_session.remove_session(bob.address)
    assert not await alice_session.has_session(bob.address)


# --------------------------------------------------------------------------
# Persistence across a simulated restart
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_session_persists_across_restart(alice: Identity, bob: Identity) -> None:
    # First exchange establishes sessions in both stores.
    alice_session = _session(alice)
    bob_session = _session(bob)

    enc1 = await alice_session.encrypt(
        bob.address, _bob_x25519(bob), b"msg-1", bob.bundle, bob.ed25519_public_key
    )
    env1 = _envelope(alice.address, bob.address, enc1)
    assert await bob_session.decrypt(alice.address, _alice_x25519(alice), env1) == b"msg-1"

    # "Restart": drop the live SignalSession objects and rebuild them from the
    # SAME stores. The Double Ratchet state must come back from the store.
    alice_resumed = SignalSession(alice.store, alice.x25519_public_key)
    bob_resumed = SignalSession(bob.store, bob.x25519_public_key)

    enc2 = await alice_resumed.encrypt(bob.address, _bob_x25519(bob), b"msg-2")
    assert enc2.type == "CIPHERTEXT"  # session resumed, not re-bootstrapped
    env2 = _envelope(alice.address, bob.address, enc2)
    assert await bob_resumed.decrypt(alice.address, _alice_x25519(alice), env2) == b"msg-2"

    reply = await bob_resumed.encrypt(alice.address, _alice_x25519(alice), b"reply")
    reply_env = _envelope(bob.address, alice.address, reply)
    assert (
        await alice_resumed.decrypt(bob.address, _bob_x25519(bob), reply_env) == b"reply"
    )


# --------------------------------------------------------------------------
# Deterministic known-answer (pins the first-message wire shape).
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_known_answer_first_message(alice: Identity, bob: Identity) -> None:
    alice_session = _session(alice)
    enc = await alice_session.encrypt(
        bob.address,
        _bob_x25519(bob),
        b"hello bob",
        bob.bundle,
        bob.ed25519_public_key,
    )
    assert enc.type == "PREKEY_BUNDLE"
    assert enc.signal["messageNumber"] == 0
    assert enc.signal["previousChainLength"] == 0
    # ratchetKey is the session's send public key; base64 of 32 bytes.
    assert len(base64.b64decode(enc.signal["ratchetKey"])) == 32
    # ephemeralKey is the X3DH ephemeral public key (32 bytes).
    assert len(base64.b64decode(enc.signal["ephemeralKey"])) == 32
    # Round-trips to the byte-for-byte same plaintext under a fresh Bob.
    bob_session = _session(bob)
    env = _envelope(alice.address, bob.address, enc)
    assert await bob_session.decrypt(alice.address, _alice_x25519(alice), env) == b"hello bob"


# --------------------------------------------------------------------------
# Message wiring over a mocked HTTP layer (FakeSession pattern).
# --------------------------------------------------------------------------


def _client(responses: list[FakeResponse]) -> tuple[TinyPlaceClient, FakeSession]:
    signer = LocalSigner.generate()
    fake = FakeSession(responses)
    client = TinyPlaceClient(
        base_url="https://relay.test",
        signer=signer,
        session=fake,
    )
    return client, fake


@pytest.mark.asyncio
async def test_send_encrypted_first_message_fetches_bundle(
    alice: Identity, bob: Identity
) -> None:
    # GET /keys/<bob>/bundle, then PUT /messages.
    client, fake = _client(
        [
            FakeResponse(200, bob.bundle),
            FakeResponse(200, {"ok": True}),
        ]
    )
    alice_session = _session(alice)

    await client.messages.send_encrypted(
        alice_session, alice.address, bob.address, b"hello over the wire"
    )

    # The bundle was fetched, then the encrypted envelope PUT.
    assert any("/bundle" in r["url"] for r in fake.requests)
    put = next(r for r in fake.requests if r["method"] == "PUT")
    body = json.loads(put["data"])
    assert body["type"] == "PREKEY_BUNDLE"
    assert body["from"] == alice.address
    assert body["to"] == bob.address
    assert body["deviceId"] == 1
    assert "ratchetKey" in body["signal"]
    await client.close()


@pytest.mark.asyncio
async def test_send_and_poll_decrypted_round_trip(
    alice: Identity, bob: Identity
) -> None:
    # Alice encrypts an envelope (no HTTP needed for the crypto itself).
    alice_session = _session(alice)
    enc = await alice_session.encrypt(
        bob.address, _bob_x25519(bob), b"wire round trip", bob.bundle, bob.ed25519_public_key
    )
    envelope = _envelope(alice.address, bob.address, enc)
    envelope["timestamp"] = "2026-06-16T00:00:00Z"

    # Bob's client lists his mailbox (one envelope), then acknowledges it.
    client, fake = _client(
        [
            FakeResponse(200, {"messages": [envelope]}),
            FakeResponse(200, {}),  # acknowledge
        ]
    )
    bob_session = _session(bob)

    # acknowledge defaults to False; opt in so the message is deleted after read.
    decrypted = await client.messages.poll_inbox_decrypted(
        bob_session, bob.address, acknowledge=True
    )
    assert len(decrypted) == 1
    msg = decrypted[0]
    assert isinstance(msg, DecryptedMessage)
    assert msg.plaintext == b"wire round trip"
    assert msg.sender == alice.address
    # The message was acknowledged (DELETE issued).
    assert any(r["method"] == "DELETE" for r in fake.requests)
    await client.close()


@pytest.mark.asyncio
async def test_poll_decrypted_does_not_acknowledge_by_default(
    alice: Identity, bob: Identity
) -> None:
    # Default acknowledge=False: the message is returned but NOT deleted, so the
    # caller can durably persist it before opting into acknowledgement.
    alice_session = _session(alice)
    enc = await alice_session.encrypt(
        bob.address, _bob_x25519(bob), b"keep me", bob.bundle, bob.ed25519_public_key
    )
    envelope = _envelope(alice.address, bob.address, enc)
    envelope["timestamp"] = "2026-06-16T00:00:00Z"

    client, fake = _client([FakeResponse(200, {"messages": [envelope]})])
    bob_session = _session(bob)

    decrypted = await client.messages.poll_inbox_decrypted(bob_session, bob.address)
    assert len(decrypted) == 1
    assert decrypted[0].plaintext == b"keep me"
    # No DELETE was issued — the relay copy is preserved.
    assert not any(r["method"] == "DELETE" for r in fake.requests)
    await client.close()


@pytest.mark.asyncio
async def test_poll_decrypted_skips_undecryptable(
    alice: Identity, bob: Identity
) -> None:
    # A garbage envelope that cannot be decrypted must be skipped (and acked),
    # not abort the batch.
    bad = {
        "id": "bad1",
        "from": alice.address,
        "to": bob.address,
        "deviceId": 1,
        "type": "CIPHERTEXT",
        "body": to_base64(b"not a real ciphertext"),
        "signal": {"ratchetKey": to_base64(b"\x01" * 32), "messageNumber": 0, "previousChainLength": 0},
        "timestamp": "2026-06-16T00:00:00Z",
    }
    client, fake = _client(
        [
            FakeResponse(200, {"messages": [bad]}),
            FakeResponse(200, {}),  # acknowledge the undecryptable message
        ]
    )
    bob_session = _session(bob)

    errors: list[tuple[dict, Exception]] = []
    decrypted = await client.messages.poll_inbox_decrypted(
        bob_session,
        bob.address,
        acknowledge=True,
        on_error=lambda env, exc: errors.append((env, exc)),
    )
    assert decrypted == []
    assert len(errors) == 1
    assert any(r["method"] == "DELETE" for r in fake.requests)
    await client.close()
