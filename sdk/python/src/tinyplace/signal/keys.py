"""Signal Protocol key management and prekey bundles (issue #42).

Ported from ``sdk/typescript/src/signal/keys.ts``. This module covers only key
*material*: the X25519 identity / signed-prekey / one-time-prekey key pairs, the
Ed25519 signatures over them, the publishable prekey-bundle wire shape, and
signed-prekey signature verification. It performs no network calls and does not
depend on the in-flight ``signal/crypto`` slice; it builds directly on PyNaCl
and the existing :class:`tinyplace.signer.Signer`.

Signing scheme (must match the Go backend, ``internal/signal/keys.go``):
the backend verifies ``ed25519.Verify(identityPubKey, []byte(key.PublicKey),
signature)`` where ``key.PublicKey`` is the **base64 string** of the X25519
public key. So we sign the UTF-8 bytes of that base64 string, never the raw
key bytes.
"""

from __future__ import annotations

import base64
from typing import Optional

from nacl.exceptions import BadSignatureError
from nacl.public import PrivateKey
from nacl.signing import VerifyKey

from ..crypto import public_key_to_base64
from ..signer import Signer
from .types import PreKeyPair, SignedPreKeyPair, X25519KeyPair


def generate_x25519_key_pair() -> X25519KeyPair:
    """Generate a fresh random X25519 (Curve25519) key pair."""
    private_key = PrivateKey.generate()
    return X25519KeyPair(
        public_key=bytes(private_key.public_key),
        private_key=bytes(private_key),
    )


async def _sign_public_key(signer: Signer, public_key: bytes) -> bytes:
    """Sign the base64 representation of an X25519 public key.

    Mirrors ``signPublicKey`` in the TS SDK: the backend verifies the signature
    against ``[]byte(base64PublicKey)``, so we sign the UTF-8 bytes of the
    base64 string rather than the raw key.
    """
    public_key_b64 = public_key_to_base64(public_key)
    return await signer.sign(public_key_b64.encode("utf-8"))


async def generate_signed_pre_key(signer: Signer, key_id: str) -> SignedPreKeyPair:
    """Generate a signed pre-key signed by the identity ``signer``."""
    key_pair = generate_x25519_key_pair()
    signature = await _sign_public_key(signer, key_pair.public_key)
    return SignedPreKeyPair(key_id=key_id, key_pair=key_pair, signature=signature)


async def generate_pre_keys(
    signer: Signer,
    start_id: int,
    count: int,
) -> list[PreKeyPair]:
    """Generate ``count`` one-time pre-keys with ids ``pk_<start_id + i>``."""
    pre_keys: list[PreKeyPair] = []
    for i in range(count):
        key_id = f"pk_{start_id + i}"
        key_pair = generate_x25519_key_pair()
        signature = await _sign_public_key(signer, key_pair.public_key)
        pre_keys.append(PreKeyPair(key_id=key_id, key_pair=key_pair, signature=signature))
    return pre_keys


def serialize_signed_key(pre_key: SignedPreKeyPair) -> dict[str, str]:
    """Serialize a signed pre-key into the backend ``SignedKey`` wire shape."""
    return {
        "keyId": pre_key.key_id,
        "publicKey": public_key_to_base64(pre_key.key_pair.public_key),
        "signature": public_key_to_base64(pre_key.signature),
    }


def serialize_pre_key(pre_key: PreKeyPair) -> dict[str, str]:
    """Serialize a one-time pre-key into the backend ``SignedKey`` wire shape."""
    return {
        "keyId": pre_key.key_id,
        "publicKey": public_key_to_base64(pre_key.key_pair.public_key),
        "signature": public_key_to_base64(pre_key.signature),
    }


def build_pre_keys_request(
    pre_keys: list[PreKeyPair],
    identity_key: Optional[str] = None,
) -> dict[str, object]:
    """Build the ``PreKeysRequest`` body for ``KeysApi.upload_pre_keys``."""
    request: dict[str, object] = {"preKeys": [serialize_pre_key(pk) for pk in pre_keys]}
    if identity_key is not None:
        request["identityKey"] = identity_key
    return request


def build_signed_pre_key_request(
    signed_pre_key: SignedPreKeyPair,
    identity_key: Optional[str] = None,
) -> dict[str, object]:
    """Build the ``SignedPreKeyRequest`` body for ``KeysApi.rotate_signed_pre_key``."""
    request: dict[str, object] = {"signedPreKey": serialize_signed_key(signed_pre_key)}
    if identity_key is not None:
        request["identityKey"] = identity_key
    return request


def build_key_bundle(
    agent_id: str,
    identity_key: str,
    signed_pre_key: SignedPreKeyPair,
    one_time_pre_key: Optional[PreKeyPair] = None,
) -> dict[str, object]:
    """Build a publishable ``KeyBundle`` (the X3DH prekey bundle wire shape).

    ``identity_key`` is the base64 Ed25519 identity public key
    (``Signer.public_key_base64``). An optional one-time pre-key is included
    only when present, matching the backend's ``omitempty`` field.
    """
    bundle: dict[str, object] = {
        "agentId": agent_id,
        "identityKey": identity_key,
        "signedPreKey": serialize_signed_key(signed_pre_key),
    }
    if one_time_pre_key is not None:
        bundle["oneTimePreKey"] = serialize_pre_key(one_time_pre_key)
    return bundle


def _decode_key_bytes(value: str, expected_len: int | None = None) -> bytes:
    """Decode a key/signature string the way the backend's ``decodeKeyBytes`` does.

    Supports ``base64:``/``hex:`` prefixes. For a bare (unprefixed) value the
    base64 and hex alphabets overlap — a hex string is also valid base64 and
    decodes to the wrong length — so when an ``expected_len`` is known we return
    whichever decoding yields it, trying base64 first to match the backend's
    preference. Without an expected length we keep the base64-first fallback.
    """
    value = value.strip()
    if value == "":
        raise ValueError("empty key value")
    if value.startswith("base64:"):
        return base64.standard_b64decode(value[len("base64:") :])
    if value.startswith("hex:"):
        return bytes.fromhex(value[len("hex:") :])
    candidates: list[bytes] = []
    try:
        candidates.append(base64.standard_b64decode(value))
    except (ValueError, base64.binascii.Error):
        pass
    try:
        candidates.append(bytes.fromhex(value))
    except ValueError:
        pass
    if not candidates:
        raise ValueError("could not decode key value as base64 or hex")
    if expected_len is not None:
        for candidate in candidates:
            if len(candidate) == expected_len:
                return candidate
    return candidates[0]


def verify_pre_key_signature(identity_key: str, signed_key: dict[str, object]) -> bool:
    """Verify a fetched signed-prekey (or one-time prekey) signature.

    Mirrors the backend's ``validSignedKeyForIdentity``: the ``signature`` must
    be a valid Ed25519 signature, by the private key behind ``identity_key``,
    over the UTF-8 bytes of the ``publicKey`` base64 string. ``identity_key`` may
    be base64- or hex-encoded (optionally with a ``base64:``/``hex:`` prefix).

    Returns ``False`` on any malformed input or signature mismatch.
    """
    if not isinstance(signed_key, dict) or not isinstance(identity_key, str):
        return False
    public_key = signed_key.get("publicKey")
    signature = signed_key.get("signature")
    key_id = signed_key.get("keyId")
    if not isinstance(public_key, str) or public_key.strip() == "":
        return False
    if not isinstance(signature, str) or signature.strip() == "":
        return False
    if not isinstance(key_id, str) or key_id.strip() == "":
        return False
    try:
        identity_bytes = _decode_key_bytes(identity_key, 32)
        if len(identity_bytes) != 32:
            return False
        signature_bytes = _decode_key_bytes(signature, 64)
        if len(signature_bytes) != 64:
            return False
        verify_key = VerifyKey(identity_bytes)
        verify_key.verify(public_key.encode("utf-8"), signature_bytes)
        return True
    except (ValueError, BadSignatureError):
        return False
