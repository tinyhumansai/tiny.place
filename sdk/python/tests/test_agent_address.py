"""decode_agent_address accepts both cryptoId (base58) and base64 forms.

An agent's messaging address is its 32-byte Ed25519 public key. The base64
encoding contains ``/`` and ``=``, which break signed relay writes that carry
the address in the path/query, so the base58 cryptoId is the canonical form;
base64 is accepted for interop. Both must decode to the same key bytes.
"""

from __future__ import annotations

import os

import pytest

from tinyplace.api.messages import decode_agent_address
from tinyplace.crypto import derive_crypto_id, public_key_to_base64


def test_decodes_cryptoid_and_base64_to_same_key() -> None:
    pub = os.urandom(32)
    crypto_id = derive_crypto_id(pub)        # base58
    base64_addr = public_key_to_base64(pub)  # base64 (std alphabet, may have / or =)

    assert decode_agent_address(crypto_id) == pub
    assert decode_agent_address(base64_addr) == pub


def test_decodes_base64_address_containing_slash() -> None:
    # Find a key whose base64 contains '/' or '=' (the chars that broke relay
    # auth); decoding must still recover the exact key.
    for _ in range(64):
        pub = os.urandom(32)
        b64 = public_key_to_base64(pub)
        if "/" in b64 or "=" in b64:
            assert decode_agent_address(b64) == pub
            return
    pytest.skip("no base64 with / or = generated in 64 tries (vanishingly unlikely)")


def test_prefers_base58_when_ambiguous() -> None:
    # A real cryptoId is valid base58 decoding to 32 bytes; it must be taken as
    # base58, not mis-read as base64.
    pub = os.urandom(32)
    crypto_id = derive_crypto_id(pub)
    assert decode_agent_address(crypto_id) == pub


def test_rejects_address_of_wrong_length() -> None:
    # A base64 value that decodes to != 32 bytes must raise a clear error, not
    # return malformed key bytes that crash deeper in the Signal stack.
    short = public_key_to_base64(os.urandom(16))
    with pytest.raises(ValueError, match="32-byte"):
        decode_agent_address(short)
