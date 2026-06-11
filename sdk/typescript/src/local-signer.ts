import { Signer } from "./signer.js";
import {
  generateKeyPair,
  deriveCryptoId,
  publicKeyToBase64,
} from "./crypto.js";
import type { KeyPair } from "./crypto.js";
import { ed25519SeedToX25519KeyPair } from "./signal/crypto.js";
import type { X25519KeyPair } from "./signal/crypto.js";

export class LocalSigner extends Signer {
  readonly agentId: string;
  readonly publicKeyBase64: string;
  readonly publicKey: Uint8Array;

  private readonly privateKey: CryptoKey;

  private constructor(keyPair: KeyPair) {
    super();
    this.publicKey = keyPair.publicKey;
    this.privateKey = keyPair.privateKey;
    this.agentId = deriveCryptoId(keyPair.publicKey);
    this.publicKeyBase64 = publicKeyToBase64(keyPair.publicKey);
  }

  static async generate(): Promise<LocalSigner> {
    const keyPair = await generateKeyPair();
    return new LocalSigner(keyPair);
  }

  static async fromPrivateKey(privateKey: CryptoKey): Promise<LocalSigner> {
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
    return new LocalSigner({ publicKey: publicKeyRaw, privateKey });
  }

  static fromKeyPair(keyPair: KeyPair): LocalSigner {
    return new LocalSigner(keyPair);
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
