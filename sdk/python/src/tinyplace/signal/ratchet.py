"""Double Ratchet for the tiny.place Signal Protocol port.

A byte-compatible Python port of the TypeScript SDK's
``sdk/typescript/src/signal/ratchet.ts``. It implements the symmetric and
Diffie-Hellman ratchets, message-key derivation, ratchet-header construction
and skipped / out-of-order message-key handling, operating over the
:class:`~tinyplace.signal.store.SessionState` record.

Every algorithmic choice mirrors the reference so a message produced by one
SDK can be consumed by the other:

* DH ratchet: X25519, root-key advance via HKDF-SHA256
  (:func:`~tinyplace.signal.crypto.kdf_root_key`).
* Symmetric ratchet: HMAC-SHA256 chain ratchet
  (:func:`~tinyplace.signal.crypto.kdf_chain_key`).
* Message AEAD: AES-256-CBC + HMAC-SHA256
  (:func:`~tinyplace.signal.crypto.encrypt` / :func:`decrypt`).
* Header wire format: ``publicKey(32) || previousChainLength(u32 BE) ||
  messageNumber(u32 BE)`` (40 bytes), matching ``encodeHeader`` in ratchet.ts.

The crypto primitives are reused verbatim from
:mod:`tinyplace.signal.crypto`; this module never reimplements crypto.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, fields

from .crypto import (
    decrypt,
    encrypt,
    generate_x25519_keypair,
    kdf_chain_key,
    kdf_root_key,
    x25519_shared_secret,
)
from .store import SessionState, X25519KeyPair, skipped_key_id

__all__ = [
    "MAX_SKIP",
    "RatchetHeader",
    "RatchetMessage",
    "encode_header",
    "ratchet_encrypt",
    "ratchet_decrypt",
]

# Maximum number of message keys we are willing to skip in a single chain.
# Mirrors ``MAX_SKIP`` in ratchet.ts; guards against a malicious counterparty
# sending a huge ``messageNumber`` to exhaust memory/CPU.
MAX_SKIP = 1000

# Ratchet header layout, matching ``encodeHeader`` in ratchet.ts.
_PUBLIC_KEY_LEN = 32
_HEADER_LEN = _PUBLIC_KEY_LEN + 4 + 4


@dataclass
class RatchetHeader:
    """Plaintext header that travels with every ratchet message.

    Mirrors the TypeScript ``RatchetHeader``. ``public_key`` is the sender's
    current ratchet (DH) public key; ``previous_chain_length`` is the number of
    messages in the sender's previous sending chain; ``message_number`` is the
    index of this message within the current sending chain.
    """

    public_key: bytes
    previous_chain_length: int
    message_number: int


@dataclass
class RatchetMessage:
    """A ratchet header plus the AEAD ciphertext for one message."""

    header: RatchetHeader
    ciphertext: bytes


def ratchet_encrypt(
    state: SessionState, plaintext: bytes, associated_data: bytes
) -> RatchetMessage:
    """Encrypt ``plaintext`` under the next sending message key.

    Mutates ``state`` in place: advances the sending chain (performing the
    initial sending-side DH ratchet step if no sending chain exists yet) and
    increments the send counter. ``associated_data`` is bound into the AEAD
    together with the encoded header.
    """
    if state.send_chain_key is None:
        _dh_ratchet_step(state)

    # ``send_chain_key`` is guaranteed non-None after the step above.
    chain_key, message_key = kdf_chain_key(state.send_chain_key)  # type: ignore[arg-type]
    state.send_chain_key = chain_key

    header = RatchetHeader(
        public_key=state.dh_send_key_pair.public_key,
        previous_chain_length=state.previous_chain_length,
        message_number=state.send_message_number,
    )
    state.send_message_number += 1

    ad = associated_data + encode_header(header)
    ciphertext = encrypt(message_key, plaintext, ad)
    return RatchetMessage(header=header, ciphertext=ciphertext)


def ratchet_decrypt(
    state: SessionState, message: RatchetMessage, associated_data: bytes
) -> bytes:
    """Decrypt ``message`` and return the plaintext.

    Handles three cases, exactly like ratchet.ts:

    1. A previously skipped / out-of-order key cached in ``state.skipped_keys``
       is used (and consumed) if it matches the header.
    2. A new ratchet public key triggers a receiving-side DH ratchet step
       (skipping any remaining keys of the previous receiving chain first).
    3. Otherwise the next receiving message key from the current chain is used,
       skipping any intervening keys up to ``message.header.message_number``.

    All ratchet mutations are **staged on a copy and committed only after the
    AEAD MAC authenticates the message**. Otherwise a tampered ciphertext
    carrying a fresh ratchet public key would advance the caller's live
    ``SessionState`` to attacker-controlled key material before the MAC check,
    permanently breaking decryption of later legitimate messages. On success
    ``state`` is updated atomically; on any failure it is left untouched.

    Raises ``ValueError`` if the AEAD MAC fails (via
    :func:`~tinyplace.signal.crypto.decrypt`) or if more than :data:`MAX_SKIP`
    keys would have to be skipped.
    """
    working = deepcopy(state)
    plaintext = _ratchet_decrypt_into(working, message, associated_data)
    # Authentication succeeded — commit the staged state atomically, preserving
    # the caller's object identity.
    for field in fields(state):
        setattr(state, field.name, getattr(working, field.name))
    return plaintext


def _ratchet_decrypt_into(
    state: SessionState, message: RatchetMessage, associated_data: bytes
) -> bytes:
    """Run the ratchet decrypt over ``state`` in place (see :func:`ratchet_decrypt`).

    Operates on a throwaway working copy so a MAC failure cannot corrupt the
    caller's session; callers should use :func:`ratchet_decrypt`.
    """
    header = message.header
    sk_id = skipped_key_id(header.public_key, header.message_number)
    skipped_mk = state.skipped_keys.get(sk_id)
    if skipped_mk is not None:
        del state.skipped_keys[sk_id]
        ad = associated_data + encode_header(header)
        return decrypt(skipped_mk, message.ciphertext, ad)

    header_key_changed = (
        state.dh_recv_public_key is None
        or state.dh_recv_public_key != header.public_key
    )

    if header_key_changed:
        if state.recv_chain_key is not None:
            _skip_message_keys(state, header.previous_chain_length)
        _dh_ratchet_step_with_recv(state, header.public_key)

    _skip_message_keys(state, header.message_number)

    # ``recv_chain_key`` is guaranteed non-None after a DH ratchet step.
    chain_key, message_key = kdf_chain_key(state.recv_chain_key)  # type: ignore[arg-type]
    state.recv_chain_key = chain_key
    state.recv_message_number += 1

    ad = associated_data + encode_header(header)
    return decrypt(message_key, message.ciphertext, ad)


def _dh_ratchet_step(state: SessionState) -> None:
    """Initial sending-side ratchet: derive the first sending chain key.

    Used the first time we send before having received anything (e.g. right
    after X3DH). Requires the recipient's ratchet public key.
    """
    if state.dh_recv_public_key is None:
        raise ValueError("Cannot perform DH ratchet without recipient public key")
    dh_output = x25519_shared_secret(
        state.dh_send_key_pair.private_key, state.dh_recv_public_key
    )
    root_key, chain_key = kdf_root_key(state.root_key, dh_output)
    state.root_key = root_key
    state.send_chain_key = chain_key


def _dh_ratchet_step_with_recv(
    state: SessionState, new_recv_public_key: bytes
) -> None:
    """Full DH ratchet step on receipt of a new ratchet public key.

    Advances the root key twice: once with the peer's new public key to derive
    the new *receiving* chain, then with a freshly generated local key pair to
    derive the new *sending* chain. Resets the per-chain counters and records
    the length of the just-closed sending chain.
    """
    state.previous_chain_length = state.send_message_number
    state.send_message_number = 0
    state.recv_message_number = 0
    state.dh_recv_public_key = new_recv_public_key

    dh_recv = x25519_shared_secret(
        state.dh_send_key_pair.private_key, state.dh_recv_public_key
    )
    recv_root_key, recv_chain_key = kdf_root_key(state.root_key, dh_recv)
    state.root_key = recv_root_key
    state.recv_chain_key = recv_chain_key

    state.dh_send_key_pair = _to_store_key_pair(generate_x25519_keypair())
    dh_send = x25519_shared_secret(
        state.dh_send_key_pair.private_key, state.dh_recv_public_key
    )
    send_root_key, send_chain_key = kdf_root_key(state.root_key, dh_send)
    state.root_key = send_root_key
    state.send_chain_key = send_chain_key


def _skip_message_keys(state: SessionState, until: int) -> None:
    """Advance the receiving chain to ``until``, caching skipped message keys.

    Caches each skipped key in ``state.skipped_keys`` (keyed by current ratchet
    public key + message number) so out-of-order messages can be decrypted
    later. Raises ``ValueError`` if more than :data:`MAX_SKIP` keys would be
    skipped.
    """
    if state.recv_chain_key is None:
        return
    if until - state.recv_message_number > MAX_SKIP:
        raise ValueError("Too many skipped messages")
    while state.recv_message_number < until:
        chain_key, message_key = kdf_chain_key(state.recv_chain_key)
        state.recv_chain_key = chain_key
        # ``dh_recv_public_key`` is set whenever a receiving chain exists.
        sk_id = skipped_key_id(
            state.dh_recv_public_key,  # type: ignore[arg-type]
            state.recv_message_number,
        )
        state.skipped_keys[sk_id] = message_key
        state.recv_message_number += 1


def encode_header(header: RatchetHeader) -> bytes:
    """Serialize a :class:`RatchetHeader` to its 40-byte wire form.

    Layout matches ``encodeHeader`` in ratchet.ts: the 32-byte public key
    followed by ``previous_chain_length`` and ``message_number`` as big-endian
    unsigned 32-bit integers.
    """
    return (
        header.public_key
        + header.previous_chain_length.to_bytes(4, "big")
        + header.message_number.to_bytes(4, "big")
    )


def _to_store_key_pair(key_pair: X25519KeyPair) -> X25519KeyPair:
    """Coerce a crypto ``X25519KeyPair`` into the store's dataclass.

    ``crypto`` and ``store`` currently define distinct (but field-identical)
    ``X25519KeyPair`` types; unifying them is #46's job. Until then we re-wrap
    so ``SessionState.dh_send_key_pair`` always holds the store flavour.
    """
    return X25519KeyPair(
        public_key=key_pair.public_key, private_key=key_pair.private_key
    )
