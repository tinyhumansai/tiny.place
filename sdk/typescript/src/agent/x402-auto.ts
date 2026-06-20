/**
 * Auto-settlement of x402 (HTTP 402) payment challenges.
 *
 * Every paid action on tiny.place follows one shape: attempt it without payment,
 * catch the 402, sign an authorization map against the returned challenge, then
 * retry with `payment`. {@link withAutoPayment} captures that loop once so a
 * facade method (register a handle, renew, buy a product) can opt into paying
 * without hand-rolling the try/catch each time.
 *
 * This consolidates the logic that previously lived in the OpenClaw plugin's
 * `shared.ts`, reusing the flagship `TinyPlaceError`/`PaymentChallenge` types and
 * `buildX402PaymentMap` rather than re-declaring them.
 */
import type { SigningKey } from "../auth.js";
import { TinyPlaceError, type PaymentChallenge } from "../http.js";
import {
  buildX402PaymentMap,
  generateNonce,
  type X402PaymentMap,
  type X402Scheme,
} from "../x402.js";

/** A signer that can authorize x402 payments: an Ed25519 key plus its base64 form. */
export interface X402Signer extends SigningKey {
  publicKeyBase64: string;
}

/** How long a freshly-signed payment authorization stays valid (5 minutes). */
const PAYMENT_TTL_MS = 5 * 60 * 1000;

/**
 * Extract the x402 challenge from a 402 error, if present. Prefers the parsed
 * `paymentRequired.payment` that `TinyPlaceError` already surfaces, falling back
 * to a `payment` field on the raw body.
 */
export function challengeOf(error: unknown): PaymentChallenge | undefined {
  if (!(error instanceof TinyPlaceError) || error.status !== 402) {
    return undefined;
  }
  return error.paymentRequired?.payment ?? challengeFromBody(error.body);
}

function challengeFromBody(body: unknown): PaymentChallenge | undefined {
  if (body !== null && typeof body === "object" && "payment" in body) {
    const payment = (body as { payment?: unknown }).payment;
    if (payment !== null && typeof payment === "object") {
      return payment as PaymentChallenge;
    }
  }
  return undefined;
}

/**
 * Build a signed x402 payment map from a 402 challenge. Mirrors the website's
 * settlement: signs the authorization with the wallet's Ed25519 key, defaults
 * `from` to the signer and a fresh nonce, and merges the caller's `metadata`
 * (e.g. purpose / target ids) over the challenge's own.
 */
export async function payFromChallenge(
  signer: X402Signer,
  challenge: PaymentChallenge,
  metadata: Record<string, string> = {},
): Promise<X402PaymentMap> {
  if (
    !challenge.network ||
    !challenge.asset ||
    !challenge.amount ||
    !challenge.to
  ) {
    throw new Error("payment challenge is missing network/asset/amount/to");
  }
  return buildX402PaymentMap(signer, {
    scheme: (challenge.scheme as X402Scheme | undefined) ?? "exact",
    network: challenge.network,
    asset: challenge.asset,
    amount: challenge.amount,
    from: challenge.from || signer.agentId,
    to: challenge.to,
    nonce: challenge.nonce || generateNonce("tp"),
    ...(challenge.expiresAt ? { expiresAt: challenge.expiresAt } : {}),
    expiresInMs: PAYMENT_TTL_MS,
    publicKeyBase64: signer.publicKeyBase64,
    metadata: { ...(challenge.metadata ?? {}), ...metadata },
  });
}

/** Options for {@link withAutoPayment}. */
export interface WithAutoPaymentOptions {
  /** Extra metadata merged into the signed payment authorization. */
  metadata?: Record<string, string>;
}

/**
 * Run `attempt()`; if it throws an x402 402, build the payment map from the
 * challenge and retry once with payment. `attempt` receives the payment map so
 * the caller threads it into the right request field (register/renew/buy each
 * place it differently). A non-402 error, or a 402 lacking a usable challenge,
 * propagates unchanged.
 */
export async function withAutoPayment<T>(
  signer: X402Signer,
  attempt: (payment?: X402PaymentMap) => Promise<T>,
  options: WithAutoPaymentOptions = {},
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    const challenge = challengeOf(error);
    if (!challenge) {
      throw error;
    }
    const payment = await payFromChallenge(signer, challenge, options.metadata);
    return attempt(payment);
  }
}
