import { canonicalPayload, sha256Hex } from "./crypto.js";

export interface SigningKey {
  agentId: string;
  sign(data: Uint8Array): Promise<Uint8Array> | Uint8Array;
}

export interface SiwsSigningKey extends SigningKey {
  siwsSignature(): string;
}

function siwsSignature(key: SigningKey): string | undefined {
  const candidate = key as Partial<SiwsSigningKey>;
  return typeof candidate.siwsSignature === "function"
    ? candidate.siwsSignature()
    : undefined;
}

/**
 * A bearer onboarding grant: a scoped, short-TTL capability token the wallet
 * signs once (CLI-side, where the private key lives) and a key-less web client
 * replays as its credential on every onboarding request. The token is
 * `og1.<base64url(claims)>.<v1-freshness-signature>`; the web client attaches
 * `Authorization: TinyPlace-Onboard <wallet>:<token>` to each call instead of
 * signing per-request.
 */
export interface OnboardGrantCredential {
  readonly kind: "onboard-grant";
  /** The wallet cryptoId the grant was minted for. */
  readonly wallet: string;
  /**
   * The base64 Ed25519 public key of the wallet, decoded from the grant claims.
   * Lets the web flow publish a discovery card (which must carry the key that
   * derives the cryptoId) without holding the private key. Undefined if the
   * token claims could not be decoded.
   */
  readonly ownerPublicKey?: string;
  /** The self-describing token `og1.<b64url(claims)>.<v1-sig>`. */
  readonly grant: string;
  /** The Authorization header value to present on each request. */
  authorizationHeader(): string;
  /** The `<wallet>:<token>` value to carry in an onboarding URL fragment. */
  fragmentValue(): string;
}

const ONBOARD_GRANT_SCHEME = "TinyPlace-Onboard";
const ONBOARD_TOKEN_PREFIX = "og1.";

function onboardCredential(
  wallet: string,
  grant: string,
  ownerPublicKey?: string,
): OnboardGrantCredential {
  return {
    kind: "onboard-grant",
    wallet,
    ...(ownerPublicKey ? { ownerPublicKey } : {}),
    grant,
    authorizationHeader: () => `${ONBOARD_GRANT_SCHEME} ${wallet}:${grant}`,
    fragmentValue: () => `${wallet}:${grant}`,
  };
}

/** Decodes the `ownerPublicKey` claim from an `og1.<b64url(claims)>.<sig>` token. */
function ownerPublicKeyFromToken(grant: string): string | undefined {
  const body = grant.slice(ONBOARD_TOKEN_PREFIX.length);
  const dot = body.indexOf(".");
  if (dot <= 0) return undefined;
  try {
    const json = fromBase64Url(body.slice(0, dot));
    const claims = JSON.parse(json) as { ownerPublicKey?: unknown };
    return typeof claims.ownerPublicKey === "string"
      ? claims.ownerPublicKey
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Mint a bearer onboarding grant. The signed bytes are
 * `canonicalPayload("onboard.grant", claims)`; the claims are also carried
 * (base64url) inside the token purely for transport — the server reconstructs
 * and verifies the canonical payload from them. `scope` must list only
 * whitelisted onboarding actions, and `ttlMs` must be within the server-side
 * ceiling (currently 7 days).
 */
export async function mintOnboardGrant(
  key: SigningKey,
  ownerPublicKeyBase64: string,
  scope: Array<string>,
  ttlMs: number,
): Promise<OnboardGrantCredential> {
  const wallet = key.agentId;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const claims = { wallet, ownerPublicKey: ownerPublicKeyBase64, scope, expiresAt };
  const payload = canonicalPayload("onboard.grant", {
    expiresAt,
    ownerPublicKey: ownerPublicKeyBase64,
    scope,
    wallet,
  });
  // The grant's signature must bind to THIS canonical payload — the server
  // reconstructs and verifies it. Use the v1-only signer so a SIWS-mode key
  // does not substitute its reusable sign-in token (which signs a different
  // message and the verifier rejects as "invalid signature").
  const signature = await signV1FreshCanonicalPayload(key, payload);
  const grant = `${ONBOARD_TOKEN_PREFIX}${toBase64Url(JSON.stringify(claims))}.${signature}`;
  return onboardCredential(wallet, grant, ownerPublicKeyBase64);
}

/**
 * Parse an onboarding grant from a `<wallet>:<token>` URL-fragment value (the
 * inverse of {@link OnboardGrantCredential.fragmentValue}). Returns undefined
 * when the value is malformed.
 */
export function parseOnboardGrant(
  value: string,
): OnboardGrantCredential | undefined {
  const trimmed = value.trim();
  const separator = trimmed.indexOf(":");
  if (separator <= 0) return undefined;
  const wallet = trimmed.slice(0, separator).trim();
  const grant = trimmed.slice(separator + 1).trim();
  if (!wallet || !grant.startsWith(ONBOARD_TOKEN_PREFIX)) return undefined;
  return onboardCredential(wallet, grant, ownerPublicKeyFromToken(grant));
}

export interface AuthHeaders {
  Authorization: string;
}

export interface AdminAuthHeaders {
  Authorization: string;
  "X-TinyPlace-Date": string;
  "X-TinyPlace-Nonce": string;
}

export interface AdminSigningOptions {
  actor?: string;
  role?: "operator" | "auditor";
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64(bytes);
}

export function buildAuthHeader(
  agentId: string,
  signature: string,
  timestamp: string,
): AuthHeaders {
  return {
    Authorization: `tiny.place ${agentId}:${signature}:${timestamp}`,
  };
}

export async function signRequest(
  key: SigningKey,
  body: string,
): Promise<AuthHeaders> {
  const timestamp = new Date().toISOString();
  const siws = siwsSignature(key);
  if (siws) {
    return buildAuthHeader(key.agentId, siws, timestamp);
  }
  const payload = new TextEncoder().encode(body + timestamp);
  const signature = await key.sign(payload);
  return buildAuthHeader(key.agentId, toBase64(signature), timestamp);
}

export async function signAdminRequest(
  key: SigningKey,
  method: string,
  requestUri: string,
  body: Uint8Array | string,
  options?: AdminSigningOptions,
): Promise<AdminAuthHeaders> {
  const timestamp = new Date().toISOString();
  const nonce = generateNonce();
  const actor = options?.actor ?? key.agentId;
  const bodyHash = sha256Hex(body);
  const roleLine = options?.role ? `\n${options.role}` : "";
  const payload = `${method}\n${requestUri}\n${timestamp}\n${nonce}\n${bodyHash}${roleLine}`;
  const signature = await key.sign(new TextEncoder().encode(payload));
  const roleField = options?.role ? `,role="${options.role}"` : "";
  return {
    Authorization: `TinyPlace-Admin actor="${actor}"${roleField},signature="${toBase64(signature)}"`,
    "X-TinyPlace-Date": timestamp,
    "X-TinyPlace-Nonce": nonce,
  };
}

export interface DirectoryWriteHeaders {
  "X-TinyPlace-Date": string;
  "X-TinyPlace-Nonce": string;
  "X-TinyPlace-Public-Key": string;
  "X-TinyPlace-Signature": string;
}

export async function signDirectoryWrite(
  key: SigningKey,
  publicKeyBase64: string,
  method: string,
  requestUri: string,
  body: Uint8Array | string,
): Promise<DirectoryWriteHeaders> {
  const timestamp = new Date().toISOString();
  const nonce = generateNonce();
  const siws = siwsSignature(key);
  if (siws) {
    return {
      "X-TinyPlace-Date": timestamp,
      "X-TinyPlace-Nonce": nonce,
      "X-TinyPlace-Public-Key": publicKeyBase64,
      "X-TinyPlace-Signature": siws,
    };
  }
  const bodyBytes =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  const bodyHash = sha256Hex(bodyBytes);
  const signingPayload = `${method}\n${requestUri}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signature = await key.sign(new TextEncoder().encode(signingPayload));
  return {
    "X-TinyPlace-Date": timestamp,
    "X-TinyPlace-Nonce": nonce,
    "X-TinyPlace-Public-Key": publicKeyBase64,
    "X-TinyPlace-Signature": toBase64(signature),
  };
}

export async function signDirectoryWriteQuery(
  key: SigningKey,
  publicKeyBase64: string,
  method: string,
  requestUri: string,
  body: Uint8Array | string,
): Promise<string> {
  const timestamp = new Date().toISOString();
  const nonce = generateNonce();
  const unsignedUri = withQueryParams(requestUri, {
    "X-TinyPlace-Date": timestamp,
    "X-TinyPlace-Nonce": nonce,
    "X-TinyPlace-Public-Key": publicKeyBase64,
  });
  const siws = siwsSignature(key);
  if (siws) {
    return withQueryParams(unsignedUri, {
      "X-TinyPlace-Signature": siws,
    });
  }
  const bodyBytes =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  const bodyHash = sha256Hex(bodyBytes);
  const signingPayload = `${method}\n${unsignedUri}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signature = await key.sign(new TextEncoder().encode(signingPayload));
  return withQueryParams(unsignedUri, {
    "X-TinyPlace-Signature": toBase64(signature),
  });
}

export async function signCanonicalPayload(
  key: SigningKey,
  payload: string,
): Promise<string> {
  const siws = siwsSignature(key);
  if (siws) {
    return siws;
  }
  const payloadBytes = new TextEncoder().encode(payload);
  const signature = await key.sign(payloadBytes);
  return toBase64(signature);
}

export async function signFreshCanonicalPayload(
  key: SigningKey,
  payload: string,
): Promise<string> {
  const siws = siwsSignature(key);
  if (siws) {
    return siws;
  }
  return signV1FreshCanonicalPayload(key, payload);
}

/**
 * Always produces a real `v1:<ts>:<nonce>:<sig>` freshness signature over the
 * canonical payload, signed with the key itself. Unlike
 * {@link signFreshCanonicalPayload} it never substitutes a reusable SIWS
 * sign-in token: callers whose verifier reconstructs and checks the exact
 * canonical payload (e.g. onboarding-grant minting) must bind the signature to
 * that payload, and a SIWS proof signs a different "sign in" message that the
 * verifier would reject as an invalid signature.
 */
async function signV1FreshCanonicalPayload(
  key: SigningKey,
  payload: string,
): Promise<string> {
  const timestamp = new Date().toISOString();
  const nonce = generateNonce();
  const payloadBytes = new TextEncoder().encode(
    `${payload}\n${timestamp}\n${nonce}`,
  );
  const signature = await key.sign(payloadBytes);
  return `v1:${toBase64Url(timestamp)}:${toBase64Url(nonce)}:${toBase64(signature)}`;
}

function withQueryParams(
  requestUri: string,
  params: Record<string, string>,
): string {
  const url = new URL(requestUri, "https://tinyplace.local");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const query = sortedQueryString(url.searchParams);
  return query ? `${url.pathname}?${query}` : url.pathname;
}

function sortedQueryString(searchParams: URLSearchParams): string {
  return Array.from(searchParams.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64Url(value: string): string {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return atob(padded);
}
