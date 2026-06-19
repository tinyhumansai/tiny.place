import { Signer } from "./signer.js";
import {
  generateKeyPair,
  deriveCryptoId,
  publicKeyToBase64,
} from "./crypto.js";
import type { KeyPair } from "./crypto.js";
import { ed25519SeedToX25519KeyPair } from "./signal/crypto.js";
import type { X25519KeyPair } from "./signal/crypto.js";

/** Options shared by the LocalSigner factory methods. */
export interface LocalSignerOptions {
  /**
   * When true (the default), the signer mints a reusable SIWS ownership proof
   * and authenticates requests with it (the preferred scheme). Set to false to
   * fall back to per-request freshness-bound Ed25519 signatures ("raw"), which
   * is still required for delegated session keys, x402, and admin auth.
   */
  siws?: boolean;
  /**
   * SIWS chain id advertised in the minted proof (e.g. "solana:mainnet"). The
   * backend derives the wallet from the signing key, so this is informational.
   */
  siwsNetwork?: string;
  /** Origin/URI recorded in the SIWS message. Defaults to https://tiny.place. */
  siwsOrigin?: string;
}

// A minted SIWS proof is reusable until it expires; mirror the website's 7-day
// window so a single mint covers a long-lived agent session.
const SIWS_TIME_TO_LIVE_MS = 7 * 24 * 60 * 60 * 1000;

export class LocalSigner extends Signer {
  readonly agentId: string;
  readonly publicKeyBase64: string;
  readonly publicKey: Uint8Array;

  private readonly privateKey: CryptoKey;
  private readonly siwsEnabled: boolean;
  private readonly siwsNetwork: string;
  private readonly siwsOrigin: string;
  private siwsToken: string | undefined;

  private constructor(keyPair: KeyPair, options?: LocalSignerOptions) {
    super();
    this.publicKey = keyPair.publicKey;
    this.privateKey = keyPair.privateKey;
    this.agentId = deriveCryptoId(keyPair.publicKey);
    this.publicKeyBase64 = publicKeyToBase64(keyPair.publicKey);
    this.siwsEnabled = options?.siws ?? true;
    this.siwsNetwork = options?.siwsNetwork ?? "solana:mainnet";
    this.siwsOrigin = options?.siwsOrigin ?? "https://tiny.place";
  }

  /** Construct and pre-mint the SIWS proof (when enabled) before returning. */
  private static async create(
    keyPair: KeyPair,
    options?: LocalSignerOptions,
  ): Promise<LocalSigner> {
    const signer = new LocalSigner(keyPair, options);
    if (signer.siwsEnabled) {
      await signer.mintSiws();
    }
    return signer;
  }

  static async generate(options?: LocalSignerOptions): Promise<LocalSigner> {
    const keyPair = await generateKeyPair();
    return LocalSigner.create(keyPair, options);
  }

  static async fromPrivateKey(
    privateKey: CryptoKey,
    options?: LocalSignerOptions,
  ): Promise<LocalSigner> {
    const crypto = globalThis.crypto;
    const jwk = await crypto.subtle.exportKey("jwk", privateKey);
    const publicOnlyJwk = { ...jwk, d: undefined, key_ops: ["verify"] };
    const publicCryptoKey = await crypto.subtle.importKey(
      "jwk",
      publicOnlyJwk,
      { name: "Ed25519" },
      true,
      ["verify"],
    );
    const publicKeyRaw = new Uint8Array(
      await crypto.subtle.exportKey("raw", publicCryptoKey),
    );
    return LocalSigner.create({ publicKey: publicKeyRaw, privateKey }, options);
  }

  static fromKeyPair(keyPair: KeyPair): LocalSigner {
    // Synchronous construction cannot pre-mint the SIWS proof (signing is async),
    // so this low-level path authenticates with raw signatures. Use an async
    // factory (generate/fromSeed/fromSolanaSecretKey) to default to SIWS.
    return new LocalSigner(keyPair, { siws: false });
  }

  /**
   * Derives a deterministic signer from a 32-byte Ed25519 seed. The same seed
   * always yields the same identity (agentId, public key, and X25519 keys),
   * which makes it suitable for recovering an encryption identity from a value
   * the user can reproduce (e.g. a wallet signature over a fixed message).
   *
   * @param seed - Exactly 32 bytes of secret seed material.
   * @returns A signer backed by the derived Ed25519 key.
   */
  static async fromSeed(
    seed: Uint8Array,
    options?: LocalSignerOptions,
  ): Promise<LocalSigner> {
    if (seed.length !== 32) {
      throw new Error(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
    }
    // PKCS#8 PrivateKeyInfo prefix for an Ed25519 key, followed by the raw seed.
    const prefix = new Uint8Array([
      0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
      0x04, 0x22, 0x04, 0x20,
    ]);
    const pkcs8 = new Uint8Array(prefix.length + seed.length);
    pkcs8.set(prefix, 0);
    pkcs8.set(seed, prefix.length);
    const privateKey = await globalThis.crypto.subtle.importKey(
      "pkcs8",
      pkcs8,
      { name: "Ed25519" },
      true,
      ["sign"],
    );
    return LocalSigner.fromPrivateKey(privateKey, options);
  }

  /**
   * Recovers a signer from a Solana CLI/wallet secret key. Solana exports
   * Ed25519 keys as either a 32-byte seed or a 64-byte secret key containing
   * the 32-byte seed followed by the public key.
   *
   * @param secretKey - Base58 string or raw bytes from a Solana keypair.
   * @returns A signer backed by the Solana Ed25519 identity key.
   */
  static async fromSolanaSecretKey(
    secretKey: string | Uint8Array,
    options?: LocalSignerOptions,
  ): Promise<LocalSigner> {
    const secretBytes =
      typeof secretKey === "string" ? decodeBase58(secretKey) : secretKey;
    if (secretBytes.length !== 32 && secretBytes.length !== 64) {
      throw new Error(
        `Solana secret key must be 32 or 64 bytes, got ${secretBytes.length}`,
      );
    }

    const signer = await LocalSigner.fromSeed(secretBytes.slice(0, 32), options);
    if (secretBytes.length === 64) {
      const expectedPublicKey = secretBytes.slice(32);
      if (!bytesEqual(signer.publicKey, expectedPublicKey)) {
        throw new Error("Solana secret key public key does not match seed");
      }
    }
    return signer;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    const crypto = globalThis.crypto;
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    const sig = await crypto.subtle.sign("Ed25519", this.privateKey, buffer);
    return new Uint8Array(sig);
  }

  async getX25519KeyPair(): Promise<X25519KeyPair> {
    const crypto = globalThis.crypto;
    const jwk = await crypto.subtle.exportKey("jwk", this.privateKey);
    const seed = base64urlToBytes(jwk.d!);
    return ed25519SeedToX25519KeyPair(seed);
  }

  /**
   * Returns the cached SIWS proof token used to authenticate requests, or an
   * empty string when SIWS is disabled (callers then fall back to raw
   * signatures). The SDK auth helpers prefer this token when it is present.
   */
  siwsSignature(): string {
    return this.siwsToken ?? "";
  }

  /**
   * Mints (or re-mints) the reusable SIWS ownership proof by signing a Sign-In
   * With Solana message with this key. Called automatically by the async
   * factories; can be invoked again to refresh an expired proof.
   */
  async mintSiws(): Promise<void> {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + SIWS_TIME_TO_LIVE_MS);
    const message = [
      "tiny.place wants you to sign in with your Solana account:",
      this.agentId,
      "",
      "Authenticate website API requests. This does not authorize a transaction or payment.",
      "",
      `URI: ${this.siwsOrigin}`,
      "Version: 1",
      `Chain ID: ${this.siwsNetwork}`,
      `Nonce: ${generateSiwsNonce()}`,
      `Issued At: ${issuedAt.toISOString()}`,
      `Expiration Time: ${expiresAt.toISOString()}`,
    ].join("\n");
    const messageBytes = new TextEncoder().encode(message);
    const signature = await this.sign(messageBytes);
    const token = {
      signedMessage: bytesToBase64(messageBytes),
      signature: bytesToBase64(signature),
      signatureType: "ed25519",
    };
    this.siwsToken = `siws:${utf8ToBase64Url(JSON.stringify(token))}`;
  }
}

function generateSiwsNonce(): string {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function utf8ToBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i]! ^ right[i]!;
  }
  return diff === 0;
}

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  const padded = b64 + "=".repeat(pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
