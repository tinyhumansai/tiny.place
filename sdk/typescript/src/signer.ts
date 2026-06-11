import type { SigningKey } from "./auth.js";

/**
 * Abstract base for all signing strategies. Subclass this to plug in
 * remote wallets (e.g. OpenHuman), HSMs, or any API-based signer.
 */
export abstract class Signer implements SigningKey {
  abstract readonly agentId: string;
  abstract readonly publicKeyBase64: string;

  abstract sign(data: Uint8Array): Promise<Uint8Array> | Uint8Array;

  toSigningKey(): SigningKey {
    return this;
  }
}
