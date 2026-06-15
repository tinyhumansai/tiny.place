import type { SigningKey } from "./auth.js";
import { signerPaymentMetadata } from "./signer.js";

export type X402Scheme = "exact" | "upto" | "batch-settlement";

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
  return { ...fields, signature: toBase64(signature) };
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
