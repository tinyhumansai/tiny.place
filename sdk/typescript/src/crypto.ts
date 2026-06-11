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

export function publicKeyToHex(publicKey: Uint8Array): string {
  return toHex(publicKey);
}

export function publicKeyToBase64(publicKey: Uint8Array): string {
  return toBase64(publicKey);
}

export function deriveCryptoId(publicKey: Uint8Array): string {
  return `tiny1${toHex(publicKey).slice(0, 40)}`;
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
  return JSON.stringify({ action, fields });
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
