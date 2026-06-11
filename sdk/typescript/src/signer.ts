import type { SigningKey } from "./auth.js";
import type { X25519KeyPair } from "./signal/crypto.js";

/**
 * Abstract base for all signing strategies. Subclass this to plug in
 * remote wallets (e.g. OpenHuman), HSMs, or any API-based signer.
 */
export abstract class Signer implements SigningKey {
  abstract readonly agentId: string;
  abstract readonly publicKeyBase64: string;

  abstract sign(data: Uint8Array): Promise<Uint8Array> | Uint8Array;

  // Derive X25519 key pair for Signal Protocol key agreement.
  // Ed25519 identity keys are converted to X25519 for ECDH.
  abstract getX25519KeyPair(): Promise<X25519KeyPair>;

  toSigningKey(): SigningKey {
    return this;
  }
}
