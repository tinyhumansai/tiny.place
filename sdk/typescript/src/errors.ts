/**
 * Stable, LLM-actionable error classification for tiny.place.
 *
 * An autonomous agent driving the SDK (directly, through the `tinyplace` CLI, or
 * via an MCP relay) needs to know *what went wrong* and *what to do next* without
 * pattern-matching free-text error messages that may change. {@link classifyError}
 * maps any thrown value to a small, stable set of {@link TinyPlaceErrorCode}s, each
 * paired with a one-sentence recovery `hint` and a `retryable` flag.
 *
 * This module deliberately does NOT import `http.ts`: `TinyPlaceError` imports
 * *this* module to expose `.code`/`.hint` getters, so the dependency must point one
 * way. Classification is therefore structural — it duck-types `{ status, body,
 * paymentRequired, name, message }` off the error rather than relying on
 * `instanceof`, which also lets it classify the plain `{ status, body, ... }`
 * objects the CLI passes around at its error boundary.
 */

/** The stable, machine-readable error categories an agent can branch on. */
export type TinyPlaceErrorCode =
  | "payment_required"
  | "auth_invalid"
  | "handle_taken"
  | "not_found"
  | "rate_limited"
  | "validation"
  | "no_signer"
  | "transient"
  | "server"
  | "graphql"
  | "unknown";

/** Every code, in a stable order — handy for catalogs and exhaustive handling. */
export const TINYPLACE_ERROR_CODES: ReadonlyArray<TinyPlaceErrorCode> = [
  "payment_required",
  "auth_invalid",
  "handle_taken",
  "not_found",
  "rate_limited",
  "validation",
  "no_signer",
  "transient",
  "server",
  "graphql",
  "unknown",
];

/** The result of classifying an error: a stable code plus recovery guidance. */
export interface ClassifiedError {
  /** Stable category an agent can branch on. */
  code: TinyPlaceErrorCode;
  /** One sentence telling an LLM what to do next. */
  hint: string;
  /** Whether retrying the same call (after backoff) can plausibly succeed. */
  retryable: boolean;
  /** The originating HTTP status, when the error carried one (`0` = transport). */
  status?: number;
}

/** One row of the recovery contract: when a code fires and how to recover. */
export interface ErrorCodeGuide {
  code: TinyPlaceErrorCode;
  /** Plain description of what triggers this code. */
  when: string;
  hint: string;
  retryable: boolean;
}

const HINTS: Record<TinyPlaceErrorCode, string> = {
  payment_required:
    "Payment required (x402 challenge). Settle it (e.g. `tinyplace pay --data '<paymentRequired>'`), then retry the original call.",
  auth_invalid:
    "Authentication rejected. Confirm your signing key matches the registered identity (TINYPLACE_SECRET_KEY); if you have no identity yet, run `tinyplace init` then `tinyplace register`.",
  handle_taken: "That @handle is already claimed — choose a different handle.",
  not_found:
    "Not found. Re-check the id or @handle; resolve a handle first with `tinyplace resolve @name`.",
  rate_limited:
    "Rate limited. Wait for the Retry-After interval, then retry (the SDK already backs off idempotent reads).",
  validation:
    "Request was rejected as invalid. Fix the fields named in `body`/`error` and resend.",
  no_signer:
    "This action needs your signing key. Set TINYPLACE_SECRET_KEY (a hex Ed25519 seed) or run `tinyplace init`.",
  transient: "Transient network/server error — retry with backoff.",
  server:
    "Server error — retry a few times with backoff; if it persists, the backend is unhealthy.",
  graphql:
    "GraphQL field error. Inspect `body.errors`; usually a bad argument or a missing auth scope.",
  unknown: "Unclassified error — inspect `error`/`body` for details.",
};

const RETRYABLE: Record<TinyPlaceErrorCode, boolean> = {
  payment_required: false,
  auth_invalid: false,
  handle_taken: false,
  not_found: false,
  rate_limited: true,
  validation: false,
  no_signer: false,
  transient: true,
  server: true,
  graphql: false,
  unknown: false,
};

const WHEN: Record<TinyPlaceErrorCode, string> = {
  payment_required: "HTTP 402, or a response carrying an x402 payment challenge.",
  auth_invalid: "HTTP 401/403 — the request signature or session was rejected.",
  handle_taken:
    "HTTP 409 (or a body) indicating the @handle/username is already claimed.",
  not_found: "HTTP 404 — the id or @handle does not exist.",
  rate_limited: "HTTP 429 — too many requests.",
  validation:
    "HTTP 400/422, a 409 that isn't a handle clash, or a local TinyPlaceValidationError.",
  no_signer: "A local action needed a signing key but none was configured.",
  transient: "Transport failure/timeout (status 0) or HTTP 408/502/503/504.",
  server: "HTTP 500 or other 5xx not classified as transient.",
  graphql: "HTTP 200 GraphQL envelope containing field errors.",
  unknown: "Anything that does not match a known category.",
};

/** Documented trigger for each code (source of truth for `tinyplace describe errors`). */
export const ERROR_CODE_GUIDE: ReadonlyArray<ErrorCodeGuide> =
  TINYPLACE_ERROR_CODES.map((code) => ({
    code,
    when: WHEN[code],
    hint: HINTS[code],
    retryable: RETRYABLE[code],
  }));

/**
 * Classify any thrown value into a stable {@link TinyPlaceErrorCode} plus recovery
 * guidance. Never throws; an unrecognized value classifies as `unknown`.
 */
export function classifyError(error: unknown): ClassifiedError {
  const code = deriveCode(error);
  const status = numericStatus(error);
  return {
    code,
    hint: HINTS[code],
    retryable: RETRYABLE[code],
    ...(status !== undefined ? { status } : {}),
  };
}

/** Shorthand for `classifyError(error).code`. */
export function errorCode(error: unknown): TinyPlaceErrorCode {
  return deriveCode(error);
}

function deriveCode(error: unknown): TinyPlaceErrorCode {
  const status = numericStatus(error);
  const paymentRequired = property(error, "paymentRequired");
  const body = property(error, "body");
  const name = stringProperty(error, "name");
  const text = errorText(error, body);

  // 1. Payment challenge always wins — it's the one error with a concrete next action.
  if (paymentRequired !== undefined || status === 402) {
    return "payment_required";
  }

  // 2. Local SDK-thrown errors (no HTTP status).
  if (name === "TinyPlaceValidationError") return "validation";
  if (status === undefined && SIGNER_REQUIRED.test(text)) return "no_signer";

  // 3. Status-driven classification.
  if (status !== undefined) {
    if (status === 0) return "transient";
    if (status === 429) return "rate_limited";
    if (status === 401 || status === 403) return "auth_invalid";
    if (status === 404) return "not_found";
    if (status === 409) {
      return HANDLE_TAKEN.test(text) ? "handle_taken" : "validation";
    }
    if (status === 408) return "transient";
    if (status === 400 || status === 422) return "validation";
    if (status === 200) return hasGraphQLErrors(body) ? "graphql" : "unknown";
    if (status === 502 || status === 503 || status === 504) return "transient";
    if (status >= 500) return "server";
    // Any other 4xx that names a handle conflict is still a handle clash.
    if (status >= 400 && HANDLE_TAKEN.test(text)) return "handle_taken";
  }

  // 4. Non-HTTP fallbacks.
  if (HANDLE_TAKEN.test(text)) return "handle_taken";
  return "unknown";
}

const SIGNER_REQUIRED =
  /requires? (a )?(signing key|signer)|needs? a (wallet|signer)|secret_key|no signer/i;

const HANDLE_TAKEN =
  /(handle|username|name)[^.]*(taken|exists|already|registered|claimed|conflict)|(taken|exists|already|registered|claimed)[^.]*(handle|username)/i;

function numericStatus(error: unknown): number | undefined {
  const status = property(error, "status");
  return typeof status === "number" ? status : undefined;
}

function hasGraphQLErrors(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const errors = (body as { errors?: unknown }).errors;
  return Array.isArray(errors) && errors.length > 0;
}

/** Lowercased searchable text drawn from the body (`error`/`message`) or the message. */
function errorText(error: unknown, body: unknown): string {
  if (typeof body === "string") return body.toLowerCase();
  if (body !== null && typeof body === "object") {
    const record = body as { error?: unknown; message?: unknown };
    const parts = [record.error, record.message].filter(
      (value): value is string => typeof value === "string",
    );
    if (parts.length > 0) return parts.join(" ").toLowerCase();
    try {
      return JSON.stringify(body).toLowerCase();
    } catch {
      /* fall through to the message */
    }
  }
  const message = stringProperty(error, "message");
  return (message ?? (typeof error === "string" ? error : "")).toLowerCase();
}

function property(error: unknown, key: string): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as Record<string, unknown>)[key];
}

function stringProperty(error: unknown, key: string): string | undefined {
  const value = property(error, key);
  return typeof value === "string" ? value : undefined;
}
