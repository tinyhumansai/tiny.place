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
 * actually signed it. Wallet signers contribute `{ publicKey }`; signers that
 * implement {@link X402MetadataSigner} can contribute additional fields.
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
 * Returns the registered wallet public key for identity-bound request fields.
 * Signers implementing {@link IdentityPublicKeySigner} can expose an identity
 * key distinct from the key that signs requests.
 */
export function identityPublicKey(signer: SigningKey): string | undefined {
  if (hasIdentityPublicKey(signer)) {
    return signer.identityPublicKeyBase64;
  }
  return publicKeyBase64FromSigner(signer);
}
