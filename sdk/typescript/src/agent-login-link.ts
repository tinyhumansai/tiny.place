import type { SigningKey } from "./auth.js";
import { BrowserSessionSigner } from "./browser-session-signer.js";
import { LocalSigner } from "./local-signer.js";
import type { X402Authorization } from "./x402.js";

/**
 * Agent-generated login link ("view-as-agent").
 *
 * An agent that holds its own Ed25519 identity key (but has no browser/Phantom)
 * can hand its human owner a single link that logs the human into the tiny.place
 * web app AS that agent. The link reuses the existing approved-signer / session-
 * key delegation primitive, but with the AGENT's identity key as the grantor
 * instead of a Phantom wallet:
 *
 *   1. The agent mints a fresh session keypair from a random 32-byte seed.
 *   2. It signs an x402 "upto" approved-signer grant for that session key with
 *      its identity key and registers it with the backend (`signers.approve`).
 *   3. It encodes the grant metadata + the session seed into the link's URL
 *      FRAGMENT (`https://tiny.place/auth/agent#<token>`), so the token never
 *      reaches a server/access log.
 *
 * The web app reads the fragment, reconstructs a session signer with no Phantom
 * involved (the seed deterministically rebuilds the session key), and hydrates
 * the auth store. The human then operates as the agent under a scoped, expiring,
 * revocable grant.
 *
 * Security posture (see issue security requirements):
 *   - The token rides in the URL FRAGMENT only (callers must never put it in a
 *     query string); the web route strips it from history on load.
 *   - Short TTL by default ({@link DEFAULT_AGENT_LINK_TTL_MS}), independent of
 *     the 7-day wallet session TTL.
 *   - The grant defaults to a ZERO x402 payment budget so a leaked link cannot
 *     move funds; spending requires an explicit opt-in budget at mint time.
 *   - The grant is revocable (the agent can `signers.revoke`) and the web app
 *     fails closed when the backend reports it inactive.
 */

/** Version tag prefixed to the encoded token so the decoder can reject mismatches. */
export const AGENT_LOGIN_LINK_VERSION = "al1";

/** The web route an agent-login link points at. */
export const AGENT_LOGIN_LINK_PATH = "/auth/agent";

/** Default TTL: 15 minutes. Short by design — re-mint for a longer session. */
export const DEFAULT_AGENT_LINK_TTL_MS = 15 * 60 * 1000;

/** Default x402 network for the grant (matches the website session default). */
const DEFAULT_AGENT_LINK_NETWORK = "solana:mainnet";

/** Default asset for the grant scope. */
const DEFAULT_AGENT_LINK_ASSET = "USDC";

/**
 * Default x402 budget: ZERO. A view-as-agent link is non-payment by default, so
 * a leaked link cannot move funds. Spending requires an explicit `budget`.
 */
const DEFAULT_AGENT_LINK_BUDGET = "0";

/** A minimal subset of {@link TinyPlaceClient} this module needs to register a grant. */
export interface AgentLoginSignerRegistrar {
  signers: {
    approve(authorization: X402Authorization): Promise<unknown>;
  };
}

/** Options for {@link createAgentLoginLink}. */
export interface CreateAgentLoginLinkOptions {
  /**
   * The agent's identity signer (the grantor). Its `agentId` is the cryptoId the
   * link logs in as; it signs the approved-signer grant. Must be a raw/Ed25519
   * signer such as {@link LocalSigner}.
   */
  signer: SigningKey & { publicKeyBase64?: string };
  /** A client authenticated as the agent, used to register the grant. */
  client: AgentLoginSignerRegistrar;
  /**
   * The web app origin to build the link against, e.g. `https://tiny.place`.
   * Defaults to `https://tiny.place`.
   */
  baseUrl?: string;
  /** Grant lifetime in milliseconds. Defaults to {@link DEFAULT_AGENT_LINK_TTL_MS}. */
  ttlMs?: number;
  /**
   * x402 grant scope. Defaults to a ZERO-budget, view-only grant. Provide a
   * non-zero `budget` (base units) ONLY when the owner should be able to spend.
   */
  scope?: AgentLoginScope;
}

/** The bounded x402 scope a link's grant carries. */
export interface AgentLoginScope {
  network?: string;
  asset?: string;
  /** Payment budget in 6-decimal base units. Defaults to "0" (non-payment). */
  budget?: string;
}

/** The decoded contents of an agent-login link fragment token. */
export interface AgentLoginToken {
  readonly version: string;
  /** The agent cryptoId the session acts as. */
  readonly agentId: string;
  /** The agent (grantor) base64 Ed25519 public key — used for identity proofs. */
  readonly grantorPublicKeyBase64: string;
  /** The session key seed (base64url, 32 bytes) — rebuilds the session signer. */
  readonly sessionSeedBase64Url: string;
  /** The approved-signer grant nonce, bound into delegated payment signatures. */
  readonly approvalNonce: string;
  /** The session public key, hex-encoded — the backend's signer lookup key. */
  readonly signerKey: string;
  /** RFC 3339 grant expiry. */
  readonly expiresAt: string;
  /** The x402 grant scope. */
  readonly network: string;
  readonly asset: string;
  readonly budget: string;
}

/** The result of {@link createAgentLoginLink}. */
export interface AgentLoginLink {
  /** The full `https://.../auth/agent#<token>` link to hand to the owner. */
  readonly url: string;
  /** The encoded fragment token (without the leading `#`). */
  readonly token: string;
  /** The decoded token contents (no secrets beyond what the link carries). */
  readonly decoded: AgentLoginToken;
}

/**
 * Mints + registers a view-as-agent grant and returns a login link. Call this
 * agent-side (e.g. from a `workflow-tinyplace` agent) to produce the link for
 * the human owner.
 */
export async function createAgentLoginLink(
  options: CreateAgentLoginLinkOptions,
): Promise<AgentLoginLink> {
  const ttlMs = options.ttlMs ?? DEFAULT_AGENT_LINK_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("createAgentLoginLink: ttlMs must be a positive number");
  }
  const network = options.scope?.network ?? DEFAULT_AGENT_LINK_NETWORK;
  const asset = options.scope?.asset ?? DEFAULT_AGENT_LINK_ASSET;
  const budget = options.scope?.budget ?? DEFAULT_AGENT_LINK_BUDGET;

  const grantorPublicKeyBase64 =
    options.signer.publicKeyBase64 ??
    (() => {
      throw new Error(
        "createAgentLoginLink: signer must expose publicKeyBase64 (use LocalSigner)",
      );
    })();

  // Mint the session key from a random 32-byte seed so it can be carried in the
  // link and deterministically rebuilt web-side without Phantom. Building a
  // BrowserSessionSigner over the seed reuses the exact approval-request
  // construction the website's session path uses.
  const seed = randomSeed();
  const sessionGrantSigner = await sessionSignerFromSeed(seed);

  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const approval = await sessionGrantSigner.buildApprovalRequest(
    options.signer,
    options.signer.agentId,
    {
      network,
      asset,
      budget,
      expiresAt,
      // Bind the grant to the agent's key so an agent that isn't a registered
      // wallet still works (the backend derives the grantor cryptoId from it).
      grantorPublicKey: grantorPublicKeyBase64,
    },
  );

  await options.client.signers.approve(approval.authorization);

  const approvalNonce = sessionGrantSigner.getApprovalNonce();
  if (!approvalNonce) {
    throw new Error("createAgentLoginLink: session grant missing approval nonce");
  }

  const decoded: AgentLoginToken = {
    version: AGENT_LOGIN_LINK_VERSION,
    agentId: options.signer.agentId,
    grantorPublicKeyBase64,
    sessionSeedBase64Url: bytesToBase64Url(seed),
    approvalNonce,
    signerKey: sessionGrantSigner.publicKeyHex,
    // buildApprovalRequest strips fractional seconds before signing; persist the
    // same whole-second expiry the grant was actually signed with.
    expiresAt: approval.authorization.expiresAt,
    network,
    asset,
    budget,
  };

  const token = encodeAgentLoginToken(decoded);
  const base = (options.baseUrl ?? "https://tiny.place").replace(/\/+$/, "");
  const url = `${base}${AGENT_LOGIN_LINK_PATH}#${token}`;
  return { url, token, decoded };
}

/**
 * Decodes an agent-login fragment token (the value after `#`). Returns undefined
 * for any malformed/wrong-version/incomplete token — the caller fails closed.
 */
export function decodeAgentLoginLink(
  fragment: string,
): AgentLoginToken | undefined {
  const value = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const dot = trimmed.indexOf(".");
  if (dot <= 0) return undefined;
  const version = trimmed.slice(0, dot);
  if (version !== AGENT_LOGIN_LINK_VERSION) return undefined;
  try {
    const json = fromBase64Url(trimmed.slice(dot + 1));
    const parsed = JSON.parse(json) as Partial<AgentLoginToken>;
    if (
      typeof parsed.agentId !== "string" ||
      typeof parsed.grantorPublicKeyBase64 !== "string" ||
      typeof parsed.sessionSeedBase64Url !== "string" ||
      typeof parsed.approvalNonce !== "string" ||
      typeof parsed.signerKey !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      typeof parsed.network !== "string" ||
      typeof parsed.asset !== "string" ||
      typeof parsed.budget !== "string"
    ) {
      return undefined;
    }
    return { ...(parsed as AgentLoginToken), version };
  } catch {
    return undefined;
  }
}

/**
 * Reports whether a decoded token is still locally valid (expiry comfortably in
 * the future). The authoritative check is the backend signer-status probe; this
 * is the cheap client-side guard so a long-expired link short-circuits.
 */
export function agentLoginTokenIsFresh(
  token: AgentLoginToken,
  nowMs: number,
  skewMs = 30_000,
): boolean {
  const expiresMs = Date.parse(token.expiresAt);
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs > nowMs + skewMs;
}

/**
 * Rebuilds the {@link BrowserSessionSigner} a decoded token describes — no
 * Phantom, no agent private key, just the seed the link carries. The returned
 * signer signs requests as the delegated session key; pair it with a no-wallet
 * session signer (web side) that reports the agent as `agentId`.
 */
export async function sessionSignerFromAgentLoginToken(
  token: AgentLoginToken,
): Promise<BrowserSessionSigner> {
  const seed = base64UrlToBytes(token.sessionSeedBase64Url);
  if (seed.length !== 32) {
    throw new Error("agent login token: session seed must be 32 bytes");
  }
  const session = await sessionSignerFromSeed(seed);
  session.setApprovalNonce(token.approvalNonce);
  return session;
}

function encodeAgentLoginToken(token: AgentLoginToken): string {
  const body = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        agentId: token.agentId,
        grantorPublicKeyBase64: token.grantorPublicKeyBase64,
        sessionSeedBase64Url: token.sessionSeedBase64Url,
        approvalNonce: token.approvalNonce,
        signerKey: token.signerKey,
        expiresAt: token.expiresAt,
        network: token.network,
        asset: token.asset,
        budget: token.budget,
      }),
    ),
  );
  return `${AGENT_LOGIN_LINK_VERSION}.${body}`;
}

/** Builds a BrowserSessionSigner whose key is derived from a 32-byte seed. */
async function sessionSignerFromSeed(
  seed: Uint8Array,
): Promise<BrowserSessionSigner> {
  // Reuse LocalSigner's PKCS#8 import path to get a CryptoKey from the seed,
  // then re-derive the keypair shape BrowserSessionSigner expects.
  const local = await LocalSigner.fromSeed(seed);
  const privateKey = await importSeedPrivateKey(seed);
  return BrowserSessionSigner.fromStored(
    { publicKey: local.publicKey, privateKey },
    // The nonce is set by buildApprovalRequest (agent side) or
    // setApprovalNonce (web side); a placeholder keeps fromStored happy.
    "",
  );
}

async function importSeedPrivateKey(seed: Uint8Array): Promise<CryptoKey> {
  // PKCS#8 PrivateKeyInfo prefix for an Ed25519 key, followed by the raw seed.
  const prefix = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20,
  ]);
  const pkcs8 = new Uint8Array(prefix.length + seed.length);
  pkcs8.set(prefix, 0);
  pkcs8.set(seed, prefix.length);
  return globalThis.crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" },
    true,
    ["sign"],
  );
}

function randomSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(seed);
  return seed;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function fromBase64Url(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}
