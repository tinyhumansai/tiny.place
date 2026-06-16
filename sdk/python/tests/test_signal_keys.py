from __future__ import annotations

import base64

import pytest

from tinyplace.signal import (
    PreKeyPair,
    SignedPreKeyPair,
    X25519KeyPair,
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
from tinyplace.signer import LocalSigner


@pytest.fixture
def signer() -> LocalSigner:
    return LocalSigner.from_seed(b"\x01" * 32)


def test_generate_x25519_key_pair_is_random_and_well_formed() -> None:
    a = generate_x25519_key_pair()
    b = generate_x25519_key_pair()
    assert isinstance(a, X25519KeyPair)
    assert len(a.public_key) == 32
    assert len(a.private_key) == 32
    assert a.private_key != b.private_key
    assert a.public_key != b.public_key


async def test_generate_signed_pre_key_round_trips(signer: LocalSigner) -> None:
    signed = await generate_signed_pre_key(signer, "spk_1")
    assert isinstance(signed, SignedPreKeyPair)
    assert signed.key_id == "spk_1"
    assert len(signed.signature) == 64

    serialized = serialize_signed_key(signed)
    # generate -> verify round trip against the identity public key.
    assert verify_pre_key_signature(signer.public_key_base64, serialized) is True


async def test_generate_pre_keys_ids_and_signatures(signer: LocalSigner) -> None:
    pre_keys = await generate_pre_keys(signer, start_id=5, count=3)
    assert [pk.key_id for pk in pre_keys] == ["pk_5", "pk_6", "pk_7"]
    for pk in pre_keys:
        assert isinstance(pk, PreKeyPair)
        assert verify_pre_key_signature(signer.public_key_base64, serialize_pre_key(pk)) is True


async def test_serialized_signed_key_matches_backend_shape(signer: LocalSigner) -> None:
    signed = await generate_signed_pre_key(signer, "spk_42")
    serialized = serialize_signed_key(signed)
    # Backend models.SignedKey: keyId / publicKey / signature, all base64.
    assert set(serialized.keys()) == {"keyId", "publicKey", "signature"}
    assert serialized["keyId"] == "spk_42"
    assert base64.standard_b64decode(serialized["publicKey"]) == signed.key_pair.public_key
    assert base64.standard_b64decode(serialized["signature"]) == signed.signature


async def test_build_key_bundle_with_one_time_prekey(signer: LocalSigner) -> None:
    signed = await generate_signed_pre_key(signer, "spk_1")
    one_time = (await generate_pre_keys(signer, 1, 1))[0]
    bundle = build_key_bundle(
        agent_id=signer.agent_id,
        identity_key=signer.public_key_base64,
        signed_pre_key=signed,
        one_time_pre_key=one_time,
    )
    assert bundle["agentId"] == signer.agent_id
    assert bundle["identityKey"] == signer.public_key_base64
    assert bundle["signedPreKey"] == serialize_signed_key(signed)
    assert bundle["oneTimePreKey"] == serialize_pre_key(one_time)
    # A fetched bundle's signed-prekey signature must verify.
    assert verify_pre_key_signature(bundle["identityKey"], bundle["signedPreKey"]) is True


async def test_build_key_bundle_without_one_time_prekey(signer: LocalSigner) -> None:
    signed = await generate_signed_pre_key(signer, "spk_1")
    bundle = build_key_bundle(signer.agent_id, signer.public_key_base64, signed)
    assert "oneTimePreKey" not in bundle


async def test_build_pre_keys_request_matches_upload_shape(signer: LocalSigner) -> None:
    pre_keys = await generate_pre_keys(signer, 1, 2)
    request = build_pre_keys_request(pre_keys, identity_key=signer.public_key_base64)
    # Matches models.PreKeysRequest consumed by KeysApi.upload_pre_keys.
    assert request["identityKey"] == signer.public_key_base64
    assert request["preKeys"] == [serialize_pre_key(pk) for pk in pre_keys]

    without_identity = build_pre_keys_request(pre_keys)
    assert "identityKey" not in without_identity
    assert without_identity["preKeys"] == [serialize_pre_key(pk) for pk in pre_keys]


async def test_build_signed_pre_key_request_matches_rotate_shape(signer: LocalSigner) -> None:
    signed = await generate_signed_pre_key(signer, "spk_1")
    request = build_signed_pre_key_request(signed, identity_key=signer.public_key_base64)
    # Matches models.SignedPreKeyRequest consumed by KeysApi.rotate_signed_pre_key.
    assert request["identityKey"] == signer.public_key_base64
    assert request["signedPreKey"] == serialize_signed_key(signed)

    without_identity = build_signed_pre_key_request(signed)
    assert "identityKey" not in without_identity


async def test_verify_accepts_prefixed_and_hex_identity_keys(signer: LocalSigner) -> None:
    signed = await generate_signed_pre_key(signer, "spk_1")
    serialized = serialize_signed_key(signed)
    identity_bytes = signer.public_key

    base64_prefixed = "base64:" + base64.standard_b64encode(identity_bytes).decode()
    hex_prefixed = "hex:" + identity_bytes.hex()

    # base64:/hex: prefixes are unambiguous (matches backend decodeKeyBytes).
    assert verify_pre_key_signature(base64_prefixed, serialized) is True
    assert verify_pre_key_signature(hex_prefixed, serialized) is True
    # Bare base64 (the default identity encoding) verifies too.
    assert verify_pre_key_signature(signer.public_key_base64, serialized) is True
    # Bare (unprefixed) hex also verifies: a 64-char hex key is valid base64
    # too, so the decoder is length-aware and picks the 32-byte interpretation.
    assert verify_pre_key_signature(identity_bytes.hex(), serialized) is True


def test_verify_fails_closed_on_wrong_types() -> None:
    # Non-dict signed_key and non-str identity_key must return False, not raise.
    assert verify_pre_key_signature("identity", None) is False  # type: ignore[arg-type]
    assert verify_pre_key_signature("identity", ["not", "a", "dict"]) is False  # type: ignore[arg-type]
    assert verify_pre_key_signature(None, {"keyId": "x"}) is False  # type: ignore[arg-type]
    assert verify_pre_key_signature(b"bytes-not-str", {"keyId": "x"}) is False  # type: ignore[arg-type]


async def test_verify_accepts_hex_prefixed_signature(signer: LocalSigner) -> None:
    signed = await generate_signed_pre_key(signer, "spk_1")
    serialized = serialize_signed_key(signed)
    # A hex:-prefixed signature exercises the hex decode branch unambiguously.
    serialized["signature"] = "hex:" + signed.signature.hex()
    assert verify_pre_key_signature(signer.public_key_base64, serialized) is True


def test_verify_handles_non_base64_non_hex_signature(signer: LocalSigner) -> None:
    # A value that is neither valid base64 nor valid hex falls through the
    # bare-base64 attempt into the hex fallback, which raises -> False.
    signed_key = {
        "keyId": "spk_1",
        "publicKey": base64.standard_b64encode(b"\x00" * 32).decode(),
        "signature": "zzz!!!notbase64nothex",
    }
    assert verify_pre_key_signature(signer.public_key_base64, signed_key) is False


async def test_verify_rejects_tampered_or_malformed(signer: LocalSigner) -> None:
    signed = await generate_signed_pre_key(signer, "spk_1")
    serialized = serialize_signed_key(signed)

    # Wrong identity key -> signature does not verify.
    other = LocalSigner.from_seed(b"\x02" * 32)
    assert verify_pre_key_signature(other.public_key_base64, serialized) is False

    # Tampered public key.
    tampered = dict(serialized)
    tampered["publicKey"] = base64.standard_b64encode(b"\x00" * 32).decode()
    assert verify_pre_key_signature(signer.public_key_base64, tampered) is False

    # Missing / empty fields.
    assert verify_pre_key_signature(signer.public_key_base64, {**serialized, "signature": ""}) is False
    assert verify_pre_key_signature(signer.public_key_base64, {**serialized, "publicKey": ""}) is False
    assert verify_pre_key_signature(signer.public_key_base64, {**serialized, "keyId": ""}) is False
    assert verify_pre_key_signature(signer.public_key_base64, {"keyId": "x"}) is False

    # Malformed identity key (wrong length).
    short_identity = base64.standard_b64encode(b"\x00" * 16).decode()
    assert verify_pre_key_signature(short_identity, serialized) is False
    # Non-decodable identity key.
    assert verify_pre_key_signature("not-valid-key!!", serialized) is False
    # Empty identity key.
    assert verify_pre_key_signature("", serialized) is False
    assert verify_pre_key_signature("   ", serialized) is False
    # Malformed signature (wrong length).
    bad_sig = {**serialized, "signature": base64.standard_b64encode(b"\x00" * 10).decode()}
    assert verify_pre_key_signature(signer.public_key_base64, bad_sig) is False
