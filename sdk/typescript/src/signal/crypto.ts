import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { webcrypto } from "node:crypto";

const HKDF_INFO = new TextEncoder().encode("WhisperRatchet");
const MESSAGE_KEY_INFO = new TextEncoder().encode("WhisperMessageKeys");
const CHAIN_KEY_SEED_MESSAGE = new Uint8Array([0x01]);
const CHAIN_KEY_SEED_CHAIN = new Uint8Array([0x02]);

export interface X25519KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export function generateX25519KeyPair(): X25519KeyPair {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

export function x25519SharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

export function ed25519SeedToX25519Private(seed: Uint8Array): Uint8Array {
  const hash = sha512(seed);
  const scalar = hash.slice(0, 32);
  scalar[0]! &= 248;
  scalar[31]! &= 127;
  scalar[31]! |= 64;
  return scalar;
}

export function ed25519SeedToX25519KeyPair(seed: Uint8Array): X25519KeyPair {
  const privateKey = ed25519SeedToX25519Private(seed);
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

// Edwards (Ed25519) public key → Montgomery (X25519) public key.
// Formula: u = (1 + y) / (1 - y) mod p, where p = 2^255 - 19.
const P = (1n << 255n) - 19n;

function modPow(base: bigint, exp: bigint, modulus: bigint): bigint {
  let result = 1n;
  base = ((base % modulus) + modulus) % modulus;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % modulus;
    exp >>= 1n;
    base = (base * base) % modulus;
  }
  return result;
}

function modInverse(a: bigint, modulus: bigint): bigint {
  return modPow(a, modulus - 2n, modulus);
}

export function ed25519PubToX25519Pub(edPub: Uint8Array): Uint8Array {
  // Ed25519 public key encodes the y-coordinate in little-endian with
  // the sign bit in the top bit of the last byte.
  const bytes = new Uint8Array(edPub);
  bytes[31] = bytes[31]! & 0x7f;
  let y = 0n;
  for (let i = 0; i < 32; i++) {
    y |= BigInt(bytes[i]!) << BigInt(8 * i);
  }
  const numerator = ((1n + y) % P + P) % P;
  const denominator = ((1n - y) % P + P) % P;
  const u = (numerator * modInverse(denominator, P)) % P;
  const result = new Uint8Array(32);
  let val = u;
  for (let i = 0; i < 32; i++) {
    result[i] = Number(val & 0xffn);
    val >>= 8n;
  }
  return result;
}

export function kdfRootKey(
  rootKey: Uint8Array,
  dhOutput: Uint8Array,
): { rootKey: Uint8Array; chainKey: Uint8Array } {
  const output = hkdf(sha256, dhOutput, rootKey, HKDF_INFO, 64);
  return {
    rootKey: output.slice(0, 32),
    chainKey: output.slice(32, 64),
  };
}

export function kdfChainKey(chainKey: Uint8Array): {
  chainKey: Uint8Array;
  messageKey: Uint8Array;
} {
  const newChainKey = hmac(sha256, chainKey, CHAIN_KEY_SEED_CHAIN);
  const messageKey = hmac(sha256, chainKey, CHAIN_KEY_SEED_MESSAGE);
  return { chainKey: newChainKey, messageKey };
}

export function deriveMessageKeys(messageKey: Uint8Array): {
  encKey: Uint8Array;
  macKey: Uint8Array;
  iv: Uint8Array;
} {
  const output = hkdf(sha256, messageKey, new Uint8Array(32), MESSAGE_KEY_INFO, 80);
  return {
    encKey: output.slice(0, 32),
    macKey: output.slice(32, 64),
    iv: output.slice(64, 80),
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function aesEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const crypto = webcrypto as unknown as Crypto;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: toArrayBuffer(iv) },
    cryptoKey,
    toArrayBuffer(plaintext),
  );
  return new Uint8Array(ciphertext);
}

export async function aesDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const crypto = webcrypto as unknown as Crypto;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: toArrayBuffer(iv) },
    cryptoKey,
    toArrayBuffer(ciphertext),
  );
  return new Uint8Array(plaintext);
}

export function computeHmac(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data);
}

export async function encrypt(
  messageKey: Uint8Array,
  plaintext: Uint8Array,
  associatedData: Uint8Array,
): Promise<Uint8Array> {
  const { encKey, macKey, iv } = deriveMessageKeys(messageKey);
  const ciphertext = await aesEncrypt(encKey, iv, plaintext);
  const macInput = new Uint8Array(associatedData.length + ciphertext.length);
  macInput.set(associatedData);
  macInput.set(ciphertext, associatedData.length);
  const mac = computeHmac(macKey, macInput).slice(0, 8);
  const result = new Uint8Array(ciphertext.length + 8);
  result.set(ciphertext);
  result.set(mac, ciphertext.length);
  return result;
}

export async function decrypt(
  messageKey: Uint8Array,
  ciphertextWithMac: Uint8Array,
  associatedData: Uint8Array,
): Promise<Uint8Array> {
  const { encKey, macKey, iv } = deriveMessageKeys(messageKey);
  const ciphertext = ciphertextWithMac.slice(0, -8);
  const receivedMac = ciphertextWithMac.slice(-8);
  const macInput = new Uint8Array(associatedData.length + ciphertext.length);
  macInput.set(associatedData);
  macInput.set(ciphertext, associatedData.length);
  const computedMac = computeHmac(macKey, macInput).slice(0, 8);
  if (!constantTimeEqual(receivedMac, computedMac)) {
    throw new Error("MAC verification failed");
  }
  return aesDecrypt(encKey, iv, ciphertext);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
