from __future__ import annotations

import pytest

from tinyplace.crypto import (
    canonical_payload,
    decode_base58,
    public_key_to_solana_address,
    sha256_hex,
)


def test_crypto_helpers_are_stable() -> None:
    assert sha256_hex("hello") == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    assert canonical_payload("act", {"z": 1, "a": {"b": 2}}) == '{"action":"act","fields":{"a":{"b":2},"z":1}}'
    assert public_key_to_solana_address(b"\x00") == "1"
    assert decode_base58("1") == b"\x00"


def test_decode_base58_rejects_invalid_characters() -> None:
    with pytest.raises(ValueError, match="Invalid base58"):
        decode_base58("0")
