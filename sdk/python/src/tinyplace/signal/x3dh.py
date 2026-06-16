"""X3DH key agreement for the Signal Protocol port (issue #44).

A byte-compatible Python port of the TypeScript SDK's
``sdk/typescript/src/signal/x3dh.ts``. X3DH ("Extended Triple Diffie-Hellman")
derives the initial shared secret that seeds the Double Ratchet's root key from
a fetched pre-key bundle.

The DH order, the HKDF salt/info strings and the leading 32-byte 0xFF padding
all mirror the reference implementation exactly so an initial message produced
by one SDK can be consumed by the other:

* DH: X25519, via :func:`tinyplace.signal.crypto.x25519_shared_secret`
* KDF: HKDF-SHA256 with a 32-byte zero salt and the ``"WhisperText"`` info,
  prefixed by 32 bytes of ``0xFF`` cryptographic-domain padding.

This slice covers *only* the X3DH agreement (initiator + responder) and the
associated-data construction. The Double Ratchet, session and sender-key layers
land in later slices; the :class:`SessionState` returned here is the handoff to
the ratchet's root key.
"""

from __future__ import annotations

from dataclasses import dataclass

from .crypto import (
    ed25519_verify,
    from_base64,
    generate_x25519_keypair,
    hkdf,
    x25519_shared_secret,
)
from .store import SessionState
from .store import X25519KeyPair as SessionKeyPair
from .types import X25519KeyPair

__all__ = [
    "X3DHBundle",
    "X3DHInitResult",
    "x3dh_initiate",
    "x3dh_respond",
    "build_associated_data",
    "verify_pre_key_signature_raw",
]

# Domain-separation constants — must match x3dh.ts byte-for-byte.
_X3DH_INFO = b"WhisperText"
# 32 bytes of 0xFF prepended to the concatenated DH outputs, per the X3DH spec
# ("a byte sequence of F[i]" of the curve type), mirroring the reference SDK.
_PADDING = b"\xff" * 32
# HKDF salt: 32 zero bytes (the noble default; crypto.hkdf maps b"" to this too,
# but we pass it explicitly for clarity / parity with x3dh.ts).
_SALT = b"\x00" * 32


@dataclass(frozen=True)
class X3DHBundle:
    """A fetched, signature-verified pre-key bundle for an X3DH initiation.

    Mirrors the TypeScript ``X3DHBundle`` interface. ``identity_key``,
    ``signed_pre_key`` and the optional ``one_time_pre_key`` are raw 32-byte
    X25519 public keys (the peer's identity key is its *X25519* form, already
    converted from the Ed25519 addressing key by the caller / session layer).
    """

    identity_key: bytes
    signed_pre_key_id: str
    signed_pre_key: bytes
    one_time_pre_key_id: str | None = None
    one_time_pre_key: bytes | None = None


@dataclass(frozen=True)
class X3DHInitResult:
    """The result of an X3DH initiation.

    ``session`` carries the derived root key into the (future) Double Ratchet.
    ``ephemeral_public_key`` plus the pre-key ids must be sent to the responder
    in the initial ``PREKEY_BUNDLE`` message so it can reproduce the agreement.
    """

    session: SessionState
    ephemeral_public_key: bytes
    signed_pre_key_id: str
    one_time_pre_key_id: str | None = None


def x3dh_initiate(
    our_identity_key_pair: X25519KeyPair,
    their_bundle: X3DHBundle,
) -> X3DHInitResult:
    """Run X3DH as the initiator (Alice) against a fetched pre-key bundle.

    Generates a fresh ephemeral key, performs the three (or four) Diffie-Hellman
    operations in the exact order the reference SDK uses, and derives the shared
    secret that becomes the initial root key. Mirrors ``x3dhInitiate`` in
    ``x3dh.ts``.

    Args:
        our_identity_key_pair: Our long-term X25519 identity key pair.
        their_bundle: The peer's verified :class:`X3DHBundle`.

    Returns:
        An :class:`X3DHInitResult` whose ``session`` holds the derived root key
        and whose public material must be relayed to the responder.
    """
    ephemeral = generate_x25519_keypair()

    # DH1: our identity <-> their signed pre-key
    dh1 = x25519_shared_secret(our_identity_key_pair.private_key, their_bundle.signed_pre_key)
    # DH2: our ephemeral <-> their identity
    dh2 = x25519_shared_secret(ephemeral.private_key, their_bundle.identity_key)
    # DH3: our ephemeral <-> their signed pre-key
    dh3 = x25519_shared_secret(ephemeral.private_key, their_bundle.signed_pre_key)

    if their_bundle.one_time_pre_key is not None:
        # DH4: our ephemeral <-> their one-time pre-key
        dh4 = x25519_shared_secret(ephemeral.private_key, their_bundle.one_time_pre_key)
        dh_concat = _PADDING + dh1 + dh2 + dh3 + dh4
    else:
        dh_concat = _PADDING + dh1 + dh2 + dh3

    shared_secret = hkdf(dh_concat, _SALT, _X3DH_INFO, 32)

    send_key_pair = generate_x25519_keypair()
    session = SessionState(
        dh_send_key_pair=SessionKeyPair(
            public_key=send_key_pair.public_key,
            private_key=send_key_pair.private_key,
        ),
        dh_recv_public_key=their_bundle.signed_pre_key,
        root_key=shared_secret,
        send_chain_key=None,
        recv_chain_key=None,
        send_message_number=0,
        recv_message_number=0,
        previous_chain_length=0,
    )

    return X3DHInitResult(
        session=session,
        ephemeral_public_key=ephemeral.public_key,
        signed_pre_key_id=their_bundle.signed_pre_key_id,
        one_time_pre_key_id=their_bundle.one_time_pre_key_id,
    )


def x3dh_respond(
    our_identity_key_pair: X25519KeyPair,
    our_signed_pre_key_pair: X25519KeyPair,
    their_identity_key: bytes,
    their_ephemeral_key: bytes,
    our_one_time_pre_key_pair: X25519KeyPair | None = None,
) -> SessionState:
    """Run X3DH as the responder (Bob) given the initiator's public material.

    Reproduces the same DH outputs as :func:`x3dh_initiate` (with the roles of
    each key swapped so both sides reach the *same* shared secret) and derives
    the initial root key. Mirrors ``x3dhRespond`` in ``x3dh.ts``.

    Args:
        our_identity_key_pair: Our long-term X25519 identity key pair.
        our_signed_pre_key_pair: The signed pre-key the initiator selected.
        their_identity_key: The initiator's raw X25519 identity public key.
        their_ephemeral_key: The initiator's raw X25519 ephemeral public key.
        our_one_time_pre_key_pair: The one-time pre-key the initiator consumed,
            if any. Must be supplied iff the initiator's bundle carried one.

    Returns:
        A :class:`SessionState` holding the derived root key.
    """
    # DH1: their identity <-> our signed pre-key
    dh1 = x25519_shared_secret(our_signed_pre_key_pair.private_key, their_identity_key)
    # DH2: their ephemeral <-> our identity
    dh2 = x25519_shared_secret(our_identity_key_pair.private_key, their_ephemeral_key)
    # DH3: their ephemeral <-> our signed pre-key
    dh3 = x25519_shared_secret(our_signed_pre_key_pair.private_key, their_ephemeral_key)

    if our_one_time_pre_key_pair is not None:
        # DH4: their ephemeral <-> our one-time pre-key
        dh4 = x25519_shared_secret(our_one_time_pre_key_pair.private_key, their_ephemeral_key)
        dh_concat = _PADDING + dh1 + dh2 + dh3 + dh4
    else:
        dh_concat = _PADDING + dh1 + dh2 + dh3

    shared_secret = hkdf(dh_concat, _SALT, _X3DH_INFO, 32)

    return SessionState(
        dh_send_key_pair=SessionKeyPair(
            public_key=our_signed_pre_key_pair.public_key,
            private_key=our_signed_pre_key_pair.private_key,
        ),
        dh_recv_public_key=None,
        root_key=shared_secret,
        send_chain_key=None,
        recv_chain_key=None,
        send_message_number=0,
        recv_message_number=0,
        previous_chain_length=0,
    )


def build_associated_data(
    sender_identity_key: bytes,
    recipient_identity_key: bytes,
) -> bytes:
    """Build the AEAD associated data binding sender and recipient identities.

    The associated data is ``sender_identity_key || recipient_identity_key``,
    matching ``buildAssociatedData`` in ``x3dh.ts``. It binds each ciphertext to
    the two long-term identities so a relay cannot replay it into a different
    conversation.
    """
    return sender_identity_key + recipient_identity_key


def verify_pre_key_signature_raw(
    identity_ed25519_public_key: bytes,
    pre_key_public_key_base64: str,
    signature_base64: str | None,
    label: str,
) -> None:
    """Verify a fetched pre-key was signed by the peer's Ed25519 identity key.

    Raw-bytes port of ``verifyPreKeySignature`` in ``x3dh.ts`` (the
    :func:`tinyplace.signal.keys.verify_pre_key_signature` variant works on the
    backend's dict wire shape; this one mirrors the x3dh.ts signature for the
    session layer). The signed message is the UTF-8 bytes of the base64-encoded
    X25519 public key, exactly as the Go backend verifies
    (``ed25519.Verify(identityPubKey, []byte(base64(preKey)), signature)``).

    The Ed25519 identity key MUST come from the caller's trusted addressing of
    the peer, never from the served bundle, so a malicious relay cannot
    substitute attacker-controlled pre-keys (MITM / unknown-key-share).

    Args:
        identity_ed25519_public_key: The peer's long-term Ed25519 identity
            public key (the addressing key), NOT its derived X25519 key.
        pre_key_public_key_base64: The base64 X25519 pre-key public key, carried
            verbatim in the fetched bundle.
        signature_base64: The base64 Ed25519 signature over the pre-key.
        label: A human-readable label for the pre-key (for error messages).

    Raises:
        ValueError: if the signature is missing or invalid.
    """
    if not signature_base64:
        raise ValueError(
            f"Key bundle rejected: {label} is missing its Ed25519 signature"
        )
    signed_message = pre_key_public_key_base64.encode("utf-8")
    try:
        signature = from_base64(signature_base64)
        valid = ed25519_verify(identity_ed25519_public_key, signed_message, signature)
    except Exception:
        valid = False
    if not valid:
        raise ValueError(f"Key bundle rejected: invalid Ed25519 signature on {label}")
