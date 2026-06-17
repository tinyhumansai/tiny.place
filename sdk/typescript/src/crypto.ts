import { sha256 } from "@noble/hashes/sha2.js";
import type { SigningKey } from "./auth.js";

const crypto = globalThis.crypto;

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: CryptoKey;
}

export async function generateKeyPair(): Promise<KeyPair> {
  const pair = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);
  const publicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  );
  return { publicKey: publicKeyRaw, privateKey: pair.privateKey };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Byte length of a raw Ed25519 public key. */
const ED25519_PUBLIC_KEY_BYTES = 32;

export function publicKeyToHex(publicKey: Uint8Array): string {
  return toHex(publicKey);
}

export function publicKeyToBase64(publicKey: Uint8Array): string {
  return toBase64(publicKey);
}

export function publicKeyToSolanaAddress(publicKey: Uint8Array): string {
  let encoded = 0n;
  for (const byte of publicKey) {
    encoded = (encoded << 8n) + BigInt(byte);
  }

  let value = "";
  while (encoded > 0n) {
    const digit = Number(encoded % 58n);
    value = BASE58_ALPHABET[digit]! + value;
    encoded /= 58n;
  }

  for (const byte of publicKey) {
    if (byte !== 0) break;
    value = "1" + value;
  }

  return value || "1";
}

export function deriveCryptoId(publicKey: Uint8Array): string {
  return publicKeyToSolanaAddress(publicKey);
}

function decodeBase58(value: string): Uint8Array {
  if (value.length === 0) {
    return new Uint8Array();
  }
  let decoded = 0n;
  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit === -1) {
      throw new Error(`Invalid base58 character: ${char}`);
    }
    decoded = decoded * 58n + BigInt(digit);
  }
  const bytes: Array<number> = [];
  while (decoded > 0n) {
    bytes.push(Number(decoded & 0xffn));
    decoded >>= 8n;
  }
  bytes.reverse();
  let leadingZeroes = 0;
  for (const char of value) {
    if (char !== "1") break;
    leadingZeroes += 1;
  }
  const result = new Uint8Array(leadingZeroes + bytes.length);
  result.set(bytes, leadingZeroes);
  return result;
}

/**
 * Recovers the base64 public key from a cryptoId (the inverse of
 * {@link deriveCryptoId}, since a wallet cryptoId is the base58 encoding of its
 * Ed25519 public key). Directory-card writers use this so a wallet-only card's
 * `publicKey` derives its `cryptoId`, independent of which key currently signs
 * requests (e.g. a hot session key that differs from the wallet key).
 *
 * @throws If `cryptoId` is not valid base58 (e.g. an `@handle`), or does not
 * decode to a 32-byte Ed25519 public key.
 */
export function cryptoIdToPublicKeyBase64(cryptoId: string): string {
  const publicKeyBytes = decodeBase58(cryptoId);
  if (publicKeyBytes.length !== ED25519_PUBLIC_KEY_BYTES) {
    throw new Error(
      `cryptoId does not decode to a ${ED25519_PUBLIC_KEY_BYTES}-byte Ed25519 public key (got ${publicKeyBytes.length} bytes)`,
    );
  }
  return publicKeyToBase64(publicKeyBytes);
}

export function sha256Hex(data: Uint8Array | string): string {
  const input =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  return toHex(sha256(input));
}

export function canonicalPayload(
  action: string,
  fields: Record<string, unknown>,
): string {
  return stableStringify({ action, fields });
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      output[key] = sortValue(input[key]);
    }
    return output;
  }

  return value;
}

export function createSigningKey(
  agentId: string,
  privateKey: CryptoKey,
): SigningKey {
  return {
    agentId,
    async sign(data: Uint8Array): Promise<Uint8Array> {
      const buffer = new ArrayBuffer(data.byteLength);
      new Uint8Array(buffer).set(data);
      const sig = await crypto.subtle.sign("Ed25519", privateKey, buffer);
      return new Uint8Array(sig);
    },
  };
}
