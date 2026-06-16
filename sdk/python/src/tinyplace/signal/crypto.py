"""Signal Protocol crypto primitives.

A byte-compatible Python port of the TypeScript SDK's
``sdk/typescript/src/signal/crypto.ts``. Every curve / hash / KDF / AEAD
choice here mirrors the reference implementation so that messages produced by
one SDK can be consumed by the other:

* DH: X25519 (Curve25519, via libsodium ``crypto_scalarmult``)
* Signatures: Ed25519 (via libsodium ``crypto_sign``)
* KDF: HKDF-SHA256 (RFC 5869) and HMAC-SHA256 chain ratcheting
* AEAD: AES-256-CBC + HMAC-SHA256 (truncated to 8 bytes), Encrypt-then-MAC

The AES-CBC core is a self-contained pure-Python implementation so the SDK
keeps a zero-OpenSSL footprint (PyNaCl/libsodium does not expose AES-CBC).
Output is identical to WebCrypto's ``AES-CBC`` with PKCS#7 padding.
"""

from __future__ import annotations

import base64
import hashlib
import hmac as _hmac
import os
from dataclasses import dataclass
from hashlib import sha512
from hmac import compare_digest

from nacl.bindings import (
    crypto_scalarmult,
    crypto_scalarmult_base,
    crypto_sign,
    crypto_sign_open,
    crypto_sign_seed_keypair,
)

__all__ = [
    "X25519KeyPair",
    "generate_x25519_keypair",
    "x25519_shared_secret",
    "ed25519_seed_to_x25519_private",
    "ed25519_seed_to_x25519_keypair",
    "ed25519_pub_to_x25519_pub",
    "ed25519_keypair_from_seed",
    "ed25519_sign",
    "ed25519_verify",
    "hkdf",
    "kdf_root_key",
    "kdf_chain_key",
    "derive_message_keys",
    "aes_encrypt",
    "aes_decrypt",
    "compute_hmac",
    "encrypt",
    "decrypt",
    "to_base64",
    "from_base64",
]

# Domain-separation labels — must match crypto.ts byte-for-byte.
_HKDF_INFO = b"WhisperRatchet"
_MESSAGE_KEY_INFO = b"WhisperMessageKeys"
_CHAIN_KEY_SEED_MESSAGE = b"\x01"
_CHAIN_KEY_SEED_CHAIN = b"\x02"

# Curve25519 field prime: 2^255 - 19.
_P = (1 << 255) - 19


@dataclass(frozen=True)
class X25519KeyPair:
    """An X25519 (Curve25519) key pair, raw 32-byte keys."""

    public_key: bytes
    private_key: bytes


# --------------------------------------------------------------------------
# X25519 (Diffie-Hellman)
# --------------------------------------------------------------------------


def generate_x25519_keypair() -> X25519KeyPair:
    """Generate a fresh random X25519 key pair."""
    private_key = _random_clamped_scalar()
    public_key = crypto_scalarmult_base(private_key)
    return X25519KeyPair(public_key=public_key, private_key=private_key)


def x25519_shared_secret(private_key: bytes, public_key: bytes) -> bytes:
    """Compute the X25519 shared secret for ``private_key`` and ``public_key``."""
    return crypto_scalarmult(private_key, public_key)


def _random_clamped_scalar() -> bytes:
    scalar = bytearray(os.urandom(32))
    scalar[0] &= 248
    scalar[31] &= 127
    scalar[31] |= 64
    return bytes(scalar)


# --------------------------------------------------------------------------
# Ed25519 <-> X25519 conversions
# --------------------------------------------------------------------------


def ed25519_seed_to_x25519_private(seed: bytes) -> bytes:
    """Derive the X25519 private scalar from a 32-byte Ed25519 seed.

    Hashes the seed with SHA-512 and clamps the low 32 bytes, exactly like
    the reference and libsodium's ``crypto_sign_ed25519_sk_to_curve25519``.
    """
    if len(seed) != 32:
        raise ValueError(f"Ed25519 seed must be 32 bytes, got {len(seed)}")
    digest = bytearray(sha512(seed).digest()[:32])
    digest[0] &= 248
    digest[31] &= 127
    digest[31] |= 64
    return bytes(digest)


def ed25519_seed_to_x25519_keypair(seed: bytes) -> X25519KeyPair:
    """Derive a full X25519 key pair from a 32-byte Ed25519 seed."""
    private_key = ed25519_seed_to_x25519_private(seed)
    public_key = crypto_scalarmult_base(private_key)
    return X25519KeyPair(public_key=public_key, private_key=private_key)


def ed25519_pub_to_x25519_pub(ed_pub: bytes) -> bytes:
    """Convert an Ed25519 (Edwards) public key to an X25519 (Montgomery) one.

    Birational map ``u = (1 + y) / (1 - y) mod p`` where the Ed25519 public
    key encodes ``y`` little-endian with the sign bit in the top bit of the
    final byte.
    """
    bytes_le = bytearray(ed_pub)
    bytes_le[31] &= 0x7F
    y = int.from_bytes(bytes_le, "little")
    numerator = (1 + y) % _P
    denominator = (1 - y) % _P
    u = (numerator * pow(denominator, _P - 2, _P)) % _P
    return u.to_bytes(32, "little")


# --------------------------------------------------------------------------
# Ed25519 sign / verify
# --------------------------------------------------------------------------


def ed25519_keypair_from_seed(seed: bytes) -> tuple[bytes, bytes]:
    """Return ``(public_key, secret_key)`` for a 32-byte Ed25519 seed.

    The 64-byte ``secret_key`` is the libsodium expanded form (seed||public).
    """
    if len(seed) != 32:
        raise ValueError(f"Ed25519 seed must be 32 bytes, got {len(seed)}")
    public_key, secret_key = crypto_sign_seed_keypair(seed)
    return public_key, secret_key


def ed25519_sign(secret_key: bytes, message: bytes) -> bytes:
    """Produce a detached 64-byte Ed25519 signature over ``message``.

    ``secret_key`` may be a 32-byte seed or the 64-byte expanded secret key.
    """
    if len(secret_key) == 32:
        _public, secret_key = crypto_sign_seed_keypair(secret_key)
    elif len(secret_key) != 64:
        raise ValueError(f"Ed25519 secret key must be 32 or 64 bytes, got {len(secret_key)}")
    signed = crypto_sign(message, secret_key)
    return signed[:64]


def ed25519_verify(public_key: bytes, message: bytes, signature: bytes) -> bool:
    """Verify a detached 64-byte Ed25519 ``signature`` over ``message``."""
    if len(signature) != 64:
        return False
    try:
        crypto_sign_open(signature + message, public_key)
    except Exception:
        return False
    return True


# --------------------------------------------------------------------------
# HKDF / chain KDFs
# --------------------------------------------------------------------------


def hkdf(ikm: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    """HKDF-SHA256 (RFC 5869): extract-then-expand.

    Argument order matches ``@noble/hashes`` ``hkdf(sha256, ikm, salt, info, length)``.
    """
    if salt == b"":
        salt = b"\x00" * hashlib.sha256().digest_size
    prk = _hmac.new(salt, ikm, hashlib.sha256).digest()

    okm = b""
    previous = b""
    counter = 1
    while len(okm) < length:
        previous = _hmac.new(
            prk, previous + info + bytes([counter]), hashlib.sha256
        ).digest()
        okm += previous
        counter += 1
    return okm[:length]


def kdf_root_key(root_key: bytes, dh_output: bytes) -> tuple[bytes, bytes]:
    """Advance the Double Ratchet root key. Returns ``(root_key, chain_key)``."""
    output = hkdf(dh_output, root_key, _HKDF_INFO, 64)
    return output[:32], output[32:64]


def kdf_chain_key(chain_key: bytes) -> tuple[bytes, bytes]:
    """Advance a symmetric chain key. Returns ``(chain_key, message_key)``."""
    new_chain_key = compute_hmac(chain_key, _CHAIN_KEY_SEED_CHAIN)
    message_key = compute_hmac(chain_key, _CHAIN_KEY_SEED_MESSAGE)
    return new_chain_key, message_key


def derive_message_keys(message_key: bytes) -> tuple[bytes, bytes, bytes]:
    """Derive ``(enc_key, mac_key, iv)`` (32/32/16 bytes) from a message key."""
    output = hkdf(message_key, b"\x00" * 32, _MESSAGE_KEY_INFO, 80)
    return output[:32], output[32:64], output[64:80]


# --------------------------------------------------------------------------
# AEAD (AES-256-CBC + HMAC-SHA256, Encrypt-then-MAC)
# --------------------------------------------------------------------------


def aes_encrypt(key: bytes, iv: bytes, plaintext: bytes) -> bytes:
    """AES-256-CBC encrypt with PKCS#7 padding (WebCrypto ``AES-CBC`` compatible)."""
    padded = _pkcs7_pad(plaintext, 16)
    return _aes_cbc_encrypt(key, iv, padded)


def aes_decrypt(key: bytes, iv: bytes, ciphertext: bytes) -> bytes:
    """AES-256-CBC decrypt and strip PKCS#7 padding."""
    if len(ciphertext) == 0 or len(ciphertext) % 16 != 0:
        raise ValueError("ciphertext length must be a non-zero multiple of 16")
    padded = _aes_cbc_decrypt(key, iv, ciphertext)
    return _pkcs7_unpad(padded, 16)


def compute_hmac(key: bytes, data: bytes) -> bytes:
    """HMAC-SHA256 over ``data`` with ``key``."""
    return _hmac.new(key, data, hashlib.sha256).digest()


def encrypt(message_key: bytes, plaintext: bytes, associated_data: bytes) -> bytes:
    """Signal message AEAD: ``AES-CBC(plaintext) || HMAC(ad||ct)[:8]``."""
    enc_key, mac_key, iv = derive_message_keys(message_key)
    ciphertext = aes_encrypt(enc_key, iv, plaintext)
    mac = compute_hmac(mac_key, associated_data + ciphertext)[:8]
    return ciphertext + mac


def decrypt(
    message_key: bytes, ciphertext_with_mac: bytes, associated_data: bytes
) -> bytes:
    """Inverse of :func:`encrypt`. Raises ``ValueError`` if the MAC is invalid."""
    if len(ciphertext_with_mac) < 8:
        raise ValueError("ciphertext too short")
    enc_key, mac_key, iv = derive_message_keys(message_key)
    ciphertext = ciphertext_with_mac[:-8]
    received_mac = ciphertext_with_mac[-8:]
    computed_mac = compute_hmac(mac_key, associated_data + ciphertext)[:8]
    if not compare_digest(received_mac, computed_mac):
        raise ValueError("MAC verification failed")
    return aes_decrypt(enc_key, iv, ciphertext)


# --------------------------------------------------------------------------
# Encoding helpers
# --------------------------------------------------------------------------


def to_base64(data: bytes) -> str:
    """Standard (padded) Base64 encode."""
    return base64.b64encode(data).decode("ascii")


def from_base64(value: str) -> bytes:
    """Standard Base64 decode."""
    return base64.b64decode(value)


# --------------------------------------------------------------------------
# PKCS#7 padding
# --------------------------------------------------------------------------


def _pkcs7_pad(data: bytes, block_size: int) -> bytes:
    pad_len = block_size - (len(data) % block_size)
    return data + bytes([pad_len]) * pad_len


def _pkcs7_unpad(data: bytes, block_size: int) -> bytes:
    if len(data) == 0 or len(data) % block_size != 0:
        raise ValueError("invalid padded length")
    pad_len = data[-1]
    if pad_len < 1 or pad_len > block_size:
        raise ValueError("invalid PKCS#7 padding")
    if data[-pad_len:] != bytes([pad_len]) * pad_len:
        raise ValueError("invalid PKCS#7 padding")
    return data[:-pad_len]


# --------------------------------------------------------------------------
# Pure-Python AES (FIPS-197) in CBC mode — keeps the SDK OpenSSL-free.
# --------------------------------------------------------------------------

_SBOX = (
    0x63, 0x7C, 0x77, 0x7B, 0xF2, 0x6B, 0x6F, 0xC5, 0x30, 0x01, 0x67, 0x2B,
    0xFE, 0xD7, 0xAB, 0x76, 0xCA, 0x82, 0xC9, 0x7D, 0xFA, 0x59, 0x47, 0xF0,
    0xAD, 0xD4, 0xA2, 0xAF, 0x9C, 0xA4, 0x72, 0xC0, 0xB7, 0xFD, 0x93, 0x26,
    0x36, 0x3F, 0xF7, 0xCC, 0x34, 0xA5, 0xE5, 0xF1, 0x71, 0xD8, 0x31, 0x15,
    0x04, 0xC7, 0x23, 0xC3, 0x18, 0x96, 0x05, 0x9A, 0x07, 0x12, 0x80, 0xE2,
    0xEB, 0x27, 0xB2, 0x75, 0x09, 0x83, 0x2C, 0x1A, 0x1B, 0x6E, 0x5A, 0xA0,
    0x52, 0x3B, 0xD6, 0xB3, 0x29, 0xE3, 0x2F, 0x84, 0x53, 0xD1, 0x00, 0xED,
    0x20, 0xFC, 0xB1, 0x5B, 0x6A, 0xCB, 0xBE, 0x39, 0x4A, 0x4C, 0x58, 0xCF,
    0xD0, 0xEF, 0xAA, 0xFB, 0x43, 0x4D, 0x33, 0x85, 0x45, 0xF9, 0x02, 0x7F,
    0x50, 0x3C, 0x9F, 0xA8, 0x51, 0xA3, 0x40, 0x8F, 0x92, 0x9D, 0x38, 0xF5,
    0xBC, 0xB6, 0xDA, 0x21, 0x10, 0xFF, 0xF3, 0xD2, 0xCD, 0x0C, 0x13, 0xEC,
    0x5F, 0x97, 0x44, 0x17, 0xC4, 0xA7, 0x7E, 0x3D, 0x64, 0x5D, 0x19, 0x73,
    0x60, 0x81, 0x4F, 0xDC, 0x22, 0x2A, 0x90, 0x88, 0x46, 0xEE, 0xB8, 0x14,
    0xDE, 0x5E, 0x0B, 0xDB, 0xE0, 0x32, 0x3A, 0x0A, 0x49, 0x06, 0x24, 0x5C,
    0xC2, 0xD3, 0xAC, 0x62, 0x91, 0x95, 0xE4, 0x79, 0xE7, 0xC8, 0x37, 0x6D,
    0x8D, 0xD5, 0x4E, 0xA9, 0x6C, 0x56, 0xF4, 0xEA, 0x65, 0x7A, 0xAE, 0x08,
    0xBA, 0x78, 0x25, 0x2E, 0x1C, 0xA6, 0xB4, 0xC6, 0xE8, 0xDD, 0x74, 0x1F,
    0x4B, 0xBD, 0x8B, 0x8A, 0x70, 0x3E, 0xB5, 0x66, 0x48, 0x03, 0xF6, 0x0E,
    0x61, 0x35, 0x57, 0xB9, 0x86, 0xC1, 0x1D, 0x9E, 0xE1, 0xF8, 0x98, 0x11,
    0x69, 0xD9, 0x8E, 0x94, 0x9B, 0x1E, 0x87, 0xE9, 0xCE, 0x55, 0x28, 0xDF,
    0x8C, 0xA1, 0x89, 0x0D, 0xBF, 0xE6, 0x42, 0x68, 0x41, 0x99, 0x2D, 0x0F,
    0xB0, 0x54, 0xBB, 0x16,
)
_INV_SBOX = [0] * 256
for _i, _v in enumerate(_SBOX):
    _INV_SBOX[_v] = _i

_RCON = (
    0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B, 0x36,
    0x6C, 0xD8, 0xAB, 0x4D,
)


def _xtime(a: int) -> int:
    a <<= 1
    if a & 0x100:
        a ^= 0x11B
    return a & 0xFF


def _gmul(a: int, b: int) -> int:
    result = 0
    for _ in range(8):
        if b & 1:
            result ^= a
        b >>= 1
        a = _xtime(a)
    return result & 0xFF


def _expand_key(key: bytes) -> list[list[int]]:
    nk = len(key) // 4  # 8 for AES-256
    nr = nk + 6  # 14 rounds
    words = [list(key[4 * i : 4 * i + 4]) for i in range(nk)]
    for i in range(nk, 4 * (nr + 1)):
        temp = list(words[i - 1])
        if i % nk == 0:
            temp = temp[1:] + temp[:1]
            temp = [_SBOX[b] for b in temp]
            temp[0] ^= _RCON[i // nk - 1]
        elif nk > 6 and i % nk == 4:
            temp = [_SBOX[b] for b in temp]
        words.append([words[i - nk][j] ^ temp[j] for j in range(4)])
    return words


def _add_round_key(state: list[int], words: list[list[int]], rnd: int) -> None:
    for c in range(4):
        for r in range(4):
            state[r + 4 * c] ^= words[rnd * 4 + c][r]


def _aes_encrypt_block(block: bytes, words: list[list[int]], nr: int) -> bytes:
    # State is column-major: state[r + 4*c].
    state = list(block)
    _add_round_key(state, words, 0)
    for rnd in range(1, nr):
        state = [_SBOX[b] for b in state]
        _shift_rows(state)
        _mix_columns(state)
        _add_round_key(state, words, rnd)
    state = [_SBOX[b] for b in state]
    _shift_rows(state)
    _add_round_key(state, words, nr)
    return bytes(state)


def _aes_decrypt_block(block: bytes, words: list[list[int]], nr: int) -> bytes:
    state = list(block)
    _add_round_key(state, words, nr)
    for rnd in range(nr - 1, 0, -1):
        _inv_shift_rows(state)
        state = [_INV_SBOX[b] for b in state]
        _add_round_key(state, words, rnd)
        _inv_mix_columns(state)
    _inv_shift_rows(state)
    state = [_INV_SBOX[b] for b in state]
    _add_round_key(state, words, 0)
    return bytes(state)


def _shift_rows(state: list[int]) -> None:
    for r in range(1, 4):
        row = [state[r + 4 * c] for c in range(4)]
        row = row[r:] + row[:r]
        for c in range(4):
            state[r + 4 * c] = row[c]


def _inv_shift_rows(state: list[int]) -> None:
    for r in range(1, 4):
        row = [state[r + 4 * c] for c in range(4)]
        row = row[-r:] + row[:-r]
        for c in range(4):
            state[r + 4 * c] = row[c]


def _mix_columns(state: list[int]) -> None:
    for c in range(4):
        col = [state[r + 4 * c] for r in range(4)]
        state[0 + 4 * c] = _gmul(col[0], 2) ^ _gmul(col[1], 3) ^ col[2] ^ col[3]
        state[1 + 4 * c] = col[0] ^ _gmul(col[1], 2) ^ _gmul(col[2], 3) ^ col[3]
        state[2 + 4 * c] = col[0] ^ col[1] ^ _gmul(col[2], 2) ^ _gmul(col[3], 3)
        state[3 + 4 * c] = _gmul(col[0], 3) ^ col[1] ^ col[2] ^ _gmul(col[3], 2)


def _inv_mix_columns(state: list[int]) -> None:
    for c in range(4):
        col = [state[r + 4 * c] for r in range(4)]
        state[0 + 4 * c] = (
            _gmul(col[0], 14) ^ _gmul(col[1], 11) ^ _gmul(col[2], 13) ^ _gmul(col[3], 9)
        )
        state[1 + 4 * c] = (
            _gmul(col[0], 9) ^ _gmul(col[1], 14) ^ _gmul(col[2], 11) ^ _gmul(col[3], 13)
        )
        state[2 + 4 * c] = (
            _gmul(col[0], 13) ^ _gmul(col[1], 9) ^ _gmul(col[2], 14) ^ _gmul(col[3], 11)
        )
        state[3 + 4 * c] = (
            _gmul(col[0], 11) ^ _gmul(col[1], 13) ^ _gmul(col[2], 9) ^ _gmul(col[3], 14)
        )


def _aes_cbc_encrypt(key: bytes, iv: bytes, data: bytes) -> bytes:
    _validate_aes_inputs(key, iv)
    words = _expand_key(key)
    nr = len(key) // 4 + 6
    out = bytearray()
    previous = iv
    for offset in range(0, len(data), 16):
        block = bytes(b ^ p for b, p in zip(data[offset : offset + 16], previous))
        encrypted = _aes_encrypt_block(block, words, nr)
        out += encrypted
        previous = encrypted
    return bytes(out)


def _aes_cbc_decrypt(key: bytes, iv: bytes, data: bytes) -> bytes:
    _validate_aes_inputs(key, iv)
    words = _expand_key(key)
    nr = len(key) // 4 + 6
    out = bytearray()
    previous = iv
    for offset in range(0, len(data), 16):
        block = data[offset : offset + 16]
        decrypted = _aes_decrypt_block(block, words, nr)
        out += bytes(b ^ p for b, p in zip(decrypted, previous))
        previous = block
    return bytes(out)


def _validate_aes_inputs(key: bytes, iv: bytes) -> None:
    if len(key) != 32:
        raise ValueError(f"AES-256 key must be 32 bytes, got {len(key)}")
    if len(iv) != 16:
        raise ValueError(f"AES-CBC IV must be 16 bytes, got {len(iv)}")
