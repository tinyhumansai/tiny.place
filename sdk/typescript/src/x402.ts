import type { SigningKey } from "./auth.js";
import { signerPaymentMetadata } from "./signer.js";

export type X402Scheme = "exact";

export interface X402AuthorizationFields {
  scheme: X402Scheme;
  network: string;
  asset: string;
  amount: string;
  from: string;
  to: string;
  nonce: string;
  expiresAt: string;
  metadata?: Record<string, string>;
}

export interface X402Authorization extends X402AuthorizationFields {
  signature: string;
}

export type X402PaymentMap = Record<string, string>;

export interface X402PaymentReferenceOptions {
  onChainTx?: string;
  tx?: string;
  transaction?: string;
  ledgerTxId?: string;
  verifiedId?: string;
}

export interface X402PaymentAuthorizationOptions {
  scheme?: X402Scheme;
  network: string;
  asset: string;
  amount: string;
  from?: string;
  to: string;
  nonce?: string;
  expiresAt?: string;
  expiresInMs?: number;
  metadata?: Record<string, string>;
  domain?: string;
  publicKeyBase64?: string;
}

export type X402PaymentMapOptions = X402PaymentAuthorizationOptions &
  X402PaymentReferenceOptions;

function sortedMetadataEntries(
  metadata: Record<string, string> | undefined,
): Array<{ key: string; value: string }> | undefined {
  if (!metadata) return undefined;

  return Object.keys(metadata)
    .sort()
    .map((key) => ({ key, value: metadata[key]! }));
}

export function buildCanonicalMessage(fields: X402AuthorizationFields): string {
  const canonical: Record<string, unknown> = {
    domain: fields.metadata?.["domain"],
    scheme: fields.scheme,
    network: fields.network,
    asset: fields.asset,
    amount: fields.amount,
    from: fields.from,
    to: fields.to,
    nonce: fields.nonce,
    expiresAt: fields.expiresAt,
  };
  if (!canonical["domain"]) {
    delete canonical["domain"];
  }
  if (!canonical["expiresAt"]) {
    delete canonical["expiresAt"];
  }
  if (fields.metadata) {
    canonical["metadata"] = sortedMetadataEntries(fields.metadata);
  }
  return JSON.stringify(canonical);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function signX402Authorization(
  key: SigningKey,
  fields: X402AuthorizationFields,
): Promise<X402Authorization> {
  const message = buildCanonicalMessage(fields);
  const messageBytes = new TextEncoder().encode(message);
  const signature = await key.sign(messageBytes);
  assertNotSiwsToken(signature);
  return { ...fields, signature: toBase64(signature) };
}

/**
 * Guards every x402 payment against a signer whose `sign()` returns a reusable
 * SIWS proof token instead of a real signature over the payload. Request auth
 * uses the SIWS token (via `siwsSignature()`); a payment must carry a real
 * Ed25519 signature, or the facilitator rejects it with an opaque
 * "invalid signature". A SIWS-mode signer must delegate `sign()` to its wallet
 * (e.g. the website's SiwsProofSigner) so payments are signed for real.
 */
function assertNotSiwsToken(signature: Uint8Array): void {
  // A raw Ed25519 signature is exactly 64 bytes; a SIWS token is the UTF-8 of a
  // "siws:" string, which is both longer and starts with that prefix.
  if (signature.length === 64) {
    return;
  }
  const prefix = new TextDecoder().decode(signature.subarray(0, 5));
  if (prefix === "siws:") {
    throw new Error(
      "x402 payment signer returned a SIWS token instead of a real signature. " +
        "Payments must be signed with the wallet/session key — a SIWS-mode signer " +
        "must delegate sign() to its wallet; the SIWS token is for request auth only.",
    );
  }
}

export async function buildX402PaymentAuthorization(
  key: SigningKey,
  options: X402PaymentAuthorizationOptions,
): Promise<X402Authorization> {
  const metadata = {
    domain: options.domain ?? "tiny.place",
    ...signerPaymentMetadata(key),
    ...(options.publicKeyBase64 ? { publicKey: options.publicKeyBase64 } : {}),
    ...(options.metadata ?? {}),
  };
  const fields: X402AuthorizationFields = {
    scheme: options.scheme ?? "exact",
    network: options.network,
    asset: options.asset,
    amount: options.amount,
    from: options.from ?? key.agentId,
    to: options.to,
    nonce: options.nonce ?? generateNonce("pay"),
    expiresAt:
      options.expiresAt ??
      new Date(
        Date.now() + (options.expiresInMs ?? 5 * 60 * 1000),
      ).toISOString(),
    metadata,
  };
  return signX402Authorization(key, fields);
}

export async function buildX402PaymentMap(
  key: SigningKey,
  options: X402PaymentMapOptions,
): Promise<X402PaymentMap> {
  const references = paymentReferences(options);
  const authorization = await buildX402PaymentPayload(key, options);
  return {
    ...x402AuthorizationToPaymentMap(authorization),
    ...references,
  };
}

export async function buildX402PaymentPayload(
  key: SigningKey,
  options: X402PaymentMapOptions,
): Promise<X402Authorization> {
  const references = paymentReferences(options);
  return buildX402PaymentAuthorization(key, {
    ...options,
    metadata: {
      ...options.metadata,
      ...references,
    },
  });
}

export function x402AuthorizationToPaymentMap(
  authorization: X402Authorization,
): X402PaymentMap {
  const payment: X402PaymentMap = {
    scheme: authorization.scheme,
    network: authorization.network,
    asset: authorization.asset,
    amount: authorization.amount,
    from: authorization.from,
    to: authorization.to,
    nonce: authorization.nonce,
    expiresAt: authorization.expiresAt,
    signature: authorization.signature,
  };

  for (const [key, value] of Object.entries(authorization.metadata ?? {})) {
    payment[`metadata.${key}`] = value;
  }

  return payment;
}

/**
 * The canonical x402 v2 submission header. A migrated SDK (or any standard x402
 * client) base64-encodes the {@link X402PaymentEnvelope} and submits it in this
 * header. The legacy `X-PAYMENT` header is still accepted by the backend for
 * backwards compatibility.
 */
export const X402_PAYMENT_HEADER = "PAYMENT-SIGNATURE";

/**
 * The standard x402 v2 PaymentPayload envelope. A migrated SDK (or any standard
 * x402 client) base64-encodes this and submits it in the
 * {@link X402_PAYMENT_HEADER} (`PAYMENT-SIGNATURE`) header on the header-based
 * payment surfaces (e.g. a2a). tiny.place's authorization signature travels as
 * the scheme-specific `payload`.
 */
export interface X402PaymentEnvelope {
  x402Version: number;
  accepted: {
    scheme: X402Scheme;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: Record<string, string>;
  };
  payload: {
    signature: string;
    authorization: Record<string, string>;
  };
  extensions: Record<string, never>;
}

/** Builds the standard x402 v2 PaymentPayload envelope from an authorization. */
export function buildX402PaymentEnvelope(
  authorization: X402Authorization,
): X402PaymentEnvelope {
  return {
    x402Version: 2,
    accepted: {
      scheme: authorization.scheme,
      network: authorization.network,
      amount: authorization.amount,
      asset: authorization.asset,
      payTo: authorization.to,
      maxTimeoutSeconds: 60,
      extra: { ...(authorization.metadata ?? {}) },
    },
    payload: {
      signature: authorization.signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.amount,
        nonce: authorization.nonce,
        ...(authorization.expiresAt
          ? { validBefore: authorization.expiresAt }
          : {}),
      },
    },
    extensions: {},
  };
}

/**
 * Encodes an authorization as the base64 {@link X402_PAYMENT_HEADER}
 * (`PAYMENT-SIGNATURE`) header value — the standard x402 v2 submission format.
 * Mirrors the backend's x402.ParseInboundPayment.
 */
export function encodeX402PaymentHeader(
  authorization: X402Authorization,
): string {
  const json = JSON.stringify(buildX402PaymentEnvelope(authorization));
  return toBase64(new TextEncoder().encode(json));
}

/**
 * Inputs to a standard x402 v2 SVM (Solana) "exact" PaymentPayload envelope —
 * everything is read off the parsed 402 challenge plus the partially-signed
 * transaction. `assetMint` is the on-chain SPL mint (base58), NOT a symbol.
 */
export interface X402SvmPaymentEnvelopeOptions {
  network: string;
  amount: string;
  /** The on-chain SPL mint (base58) — not a symbol like "USDC". */
  assetMint: string;
  payTo: string;
  /** The facilitator's fee-payer pubkey (from the challenge `metadata.feePayer`). */
  feePayer: string;
  /** The base64 partially-signed Solana transaction. */
  transaction: string;
  maxTimeoutSeconds?: number;
}

/**
 * The standard x402 v2 PaymentPayload envelope for the SVM (Solana) "exact"
 * scheme. Unlike {@link X402PaymentEnvelope} (the EVM-style envelope whose
 * `payload` is `{signature, authorization}`), the SVM scheme carries the whole
 * partially-signed transaction in `payload.transaction`, and the facilitator's
 * fee payer travels in `accepted.extra.feePayer`. base64-encoded into the
 * {@link X402_PAYMENT_HEADER} (`PAYMENT-SIGNATURE`) header.
 */
export interface X402SvmPaymentEnvelope {
  x402Version: number;
  accepted: {
    scheme: X402Scheme;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: { feePayer: string };
  };
  payload: {
    transaction: string;
  };
}

/**
 * Builds the standard x402 v2 SVM "exact" PaymentPayload envelope from a 402
 * challenge's fields and the partially-signed transaction.
 */
export function buildX402SvmPaymentEnvelope(
  options: X402SvmPaymentEnvelopeOptions,
): X402SvmPaymentEnvelope {
  return {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: options.network,
      amount: options.amount,
      asset: options.assetMint,
      payTo: options.payTo,
      maxTimeoutSeconds: options.maxTimeoutSeconds ?? 60,
      extra: { feePayer: options.feePayer },
    },
    payload: {
      transaction: options.transaction,
    },
  };
}

/**
 * Encodes a standard x402 v2 SVM "exact" envelope as the base64
 * {@link X402_PAYMENT_HEADER} (`PAYMENT-SIGNATURE`) header value — standard
 * base64 (with padding) of the UTF-8 JSON. This is the sponsored Solana
 * payment's submission format; the request body carries no `payment` field.
 */
export function encodeX402SvmPaymentHeader(
  options: X402SvmPaymentEnvelopeOptions,
): string {
  const json = JSON.stringify(buildX402SvmPaymentEnvelope(options));
  return toBase64(new TextEncoder().encode(json));
}

function paymentReferences(
  options: X402PaymentReferenceOptions,
): X402PaymentMap {
  const references: X402PaymentMap = {};
  for (const key of [
    "onChainTx",
    "tx",
    "transaction",
    "ledgerTxId",
    "verifiedId",
  ] as const) {
    const value = options[key]?.trim();
    if (value) {
      references[key] = value;
    }
  }
  return references;
}

export function generateNonce(prefix?: string): string {
  const random = new Uint8Array(12);
  globalThis.crypto.getRandomValues(random);
  const hex = Array.from(random)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return prefix ? `${prefix}_${hex}` : hex;
}
