"""1:1 Signal session layer for the tiny.place Python SDK (issue #46).

A byte-compatible Python port of the TypeScript SDK's
``sdk/typescript/src/signal/session.ts``. This is the layer that ties the three
lower slices together into a usable conversation:

* :mod:`tinyplace.signal.x3dh` — the initial key agreement that seeds a session
  from a fetched pre-key bundle.
* :mod:`tinyplace.signal.ratchet` — the Double Ratchet that advances per message.
* :mod:`tinyplace.signal.store` — the persistence contract a session reads and
  writes its per-peer :class:`~tinyplace.signal.store.SessionState` through.

The public surface mirrors ``session.ts``:

* :func:`parse_key_bundle` — verify a fetched :class:`KeyBundle` against the
  peer's *Ed25519* identity key and convert it into an
  :class:`~tinyplace.signal.x3dh.X3DHBundle` (with the peer's identity key in
  *X25519* form). Issue #44 intentionally deferred this here.
* :class:`SignalSession.encrypt` — produce an :class:`EncryptedMessage`
  (``PREKEY_BUNDLE`` for the first message to a peer, ``CIPHERTEXT`` after).
* :class:`SignalSession.decrypt` — consume a :class:`MessageEnvelope` and return
  the plaintext, processing the X3DH responder side for a ``PREKEY_BUNDLE``.

The ``signal`` metadata that travels on the wire uses the camelCase field names
the backend (``pkg/models.SignalMetadata``) and TS SDK agree on: ``ratchetKey``,
``messageNumber``, ``previousChainLength``, ``ephemeralKey``, ``signedPreKeyId``,
``oneTimePreKeyId``.

Crypto / X3DH / ratchet primitives are reused verbatim; this module never
reimplements them. ``crypto`` and ``store`` each define a field-identical
``X25519KeyPair``; per #46's scope note we convert between them locally (as
``ratchet.py``'s ``_to_store_key_pair`` does) rather than unifying the type
across the package — that cleanup is left as a documented seam.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Mapping, Optional

from .crypto import X25519KeyPair as CryptoKeyPair
from .crypto import ed25519_pub_to_x25519_pub, from_base64, to_base64
from .ratchet import (
    RatchetHeader,
    RatchetMessage,
    ratchet_decrypt,
    ratchet_encrypt,
)
from .store import SessionState, SessionStore
from .store import X25519KeyPair as StoreKeyPair
from .x3dh import (
    X3DHBundle,
    build_associated_data,
    verify_pre_key_signature_raw,
    x3dh_initiate,
    x3dh_respond,
)

__all__ = [
    "EncryptedMessage",
    "SignalSession",
    "parse_key_bundle",
]


@dataclass(frozen=True)
class EncryptedMessage:
    """The encrypted payload for a single outbound message.

    Mirrors the TypeScript ``EncryptedMessage`` interface. ``body`` is the
    base64 ratchet ciphertext, ``type`` is ``"PREKEY_BUNDLE"`` for the first
    message to a peer (carrying the X3DH bootstrap material) or ``"CIPHERTEXT"``
    thereafter, and ``signal`` is the ``SignalMetadata`` dict that travels in the
    envelope's ``signal`` field.
    """

    body: str
    type: str
    signal: dict[str, Any]


class SignalSession:
    """A long-lived 1:1 Signal session, persisted via a :class:`SessionStore`.

    Mirrors the TypeScript ``SignalSession`` class. One instance is bound to an
    agent's identity and its session store; it manages the per-peer session
    lifecycle (establish-from-bundle, encrypt, decrypt) so call sites never touch
    X3DH or the ratchet directly. All session state lives in the store, so the
    session survives a restart: a fresh :class:`SignalSession` over the same
    store resumes every conversation.

    Args:
        store: The persistence backend for sessions, pre-keys and identity.
        our_identity_public_key: Our long-term *X25519* identity public key, used
            to build the AEAD associated data that binds each ciphertext to the
            two conversation identities.
    """

    def __init__(
        self, store: SessionStore, our_identity_public_key: bytes
    ) -> None:
        self._store = store
        self._our_identity_public_key = our_identity_public_key
        # Per-peer locks serialize the load -> ratchet -> store critical section
        # so two concurrent encrypts/decrypts to the same peer cannot read the
        # same state and emit duplicate ratchet message numbers or lose a skipped
        # key. (A cross-process durable store would additionally need CAS/txns.)
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock_for(self, address: str) -> asyncio.Lock:
        lock = self._locks.get(address)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[address] = lock
        return lock

    async def encrypt(
        self,
        recipient_address: str,
        recipient_identity_key: bytes,
        plaintext: bytes,
        recipient_bundle: Optional[Mapping[str, Any]] = None,
        recipient_identity_ed25519_key: Optional[bytes] = None,
    ) -> EncryptedMessage:
        """Encrypt ``plaintext`` for ``recipient_address``.

        If no session exists yet and a ``recipient_bundle`` is supplied, runs
        X3DH to bootstrap one (this is the first ``PREKEY_BUNDLE`` message); the
        returned ``signal`` then also carries the ephemeral key and pre-key ids
        the responder needs. Otherwise the existing ratchet session is advanced
        and a ``CIPHERTEXT`` message is produced. Mirrors ``encrypt`` in
        ``session.ts``.

        Args:
            recipient_address: The peer's messaging address (its base64
                encryption public key) — the session-store key.
            recipient_identity_key: The peer's *X25519* identity public key, used
                for the AEAD associated data.
            plaintext: The message bytes to encrypt.
            recipient_bundle: The peer's fetched :class:`KeyBundle` wire dict,
                required only for the first message to a new peer.
            recipient_identity_ed25519_key: The peer's *Ed25519* identity public
                key (its trusted addressing key), required to verify the bundle.

        Raises:
            ValueError: if no session exists and no usable bundle is supplied.
        """
        async with self._lock_for(recipient_address):
            session = await self._store.get_session(recipient_address)
            is_pre_key_message = False
            ephemeral_public_key: bytes | None = None
            signed_pre_key_id: str | None = None
            one_time_pre_key_id: str | None = None

            if session is None and recipient_bundle is not None:
                bundle = parse_key_bundle(
                    recipient_bundle,
                    recipient_identity_key,
                    recipient_identity_ed25519_key,
                )
                identity_key_pair = await self._store.get_identity_x25519_key_pair()
                result = x3dh_initiate(_to_crypto_key_pair(identity_key_pair), bundle)
                session = result.session
                ephemeral_public_key = result.ephemeral_public_key
                signed_pre_key_id = result.signed_pre_key_id
                one_time_pre_key_id = result.one_time_pre_key_id
                is_pre_key_message = True

            if session is None:
                raise ValueError(
                    f"No session for {recipient_address}. "
                    "Provide a key bundle for initial message."
                )

            associated_data = build_associated_data(
                self._our_identity_public_key,
                recipient_identity_key,
            )
            message = ratchet_encrypt(session, plaintext, associated_data)
            await self._store.store_session(recipient_address, session)

            signal = _build_signal_metadata(
                message.header,
                ephemeral_public_key,
                signed_pre_key_id,
                one_time_pre_key_id,
            )

            return EncryptedMessage(
                body=to_base64(message.ciphertext),
                type="PREKEY_BUNDLE" if is_pre_key_message else "CIPHERTEXT",
                signal=signal,
            )

    async def decrypt(
        self,
        sender_address: str,
        sender_identity_key: bytes,
        envelope: Mapping[str, Any],
    ) -> bytes:
        """Decrypt a received ``envelope`` from ``sender_address``.

        For a ``PREKEY_BUNDLE`` envelope this first runs the X3DH responder side
        (consuming our signed pre-key and any one-time pre-key the sender used)
        to establish the session, then advances the ratchet. The updated session
        is persisted before returning. Mirrors ``decrypt`` in ``session.ts``.

        Args:
            sender_address: The peer's messaging address (the session-store key).
            sender_identity_key: The peer's *X25519* identity public key.
            envelope: The received :class:`MessageEnvelope` wire dict (``type``,
                ``body``, ``signal``).

        Raises:
            ValueError: if no session can be found or established for the sender.
        """
        async with self._lock_for(sender_address):
            session = await self._store.get_session(sender_address)
            ciphertext = from_base64(str(envelope["body"]))
            signal = envelope.get("signal")

            consumed_one_time_pre_key_id: str | None = None
            if envelope.get("type") == "PREKEY_BUNDLE" and signal:
                session, consumed_one_time_pre_key_id = (
                    await self._process_pre_key_message(sender_identity_key, signal)
                )

            if session is None:
                raise ValueError(f"No session for {sender_address}")

            header = _parse_signal_header(signal)
            associated_data = build_associated_data(
                sender_identity_key,
                self._our_identity_public_key,
            )
            ratchet_message = RatchetMessage(header=header, ciphertext=ciphertext)
            # ratchet_decrypt authenticates the ciphertext (MAC) before mutating;
            # if it raises, we must NOT have consumed our one-time pre-key, or a
            # forged PREKEY_BUNDLE could permanently burn it.
            plaintext = ratchet_decrypt(session, ratchet_message, associated_data)
            if consumed_one_time_pre_key_id is not None:
                await self._store.remove_pre_key(consumed_one_time_pre_key_id)
            await self._store.store_session(sender_address, session)

            return plaintext

    async def _process_pre_key_message(
        self,
        sender_identity_key: bytes,
        signal: Mapping[str, Any],
    ) -> tuple[SessionState, str | None]:
        """Run the X3DH responder side for an inbound ``PREKEY_BUNDLE``.

        Looks up the signed pre-key the sender selected and, if the sender used a
        one-time pre-key, loads it, then derives the responder's session state.
        Returns ``(session_state, one_time_pre_key_id_to_consume)``. The one-time
        pre-key is **not** removed here — the caller removes it only after the
        first ciphertext authenticates, so a forged or corrupted bundle cannot
        permanently consume it. Mirrors ``processPreKeyMessage`` in ``session.ts``.
        """
        identity_key_pair = await self._store.get_identity_x25519_key_pair()
        signed_pre_key_id = signal.get("signedPreKeyId")
        signed_pre_key = (
            await self._store.get_signed_pre_key(str(signed_pre_key_id))
            if signed_pre_key_id is not None
            else None
        )
        if signed_pre_key is None:
            raise ValueError(f"Signed pre-key {signed_pre_key_id} not found")

        one_time_pre_key_pair: CryptoKeyPair | None = None
        consumed_one_time_pre_key_id: str | None = None
        one_time_pre_key_id = signal.get("oneTimePreKeyId")
        if one_time_pre_key_id:
            one_time_pre_key = await self._store.get_pre_key(str(one_time_pre_key_id))
            # When the sender names a one-time pre-key it must exist, otherwise the
            # X3DH secrets cannot match and we would silently derive a dead session.
            if one_time_pre_key is None:
                raise ValueError(
                    f"One-time pre-key {one_time_pre_key_id} not found"
                )
            one_time_pre_key_pair = _to_crypto_key_pair(one_time_pre_key.key_pair)
            consumed_one_time_pre_key_id = str(one_time_pre_key_id)

        ephemeral_key = from_base64(str(signal["ephemeralKey"]))

        session = x3dh_respond(
            _to_crypto_key_pair(identity_key_pair),
            _to_crypto_key_pair(signed_pre_key.key_pair),
            sender_identity_key,
            ephemeral_key,
            one_time_pre_key_pair,
        )
        return session, consumed_one_time_pre_key_id

    async def has_session(self, address: str) -> bool:
        """Return whether a session already exists for ``address``."""
        return await self._store.get_session(address) is not None

    async def remove_session(self, address: str) -> None:
        """Delete the session for ``address`` (no-op if absent)."""
        await self._store.remove_session(address)


def parse_key_bundle(
    bundle: Mapping[str, Any],
    recipient_x25519_identity_key: bytes,
    recipient_ed25519_identity_key: Optional[bytes] = None,
) -> X3DHBundle:
    """Verify a fetched key bundle and convert it into an :class:`X3DHBundle`.

    Port of ``parseKeyBundle`` in ``session.ts``. The signed pre-key (and the
    one-time pre-key, if present) signatures are verified against the peer's
    long-term *Ed25519* identity key before any served key material is trusted.
    This is the X3DH binding that prevents a malicious or compromised
    relay/directory from substituting attacker-controlled pre-keys (MITM /
    unknown-key-share). The Ed25519 identity key MUST come from the caller's
    trusted addressing of the peer, never from the bundle itself.

    Args:
        bundle: The fetched :class:`KeyBundle` wire dict (``signedPreKey`` and
            optional ``oneTimePreKey``, each a ``SignedKey`` of ``publicKey`` /
            ``signature`` / ``keyId``).
        recipient_x25519_identity_key: The peer's identity key already converted
            to X25519 (this becomes the X3DH bundle's ``identity_key``).
        recipient_ed25519_identity_key: The peer's Ed25519 identity key, required
            to verify the bundle's signatures.

    Raises:
        ValueError: if the Ed25519 identity key is missing or any signature is
            invalid.
    """
    if recipient_ed25519_identity_key is None:
        raise ValueError(
            "Key bundle rejected: peer Ed25519 identity key is required to "
            "verify the signed pre-key signature"
        )

    # The X3DH identity used for the DH must be the X25519 form of the *same*
    # Ed25519 key we verify signatures against — otherwise a caller could pass a
    # mismatched pair and bind the session to an identity the signatures never
    # authenticated. Derive it from the verified Ed25519 key rather than trusting
    # the supplied X25519 value.
    derived_x25519_identity_key = ed25519_pub_to_x25519_pub(
        recipient_ed25519_identity_key
    )
    if recipient_x25519_identity_key != derived_x25519_identity_key:
        raise ValueError(
            "Key bundle rejected: X25519 identity key does not match the peer's "
            "Ed25519 identity key"
        )

    signed_pre_key = bundle["signedPreKey"]
    signed_pre_key_public = str(signed_pre_key["publicKey"])
    verify_pre_key_signature_raw(
        recipient_ed25519_identity_key,
        signed_pre_key_public,
        signed_pre_key.get("signature"),
        "signed pre-key",
    )

    one_time_pre_key = bundle.get("oneTimePreKey")
    if one_time_pre_key is not None:
        one_time_pre_key_public = str(one_time_pre_key["publicKey"])
        verify_pre_key_signature_raw(
            recipient_ed25519_identity_key,
            one_time_pre_key_public,
            one_time_pre_key.get("signature"),
            "one-time pre-key",
        )
        return X3DHBundle(
            identity_key=recipient_x25519_identity_key,
            signed_pre_key_id=str(signed_pre_key["keyId"]),
            signed_pre_key=from_base64(signed_pre_key_public),
            one_time_pre_key_id=str(one_time_pre_key["keyId"]),
            one_time_pre_key=from_base64(one_time_pre_key_public),
        )

    return X3DHBundle(
        identity_key=recipient_x25519_identity_key,
        signed_pre_key_id=str(signed_pre_key["keyId"]),
        signed_pre_key=from_base64(signed_pre_key_public),
    )


def _build_signal_metadata(
    header: RatchetHeader,
    ephemeral_public_key: Optional[bytes],
    signed_pre_key_id: Optional[str],
    one_time_pre_key_id: Optional[str],
) -> dict[str, Any]:
    """Build the wire ``signal`` metadata dict from a ratchet header.

    Mirrors ``buildSignalMetadata`` in ``session.ts``. Field names are the
    camelCase keys the backend and TS SDK agree on; optional X3DH bootstrap
    fields are added only for the first (``PREKEY_BUNDLE``) message.
    """
    signal: dict[str, Any] = {
        "ratchetKey": to_base64(header.public_key),
        "messageNumber": header.message_number,
        "previousChainLength": header.previous_chain_length,
    }
    if ephemeral_public_key is not None:
        signal["ephemeralKey"] = to_base64(ephemeral_public_key)
    if signed_pre_key_id is not None:
        signal["signedPreKeyId"] = signed_pre_key_id
    if one_time_pre_key_id is not None:
        signal["oneTimePreKeyId"] = one_time_pre_key_id
    return signal


def _parse_signal_header(signal: Optional[Mapping[str, Any]]) -> RatchetHeader:
    """Reconstruct a :class:`RatchetHeader` from wire ``signal`` metadata.

    Mirrors ``parseSignalHeader`` in ``session.ts``. ``messageNumber`` and
    ``previousChainLength`` default to ``0`` when absent.
    """
    ratchet_key = signal.get("ratchetKey") if signal else None
    if not ratchet_key:
        raise ValueError("Missing ratchet key in signal metadata")
    return RatchetHeader(
        public_key=from_base64(str(ratchet_key)),
        previous_chain_length=int(signal.get("previousChainLength") or 0),
        message_number=int(signal.get("messageNumber") or 0),
    )


def _to_crypto_key_pair(key_pair: StoreKeyPair | CryptoKeyPair) -> CryptoKeyPair:
    """Coerce a store/crypto key pair into the crypto ``X25519KeyPair`` flavour.

    The X3DH layer takes the crypto-module ``X25519KeyPair`` while the store
    hands back its own field-identical type; #46's scope note keeps these
    distinct, so we re-wrap locally rather than unifying the type package-wide.
    """
    return CryptoKeyPair(
        public_key=key_pair.public_key, private_key=key_pair.private_key
    )
