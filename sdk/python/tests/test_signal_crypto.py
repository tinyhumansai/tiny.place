"""Known-answer and round-trip tests for the Signal crypto primitives.

Vectors are drawn from the relevant RFCs / FIPS and cross-checked against
libsodium so the port stays byte-compatible with the TypeScript SDK.
"""

from __future__ import annotations

import pytest
from nacl.bindings import (
    crypto_scalarmult_base,
    crypto_sign_ed25519_pk_to_curve25519,
    crypto_sign_ed25519_sk_to_curve25519,
)

from tinyplace.signal import crypto as c
from tinyplace.signal.crypto import (
    _aes_decrypt_block,
    _aes_encrypt_block,
    _expand_key,
)

# RFC 8032 Ed25519 Test Vector 1.
ED_SEED = bytes.fromhex(
    "9d61b19deffebc3a73c632cc930009b6c11a6a3a87ca9a7c2bb59e9d8d3f6d2c"
)
ED_PUB = bytes.fromhex(
    "ec5f8b680397c8aab0f17e6b801dc855603f11b17a948a297a7db6823c7787c4"
)
ED_SIG_EMPTY = bytes.fromhex(
    "f0d09da7abd92be3ef84a43a158b46a1b8f145b0a163ea70fc71041cc7a27fc4"
    "a318c96e1b147d25bd322f00454ef79d52639a6cd78731f014269bef808da60a"
)


# --------------------------------------------------------------------------
# X25519
# --------------------------------------------------------------------------


def test_x25519_shared_secret_rfc7748() -> None:
    # RFC 7748 section 5.2 vector.
    priv = bytes.fromhex(
        "a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4"
    )
    pub = bytes.fromhex(
        "e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c"
    )
    expected = bytes.fromhex(
        "c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552"
    )
    assert c.x25519_shared_secret(priv, pub) == expected


def test_x25519_keypair_and_dh_agree() -> None:
    alice = c.generate_x25519_keypair()
    bob = c.generate_x25519_keypair()
    assert len(alice.public_key) == 32
    assert len(alice.private_key) == 32
    assert alice.public_key != bob.public_key
    # Both sides derive the same secret.
    ab = c.x25519_shared_secret(alice.private_key, bob.public_key)
    ba = c.x25519_shared_secret(bob.private_key, alice.public_key)
    assert ab == ba
    assert len(ab) == 32


# --------------------------------------------------------------------------
# Ed25519 sign / verify and conversions
# --------------------------------------------------------------------------


def test_ed25519_keypair_from_seed_rfc8032() -> None:
    pub, sk = c.ed25519_keypair_from_seed(ED_SEED)
    assert pub == ED_PUB
    assert len(sk) == 64


def test_ed25519_keypair_from_seed_rejects_bad_length() -> None:
    with pytest.raises(ValueError):
        c.ed25519_keypair_from_seed(b"\x00" * 31)


def test_ed25519_sign_rfc8032() -> None:
    sig = c.ed25519_sign(ED_SEED, b"")
    assert sig == ED_SIG_EMPTY
    assert len(sig) == 64


def test_ed25519_sign_accepts_expanded_key() -> None:
    _pub, sk = c.ed25519_keypair_from_seed(ED_SEED)
    assert c.ed25519_sign(sk, b"") == ED_SIG_EMPTY


def test_ed25519_sign_rejects_bad_length() -> None:
    with pytest.raises(ValueError):
        c.ed25519_sign(b"\x00" * 33, b"data")


def test_ed25519_verify_roundtrip() -> None:
    pub, sk = c.ed25519_keypair_from_seed(ED_SEED)
    msg = b"the tiny.place relay"
    sig = c.ed25519_sign(sk, msg)
    assert c.ed25519_verify(pub, msg, sig) is True


def test_ed25519_verify_rejects_tampering() -> None:
    assert c.ed25519_verify(ED_PUB, b"", ED_SIG_EMPTY) is True
    assert c.ed25519_verify(ED_PUB, b"x", ED_SIG_EMPTY) is False
    bad = bytearray(ED_SIG_EMPTY)
    bad[0] ^= 0xFF
    assert c.ed25519_verify(ED_PUB, b"", bytes(bad)) is False


def test_ed25519_verify_rejects_wrong_signature_length() -> None:
    assert c.ed25519_verify(ED_PUB, b"", b"\x00" * 63) is False


def test_ed25519_seed_to_x25519_private_matches_libsodium() -> None:
    _pub, sk = c.ed25519_keypair_from_seed(ED_SEED)
    assert (
        c.ed25519_seed_to_x25519_private(ED_SEED)
        == crypto_sign_ed25519_sk_to_curve25519(sk)
    )


def test_ed25519_seed_to_x25519_keypair() -> None:
    pair = c.ed25519_seed_to_x25519_keypair(ED_SEED)
    assert pair.private_key == c.ed25519_seed_to_x25519_private(ED_SEED)
    assert pair.public_key == crypto_scalarmult_base_pub(pair.private_key)


def test_ed25519_pub_to_x25519_pub_matches_libsodium() -> None:
    assert (
        c.ed25519_pub_to_x25519_pub(ED_PUB)
        == crypto_sign_ed25519_pk_to_curve25519(ED_PUB)
    )


def test_ed_to_x_conversion_yields_matching_dh() -> None:
    # Converting both halves of an Ed25519 identity to X25519 must produce a
    # key pair whose own public matches the converted public.
    pair = c.ed25519_seed_to_x25519_keypair(ED_SEED)
    converted_pub = c.ed25519_pub_to_x25519_pub(ED_PUB)
    assert pair.public_key == converted_pub


def test_ed25519_seed_to_x25519_rejects_wrong_length_seed() -> None:
    for bad in (b"", b"\x00" * 31, b"\x00" * 33):
        with pytest.raises(ValueError):
            c.ed25519_seed_to_x25519_private(bad)
        with pytest.raises(ValueError):
            c.ed25519_seed_to_x25519_keypair(bad)


def crypto_scalarmult_base_pub(private_key: bytes) -> bytes:
    return crypto_scalarmult_base(private_key)


# --------------------------------------------------------------------------
# HKDF / chain KDFs
# --------------------------------------------------------------------------


def test_hkdf_rfc5869_case1() -> None:
    ikm = bytes.fromhex("0b" * 22)
    salt = bytes.fromhex("000102030405060708090a0b0c")
    info = bytes.fromhex("f0f1f2f3f4f5f6f7f8f9")
    expected = bytes.fromhex(
        "3cb25f25faacd57a90434f64d0362f2a"
        "2d2d0a90cf1a5a4c5db02d56ecc4c5bf"
        "34007208d5b887185865"
    )
    assert c.hkdf(ikm, salt, info, 42) == expected


def test_hkdf_rfc5869_case3_empty_salt_and_info() -> None:
    ikm = bytes.fromhex("0b" * 22)
    expected = bytes.fromhex(
        "8da4e775a563c18f715f802a063c5a31"
        "b8a11f5c5ee1879ec3454e5f3c738d2d"
        "9d201395faa4b61a96c8"
    )
    assert c.hkdf(ikm, b"", b"", 42) == expected


def test_kdf_root_key_is_deterministic_and_split() -> None:
    root = bytes(range(32))
    dh = bytes(range(32, 64))
    new_root, chain = c.kdf_root_key(root, dh)
    assert len(new_root) == 32
    assert len(chain) == 32
    # Deterministic.
    assert c.kdf_root_key(root, dh) == (new_root, chain)
    # The two halves of the 64-byte HKDF output differ.
    assert new_root != chain


def test_kdf_chain_key_advances() -> None:
    chain = bytes([7]) * 32
    next_chain, message_key = c.kdf_chain_key(chain)
    assert len(next_chain) == 32
    assert len(message_key) == 32
    assert next_chain != message_key
    assert next_chain != chain
    # Matches the explicit HMAC seeds used by crypto.ts.
    assert next_chain == c.compute_hmac(chain, b"\x02")
    assert message_key == c.compute_hmac(chain, b"\x01")


def test_derive_message_keys_sizes_and_determinism() -> None:
    mk = bytes(range(32))
    enc, mac, iv = c.derive_message_keys(mk)
    assert (len(enc), len(mac), len(iv)) == (32, 32, 16)
    assert c.derive_message_keys(mk) == (enc, mac, iv)
    assert enc != mac


# --------------------------------------------------------------------------
# AES-256-CBC core
# --------------------------------------------------------------------------


def test_aes256_block_fips197_c3() -> None:
    # FIPS-197 Appendix C.3 known answer for AES-256.
    key = bytes.fromhex(
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
    )
    pt = bytes.fromhex("00112233445566778899aabbccddeeff")
    ct = bytes.fromhex("8ea2b7ca516745bfeafc49904b496089")
    words = _expand_key(key)
    assert _aes_encrypt_block(pt, words, 14) == ct
    assert _aes_decrypt_block(ct, words, 14) == pt


def test_aes_cbc_multiblock_roundtrip() -> None:
    key = bytes(range(32))
    iv = bytes(range(16))
    plaintext = b"signal protocol over AES-256-CBC with multiple blocks!!"
    ct = c.aes_encrypt(key, iv, plaintext)
    # PKCS#7 padding rounds up to a whole block.
    assert len(ct) % 16 == 0
    assert c.aes_decrypt(key, iv, ct) == plaintext


def test_aes_cbc_pkcs7_full_block_padding() -> None:
    key = bytes(range(32))
    iv = bytes(range(16))
    plaintext = b"\x00" * 16  # exact block -> an extra full pad block
    ct = c.aes_encrypt(key, iv, plaintext)
    assert len(ct) == 32
    assert c.aes_decrypt(key, iv, ct) == plaintext


def test_aes_rejects_bad_key_and_iv() -> None:
    with pytest.raises(ValueError):
        c.aes_encrypt(b"\x00" * 16, b"\x00" * 16, b"x")
    with pytest.raises(ValueError):
        c.aes_encrypt(b"\x00" * 32, b"\x00" * 8, b"x")


def test_aes_decrypt_rejects_bad_length() -> None:
    with pytest.raises(ValueError):
        c.aes_decrypt(b"\x00" * 32, b"\x00" * 16, b"\x00" * 15)


def test_aes_decrypt_rejects_corrupt_padding() -> None:
    key = bytes(range(32))
    iv = bytes(range(16))
    ct = bytearray(c.aes_encrypt(key, iv, b"hello"))
    ct[-1] ^= 0xFF  # corrupt last ciphertext byte -> bad padding after decrypt
    with pytest.raises(ValueError):
        c.aes_decrypt(key, iv, bytes(ct))


# --------------------------------------------------------------------------
# AEAD (encrypt/decrypt)
# --------------------------------------------------------------------------


def test_aead_roundtrip_with_associated_data() -> None:
    mk = bytes(range(1, 33))
    ad = b"sender:recipient:counter"
    pt = b"hello, encrypted relay"
    ct = c.encrypt(mk, pt, ad)
    # ciphertext = AES-CBC blocks + 8-byte truncated MAC.
    assert len(ct) >= 8
    assert (len(ct) - 8) % 16 == 0
    assert c.decrypt(mk, ct, ad) == pt


def test_aead_empty_plaintext_roundtrip() -> None:
    mk = bytes(range(32))
    ct = c.encrypt(mk, b"", b"ad")
    assert c.decrypt(mk, ct, b"ad") == b""


def test_aead_rejects_tampered_ciphertext() -> None:
    mk = bytes(range(32))
    ct = bytearray(c.encrypt(mk, b"secret", b"ad"))
    ct[0] ^= 0x01
    with pytest.raises(ValueError, match="MAC verification failed"):
        c.decrypt(mk, bytes(ct), b"ad")


def test_aead_rejects_wrong_associated_data() -> None:
    mk = bytes(range(32))
    ct = c.encrypt(mk, b"secret", b"ad-one")
    with pytest.raises(ValueError, match="MAC verification failed"):
        c.decrypt(mk, ct, b"ad-two")


def test_aead_rejects_short_ciphertext() -> None:
    with pytest.raises(ValueError, match="too short"):
        c.decrypt(bytes(range(32)), b"\x00" * 4, b"ad")


def test_compute_hmac_known_answer() -> None:
    # RFC 4231 HMAC-SHA256 Test Case 1.
    key = bytes.fromhex("0b" * 20)
    data = b"Hi There"
    expected = bytes.fromhex(
        "b0344c61d8db38535ca8afceaf0bf12b"
        "881dc200c9833da726e9376c2e32cff7"
    )
    assert c.compute_hmac(key, data) == expected


# --------------------------------------------------------------------------
# Encoding helpers
# --------------------------------------------------------------------------


def test_base64_roundtrip() -> None:
    raw = bytes(range(256))
    encoded = c.to_base64(raw)
    assert isinstance(encoded, str)
    assert c.from_base64(encoded) == raw


def test_base64_known_answer() -> None:
    assert c.to_base64(b"hello") == "aGVsbG8="
    assert c.from_base64("aGVsbG8=") == b"hello"


# --------------------------------------------------------------------------
# Cross-SDK interop vectors
# --------------------------------------------------------------------------
# Fixed expected outputs for the ratchet KDFs and message AEAD, pinned against
# an INDEPENDENT reference (Node's built-in `crypto` HKDF/HMAC + WebCrypto
# AES-CBC) that reproduces the TypeScript SDK's `crypto.ts` derivations bit for
# bit (same "WhisperRatchet"/"WhisperMessageKeys" HKDF labels, same 64/80-byte
# expansions, same Encrypt-then-MAC with an 8-byte truncated tag). Because the
# reference is not this Python code, a mirrored label/order/truncation bug would
# break these even though the local round-trip tests still pass. Full
# TS-runtime interop lands in issue #48.

_VEC_ROOT = bytes([0x01]) * 32
_VEC_DH = bytes([0x02]) * 32
_VEC_MK = bytes([0x03]) * 32
_VEC_PT = b"hello signal"
_VEC_AD = bytes([0x04]) * 16


def test_kdf_root_key_matches_interop_vector() -> None:
    new_root, chain = c.kdf_root_key(_VEC_ROOT, _VEC_DH)
    assert new_root == bytes.fromhex(
        "5f8b3480a53acf984c4d253e8f836d3b3f17548503439e1688548a97ea31d236"
    )
    assert chain == bytes.fromhex(
        "71034857a2226c213eac473a6391c7bf08457662dc051d4975cc24511e20fa03"
    )


def test_derive_message_keys_matches_interop_vector() -> None:
    enc_key, mac_key, iv = c.derive_message_keys(_VEC_MK)
    assert enc_key == bytes.fromhex(
        "4e49c1c6fab89f20f8ca68d761485321627952418a1fa072d7545464644f32a8"
    )
    assert mac_key == bytes.fromhex(
        "1363f039cd98e87d1a96b0be411c527546ef36292fc792e6a3db903f27e959d6"
    )
    assert iv == bytes.fromhex("20f19a8e812b19bae9240d4987597470")


def test_encrypt_matches_interop_vector() -> None:
    ciphertext = c.encrypt(_VEC_MK, _VEC_PT, _VEC_AD)
    assert ciphertext == bytes.fromhex(
        "eda6b810d4f11c8f2c9d33cb0565f315c223a08049b7f2a3"
    )
    # And it round-trips back through decrypt.
    assert c.decrypt(_VEC_MK, ciphertext, _VEC_AD) == _VEC_PT
