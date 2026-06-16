/**
 * Shared platform helpers used across the agent surface modules
 * (`agent.ts`, `economy.ts`, `market.ts`): handle normalization plus the x402
 * "402 challenge → signed payment map" flow.
 *
 * All custodial settlement on tiny.place follows the same shape: attempt the
 * action without payment, catch the 402, sign an authorization map against the
 * returned challenge, then retry with `payment`. Centralizing it keeps every
 * economic command paying the same way the website does.
 */
import {
  buildX402PaymentMap,
  type LocalSigner,
  TinyPlaceError,
} from "@tinyhumansai/tinyplace";

/** Ensures a handle has a leading `@`. Rejects empty / whitespace-only input. */
export function normalizeHandle(name: string): string {
  const trimmed = name.trim();
  const normalized = trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
  if (normalized.length <= 1) {
    throw new Error("handle is empty");
  }
  return normalized;
}

export interface PaymentChallenge {
  scheme?: string;
  network?: string;
  asset?: string;
  amount?: string;
  from?: string;
  to?: string;
  nonce?: string;
  expiresAt?: string;
  metadata?: Record<string, string>;
}

/** Extracts the x402 challenge from a 402 response, if present. */
export function challengeOf(error: unknown): PaymentChallenge | undefined {
  if (error instanceof TinyPlaceError && error.status === 402) {
    const body = error.body as { payment?: PaymentChallenge } | undefined;
    return (
      (error.paymentRequired?.payment as PaymentChallenge | undefined) ??
      body?.payment
    );
  }
  return undefined;
}

/**
 * Builds an x402 payment map from a 402 challenge. Mirrors the website's
 * settlement: signs the authorization with the wallet's Ed25519 key, defaults
 * `from` to the signer and a fresh nonce, and merges the caller's `metadata`
 * (e.g. purpose / target ids) over the challenge's own.
 */
export async function payFromChallenge(
  signer: LocalSigner,
  challenge: PaymentChallenge,
  metadata: Record<string, string>,
): Promise<Record<string, string>> {
  if (!challenge.network || !challenge.asset || !challenge.amount || !challenge.to) {
    throw new Error("payment challenge is missing network/asset/amount/to");
  }
  return buildX402PaymentMap(signer, {
    scheme: challenge.scheme as never,
    network: challenge.network,
    asset: challenge.asset,
    amount: challenge.amount,
    from: challenge.from || signer.agentId,
    to: challenge.to,
    nonce: challenge.nonce || `tp-${globalThis.crypto.randomUUID()}`,
    ...(challenge.expiresAt ? { expiresAt: challenge.expiresAt } : {}),
    expiresInMs: 5 * 60 * 1000,
    publicKeyBase64: signer.publicKeyBase64,
    metadata: { ...(challenge.metadata ?? {}), ...metadata },
  });
}
