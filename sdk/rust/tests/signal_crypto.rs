//! Known-answer + interop tests for the Signal crypto primitives. Vectors are
//! the RFC 7748 (X25519) and RFC 8032 (Ed25519) test vectors, matching the
//! Python port's crypto tests so the Rust port stays byte-compatible.

use ed25519_dalek::SigningKey;
use tinyplace::signal::crypto::{
    decrypt, derive_message_keys, ed25519_pub_to_x25519_pub, ed25519_seed_to_x25519_keypair,
    ed25519_seed_to_x25519_private, encrypt, generate_x25519_keypair, kdf_chain_key, kdf_root_key,
    x25519_public_key, x25519_shared_secret,
};

fn hex32(s: &str) -> [u8; 32] {
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap();
    }
    out
}

// RFC 8032 Ed25519 test vector 1.
const ED_SEED: &str = "9d61b19deffebc3a73c632cc930009b6c11a6a3a87ca9a7c2bb59e9d8d3f6d2c";
const ED_PUB: &str = "ec5f8b680397c8aab0f17e6b801dc855603f11b17a948a297a7db6823c7787c4";

#[test]
fn x25519_shared_secret_rfc7748() {
    // RFC 7748 §5.2.
    let priv_key = hex32("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4");
    let pub_key = hex32("e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c");
    let expected = hex32("c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552");
    assert_eq!(x25519_shared_secret(&priv_key, &pub_key), expected);
}

#[test]
fn x25519_keypair_dh_agrees_both_ways() {
    let alice = generate_x25519_keypair();
    let bob = generate_x25519_keypair();
    assert_ne!(alice.public_key, bob.public_key);
    let ab = x25519_shared_secret(&alice.private_key, &bob.public_key);
    let ba = x25519_shared_secret(&bob.private_key, &alice.public_key);
    assert_eq!(ab, ba);
}

#[test]
fn ed25519_to_x25519_conversions_are_consistent() {
    let seed = hex32(ED_SEED);
    // Sanity-check the vector against ed25519-dalek's own pubkey derivation.
    let ed_pub = SigningKey::from_bytes(&seed).verifying_key().to_bytes();
    assert_eq!(ed_pub, hex32(ED_PUB));

    // The X25519 public key derived from the seed's private scalar must equal
    // the X25519 public key converted from the Ed25519 public key.
    let from_private = x25519_public_key(&ed25519_seed_to_x25519_private(&seed));
    let from_ed_pub = ed25519_pub_to_x25519_pub(&ed_pub).unwrap();
    assert_eq!(from_private, from_ed_pub);

    // The keypair helper agrees with the standalone private derivation.
    assert_eq!(
        ed25519_seed_to_x25519_keypair(&seed).public_key,
        from_private
    );
}

#[test]
fn kdf_root_and_chain_are_deterministic() {
    let root = [7u8; 32];
    let dh = [9u8; 32];
    let (r1, c1) = kdf_root_key(&root, &dh);
    let (r2, c2) = kdf_root_key(&root, &dh);
    assert_eq!((r1, c1), (r2, c2));
    assert_ne!(r1, c1);

    let (next_chain, message_key) = kdf_chain_key(&c1);
    assert_ne!(next_chain, message_key);
    // Advancing again yields a different chain key (ratchet moves forward).
    assert_ne!(kdf_chain_key(&next_chain).0, next_chain);
}

#[test]
fn derive_message_keys_lengths_and_determinism() {
    let mk = [3u8; 32];
    let (enc1, mac1, iv1) = derive_message_keys(&mk);
    let (enc2, mac2, iv2) = derive_message_keys(&mk);
    assert_eq!((enc1, mac1, iv1), (enc2, mac2, iv2));
    assert_ne!(enc1, mac1);
}

#[test]
fn aead_round_trip() {
    let mk = [42u8; 32];
    let plaintext = b"the quick brown fox jumps over a tiny place";
    let ad = b"associated-data";
    let sealed = encrypt(&mk, plaintext, ad);
    // Output is deterministic (iv derives from the message key).
    assert_eq!(sealed, encrypt(&mk, plaintext, ad));
    let opened = decrypt(&mk, &sealed, ad).unwrap();
    assert_eq!(opened, plaintext);
}

#[test]
fn aead_rejects_tampered_mac() {
    let mk = [42u8; 32];
    let ad = b"ad";
    let mut sealed = encrypt(&mk, b"secret", ad);
    let last = sealed.len() - 1;
    sealed[last] ^= 0x01;
    assert!(decrypt(&mk, &sealed, ad).is_err());
}

#[test]
fn aead_rejects_wrong_associated_data() {
    let mk = [42u8; 32];
    let sealed = encrypt(&mk, b"secret", b"ad-a");
    assert!(decrypt(&mk, &sealed, b"ad-b").is_err());
}
