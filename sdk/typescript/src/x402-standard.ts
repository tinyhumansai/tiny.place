/**
 * Standard x402 v2 HTTP transport: the wire types and base64 header codec for the
 * inline payment flow (per the x402-foundation specification, transports-v2/http).
 *
 * Flow: a client requests a resource; the server answers 402 with a base64
 * `PAYMENT-REQUIRED` header (a {@link X402PaymentRequired}); the client retries the
 * SAME request with a base64 `PAYMENT-SIGNATURE` header (a {@link X402PaymentPayload});
 * the server verifies + settles inline and returns 200 with a base64
 * `PAYMENT-RESPONSE` header (a {@link X402SettlementResponse}).
 *
 * This module replaces tiny.place's bespoke flat signed-message + separate
 * /payments/verify+/settle REST flow with the real protocol. For the Solana
 * `exact` scheme the payload carries a partially-signed `TransferChecked`
 * transaction (built by {@link buildExactSvmTransferTransaction}) under
 * `payload.transaction`.
 */
import {
  buildExactSvmTransferTransaction,
  getRecentBlockhash,
  resolveSolanaAsset,
} from "./solana.js";
import type { SigningKey } from "./auth.js";

/** The standard x402 protocol version this transport speaks. */
export const X402_VERSION = 2;

/** Canonical HTTP header names for the standard x402 v2 transport. */
export const X402_HEADER_PAYMENT_REQUIRED = "PAYMENT-REQUIRED";
export const X402_HEADER_PAYMENT_SIGNATURE = "PAYMENT-SIGNATURE";
export const X402_HEADER_PAYMENT_RESPONSE = "PAYMENT-RESPONSE";

/** A single acceptable payment method in a 402 challenge. */
export interface X402PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

/** Describes the protected resource (carried on challenge and payload). */
export interface X402ResourceInfo {
  url?: string;
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: Array<string>;
  iconUrl?: string;
}

/** The 402 challenge object (base64 in the `PAYMENT-REQUIRED` header). */
export interface X402PaymentRequired {
  x402Version: number;
  error?: string;
  resource?: X402ResourceInfo;
  accepts: Array<X402PaymentRequirements>;
  extensions?: Record<string, unknown>;
}

/** The payment authorization object (base64 in the `PAYMENT-SIGNATURE` header). */
export interface X402PaymentPayload {
  x402Version: number;
  resource?: X402ResourceInfo;
  accepted: X402PaymentRequirements;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

/** The settlement result object (base64 in the `PAYMENT-RESPONSE` header). */
export interface X402SettlementResponse {
  success: boolean;
  errorReason?: string;
  payer?: string;
  transaction: string;
  network: string;
  amount?: string;
  extensions?: Record<string, unknown>;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  // Tolerate base64url (and missing padding) as well as standard base64.
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encode a value as a base64 JSON header (standard base64). */
export function encodeX402Header(value: unknown): string {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(value)));
}

/** Decode a base64 JSON header to a value, or undefined when malformed. */
function decodeX402Header<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(base64ToBytes(value.trim()))) as T;
  } catch {
    return undefined;
  }
}

/** Decode the `PAYMENT-REQUIRED` challenge header. */
export function decodePaymentRequired(
  value: string | null | undefined,
): X402PaymentRequired | undefined {
  const decoded = decodeX402Header<X402PaymentRequired>(value);
  if (!decoded || !Array.isArray(decoded.accepts)) return undefined;
  return decoded;
}

/** Decode the `PAYMENT-RESPONSE` settlement header. */
export function decodeSettlementResponse(
  value: string | null | undefined,
): X402SettlementResponse | undefined {
  return decodeX402Header<X402SettlementResponse>(value);
}

/** Encode a {@link X402PaymentPayload} for the `PAYMENT-SIGNATURE` header. */
export function encodePaymentSignature(payload: X402PaymentPayload): string {
  return encodeX402Header(payload);
}

/**
 * Select the Solana `exact` requirement from a challenge's `accepts[]` — the only
 * scheme tiny.place clients fulfil. Returns undefined when none is offered.
 */
export function selectExactSvmRequirement(
  challenge: X402PaymentRequired,
): X402PaymentRequirements | undefined {
  return challenge.accepts.find(
    (entry) =>
      entry.scheme === "exact" &&
      typeof entry.network === "string" &&
      entry.network.startsWith("solana:"),
  );
}

/** Options for {@link buildExactSvmPaymentPayload}. */
export interface BuildExactSvmPayloadOptions {
  /** The 402 challenge decoded from the `PAYMENT-REQUIRED` header. */
  challenge: X402PaymentRequired;
  /** The payer's Solana secret key (32-byte seed or 64-byte keypair). */
  secretKey: string | Uint8Array;
  /** The Solana RPC URL used to fetch a recent blockhash. */
  rpcUrl: string;
  /** Override the SPL mint decimals (defaults to the resolved asset, else 6). */
  decimals?: number;
  fetch?: typeof globalThis.fetch;
}

/**
 * Build the standard `PaymentPayload` for the Solana `exact` requirement in a 402
 * challenge: fetch a recent blockhash, construct the partially-signed
 * `TransferChecked` transaction (fee payer = `extra.feePayer`, destination =
 * ATA(payTo, asset), Memo = `extra.memo` or a random nonce), and wrap it in the
 * v2 envelope (`{ x402Version, accepted, payload: { transaction } }`).
 */
export async function buildExactSvmPaymentPayload(
  options: BuildExactSvmPayloadOptions,
): Promise<X402PaymentPayload> {
  const accepted = selectExactSvmRequirement(options.challenge);
  if (!accepted) {
    throw new Error("x402 challenge offers no Solana exact-scheme payment method");
  }
  const feePayer =
    typeof accepted.extra?.["feePayer"] === "string"
      ? (accepted.extra["feePayer"] as string)
      : undefined;
  if (!feePayer) {
    throw new Error("x402 exact-SVM challenge is missing extra.feePayer");
  }
  const memo =
    typeof accepted.extra?.["memo"] === "string"
      ? (accepted.extra["memo"] as string)
      : undefined;
  const decimals =
    options.decimals ?? resolveSolanaAsset(accepted.asset)?.decimals ?? 6;

  const recentBlockhash = await getRecentBlockhash(options.rpcUrl, {
    fetch: options.fetch,
  });
  const built = buildExactSvmTransferTransaction({
    secretKey: options.secretKey,
    feePayer,
    payTo: accepted.payTo,
    mint: accepted.asset,
    amount: accepted.amount,
    decimals,
    recentBlockhash,
    ...(memo ? { memo } : {}),
  });

  return {
    x402Version: X402_VERSION,
    accepted,
    payload: { transaction: built.transaction },
    ...(options.challenge.resource ? { resource: options.challenge.resource } : {}),
  };
}

/** A signer that can authorize x402 payments (Ed25519 + base64 public key). */
export interface X402SvmSigner extends SigningKey {
  publicKeyBase64: string;
}
