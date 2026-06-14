from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def public_key_to_base64(public_key: bytes) -> str:
    return base64.b64encode(public_key).decode("ascii")


def public_key_to_solana_address(public_key: bytes) -> str:
    value = int.from_bytes(public_key, "big")
    encoded = ""
    while value > 0:
        value, digit = divmod(value, 58)
        encoded = BASE58_ALPHABET[digit] + encoded

    leading_zeroes = 0
    for byte in public_key:
        if byte != 0:
            break
        leading_zeroes += 1
    return ("1" * leading_zeroes) + encoded if encoded else "1"


def derive_crypto_id(public_key: bytes) -> str:
    return public_key_to_solana_address(public_key)


def sha256_hex(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def canonical_payload(action: str, fields: dict[str, Any]) -> str:
    return _stable_json({"action": action, "fields": fields})


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def base64_url(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


def decode_base58(value: str) -> bytes:
    decoded = 0
    for char in value:
        digit = BASE58_ALPHABET.find(char)
        if digit == -1:
            raise ValueError(f"Invalid base58 character: {char}")
        decoded = decoded * 58 + digit

    raw = decoded.to_bytes((decoded.bit_length() + 7) // 8, "big") if decoded else b""
    leading_zeroes = len(value) - len(value.lstrip("1"))
    return (b"\x00" * leading_zeroes) + raw
