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

export interface X402MetadataSigner {
  x402PaymentMetadata(): Record<string, string>;
}

export interface IdentityPublicKeySigner {
  readonly identityPublicKeyBase64: string;
}

function hasX402Metadata(
  signer: SigningKey,
): signer is SigningKey & X402MetadataSigner {
  return (
    typeof (signer as Partial<X402MetadataSigner>).x402PaymentMetadata ===
    "function"
  );
}

function hasIdentityPublicKey(
  signer: SigningKey,
): signer is SigningKey & IdentityPublicKeySigner {
  return (
    typeof (signer as Partial<IdentityPublicKeySigner>)
      .identityPublicKeyBase64 === "string"
  );
}

function publicKeyBase64FromSigner(signer: SigningKey): string | undefined {
  const candidate = signer as SigningKey & { publicKeyBase64?: unknown };
  return typeof candidate.publicKeyBase64 === "string"
    ? candidate.publicKeyBase64
    : undefined;
}

/**
 * Metadata that lets the backend verify an x402 signature against the key that
 * actually signed it. Direct wallet signers contribute `{ publicKey }`; hot
 * session signers can contribute `{ publicKey, parentNonce }`.
 */
export function signerPaymentMetadata(
  signer: SigningKey,
): Record<string, string> {
  if (hasX402Metadata(signer)) {
    return signer.x402PaymentMetadata();
  }
  const publicKey = publicKeyBase64FromSigner(signer);
  return publicKey ? { publicKey } : {};
}

/**
 * Returns the registered wallet/grantor public key for identity-bound request
 * fields. For a delegated session signer this differs from the session key
 * that signs requests.
 */
export function identityPublicKey(signer: SigningKey): string | undefined {
  if (hasIdentityPublicKey(signer)) {
    return signer.identityPublicKeyBase64;
  }
  return publicKeyBase64FromSigner(signer);
}
