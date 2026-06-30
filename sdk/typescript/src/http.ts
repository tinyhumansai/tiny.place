import type { OnboardGrantCredential, SigningKey } from "./auth.js";
import {
  signAdminRequest,
  signDirectoryWrite,
  signRequest,
  type AdminSigningOptions,
} from "./auth.js";
import { classifyError, type TinyPlaceErrorCode } from "./errors.js";
import {
  X402_HEADER_PAYMENT_RESPONSE,
  X402_HEADER_PAYMENT_SIGNATURE,
  buildExactSvmPaymentPayload,
  decodePaymentRequired,
  decodeSettlementResponse,
  encodePaymentSignature,
  type X402SettlementResponse,
} from "./x402-standard.js";
import { HEADER_SDK_CLIENT, SDK_CLIENT } from "./version.js";

export type BodySigner<TBody = any> = (body: TBody) => Promise<TBody> | TBody;

/**
 * Configures automatic settlement of standard x402 v2 (HTTP 402) challenges. When
 * set on the client, any request that returns 402 with a `PAYMENT-REQUIRED`
 * header offering a Solana `exact` method is retried once with a `PAYMENT-SIGNATURE`
 * header carrying a partially-signed `TransferChecked` (the facilitator co-signs as
 * fee payer and broadcasts). This is the standard transport — no separate
 * verify/settle calls and no flat signed-message body.
 */
export interface X402PayerConfig {
  /** The payer's Solana secret key (32-byte seed or 64-byte keypair). */
  secretKey: string | Uint8Array;
  /** The Solana RPC URL used to fetch a recent blockhash for the transfer. */
  rpcUrl: string;
  /** Optional fetch override for the blockhash RPC (defaults to the client's). */
  fetch?: typeof globalThis.fetch;
  /** Invoked with each successful settlement (decoded `PAYMENT-RESPONSE`). */
  onSettled?: (settlement: X402SettlementResponse) => void;
}

interface RequestOptions {
  body?: unknown;
  query?: Record<string, unknown>;
  signed?: boolean;
  directoryAuth?: boolean;
  directoryActor?: string;
  agentAuth?: boolean;
  adminAuth?: boolean;
  headers?: Record<string, string>;
  responseType?: "json" | "text" | "raw";
  signBody?: BodySigner;
  /** Internal: set once an x402 payment has been attached, to bound the retry. */
  x402Paid?: boolean;
}

export interface TinyPlaceErrorJSON {
  name: string;
  message: string;
  status: number;
  code: TinyPlaceErrorCode;
  hint: string;
  retryable: boolean;
  body: unknown;
  paymentRequired?: PaymentRequiredChallenge;
}

export class TinyPlaceError extends Error {
  public readonly paymentRequired?: PaymentRequiredChallenge;
  public readonly headers: Record<string, string>;

  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
    options: TinyPlaceErrorOptions = {},
  ) {
    super(message ?? `HTTP ${status}`);
    this.name = "TinyPlaceError";
    this.headers = options.headers ?? {};
    this.paymentRequired =
      options.paymentRequired ?? paymentRequiredFromBody(body);
  }

  /**
   * Stable, machine-readable category an agent can branch on (e.g.
   * `payment_required`, `auth_invalid`, `rate_limited`). Derived from the status
   * and body via {@link classifyError}. Lazy getter so it never changes the
   * constructor and stays cheap for callers that never read it.
   */
  get code(): TinyPlaceErrorCode {
    return classifyError(this).code;
  }

  /** One sentence telling an LLM what to do next about this error. */
  get hint(): string {
    return classifyError(this).hint;
  }

  /** Whether retrying the same call (after backoff) can plausibly succeed. */
  get retryable(): boolean {
    return classifyError(this).retryable;
  }

  /**
   * Serialize to a plain object including `code`/`hint`/`retryable`. Without
   * this, `JSON.stringify(error)` would emit `{}` (Error fields are
   * non-enumerable); with it, an agent gets the full recovery context.
   */
  toJSON(): TinyPlaceErrorJSON {
    const { code, hint, retryable } = classifyError(this);
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code,
      hint,
      retryable,
      body: this.body,
      ...(this.paymentRequired ? { paymentRequired: this.paymentRequired } : {}),
    };
  }
}

export interface PaymentRequiredChallenge {
  error?: string;
  payment: PaymentChallenge;
  /** The x402 protocol version of a standard `accepts[]` challenge (e.g. 2). */
  x402Version?: number;
  /** The canonical URL of the payable resource, from a standard challenge. */
  resource?: string;
}

export interface PaymentChallenge {
  scheme?: string;
  network?: string;
  asset?: string;
  amount?: string;
  /**
   * The paying agent. The standard x402 `accepts[]` challenge does not carry a
   * payer field, so this is undefined against a standard backend; callers
   * default it to their own signer (`challenge.from || signer.agentId`).
   */
  from?: string;
  /**
   * The recipient address the payment settles to. Maps from a standard
   * challenge's `payTo`.
   */
  to?: string;
  nonce?: string;
  expiresAt?: string;
  signature?: string;
  /**
   * The facilitator fee payer the client sets when building a payer-signed
   * transfer. From a standard challenge this is the entry's `extra.feePayer`,
   * surfaced here (and mirrored into `metadata.feePayer`) for the client.
   */
  feePayer?: string;
  /** The authorization validity window (seconds), from a standard challenge. */
  maxTimeoutSeconds?: number;
  metadata?: Record<string, string>;
}

interface TinyPlaceErrorOptions {
  headers?: Record<string, string>;
  paymentRequired?: PaymentRequiredChallenge;
}

/**
 * Controls automatic retry-with-backoff for transient failures (the backend
 * being slow, briefly down, or returning a 5xx/429). Retries are only attempted
 * for idempotent methods by default so a write is never silently duplicated.
 */
export interface RetryOptions {
  /** Max retry attempts after the first try. `0` disables retries. Default `2`. */
  retries?: number;
  /** Base backoff delay in ms (exponential, with jitter). Default `200`. */
  baseDelayMs?: number;
  /** Upper bound on a single backoff delay in ms. Default `5000`. */
  maxDelayMs?: number;
  /** HTTP statuses treated as transient. Default `[408, 429, 500, 502, 503, 504]`. */
  retryableStatuses?: Array<number>;
  /**
   * HTTP methods eligible for retry. Default `["GET", "HEAD", "OPTIONS"]`
   * (idempotent reads only — writes are never auto-retried unless added here).
   */
  retryMethods?: Array<string>;
  /**
   * Retry connection-level failures (network unreachable, DNS, timeout) for the
   * eligible methods. Default `true`.
   */
  retryNetworkErrors?: boolean;
}

interface ResolvedRetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: Set<number>;
  retryMethods: Set<string>;
  retryNetworkErrors: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function resolveRetryOptions(options?: RetryOptions): ResolvedRetryOptions {
  return {
    retries: options?.retries ?? 2,
    baseDelayMs: options?.baseDelayMs ?? 200,
    maxDelayMs: options?.maxDelayMs ?? 5_000,
    retryableStatuses: new Set(
      options?.retryableStatuses ?? [408, 429, 500, 502, 503, 504],
    ),
    retryMethods: new Set(
      (options?.retryMethods ?? ["GET", "HEAD", "OPTIONS"]).map((method) =>
        method.toUpperCase(),
      ),
    ),
    retryNetworkErrors: options?.retryNetworkErrors ?? true,
  };
}

export interface HttpClientOptions {
  baseUrl: string;
  signingKey?: SigningKey;
  publicKeyBase64?: string;
  adminSigningKey?: SigningKey;
  admin?: AdminSigningOptions;
  /**
   * A bearer onboarding grant for key-less onboarding clients. When set, every
   * request carries `Authorization: TinyPlace-Onboard …` instead of a
   * per-request signature; the backend authorizes whitelisted onboarding
   * actions for the grant's wallet.
   */
  onboardGrant?: OnboardGrantCredential;
  fetch?: typeof globalThis.fetch;
  /**
   * Invoked when a request is rejected with 401/403, just before the error is
   * thrown. Lets the caller react to an invalidated session by
   * re-authenticating. Must not throw.
   */
  onAuthInvalid?: (status: number, body: unknown) => Promise<void> | void;
  /**
   * Per-request timeout in milliseconds. A request that does not produce a
   * response within this window is aborted and surfaces as a `TinyPlaceError`
   * with `status: 0` (and is retried when the method is eligible). Default
   * `30000`. Pass `0` to disable the timeout.
   */
  timeoutMs?: number;
  /**
   * Automatic retry-with-backoff for transient failures. Defaults retry
   * idempotent reads (GET/HEAD/OPTIONS) twice on network errors and 5xx/429
   * responses. See {@link RetryOptions}. Pass `{ retries: 0 }` to disable.
   */
  retry?: RetryOptions;
  /**
   * Enables automatic settlement of standard x402 (HTTP 402) challenges. See
   * {@link X402PayerConfig}. When unset, a 402 surfaces as a {@link TinyPlaceError}
   * for the caller to handle.
   */
  x402Payer?: X402PayerConfig;
}

function buildQuery(params: Record<string, unknown>): string {
  const parts: Array<string> = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`,
        );
      }
    } else {
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
      );
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly signingKey?: SigningKey;
  private readonly publicKeyBase64?: string;
  private readonly adminSigningKey?: SigningKey;
  private readonly admin?: AdminSigningOptions;
  private readonly onboardGrant?: OnboardGrantCredential;
  private readonly _fetch: typeof globalThis.fetch;
  private readonly onAuthInvalid?: (status: number, body: unknown) => Promise<void> | void;
  private readonly timeoutMs: number;
  private readonly retryOptions: ResolvedRetryOptions;
  private readonly x402Payer?: X402PayerConfig;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.signingKey = options.signingKey;
    this.publicKeyBase64 = options.publicKeyBase64;
    this.adminSigningKey = options.adminSigningKey;
    this.admin = options.admin;
    this.onboardGrant = options.onboardGrant;
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.onAuthInvalid = options.onAuthInvalid;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryOptions = resolveRetryOptions(options.retry);
    this.x402Payer = options.x402Payer;
  }

  /**
   * The base64 Ed25519 public key presented for signed requests (the signing
   * key's public key), if any. Used by callers that attach their own auth
   * headers (e.g. a DELETE with the signature in X-TinyPlace-Signature) and
   * need to also present the signing key's public key.
   */
  signingPublicKey(): string | undefined {
    return this.publicKeyBase64;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: RequestOptions,
  ): Promise<T> {
    const queryString = options?.query ? buildQuery(options.query) : "";
    const url = `${this.baseUrl}${path}${queryString}`;
    let body = options?.body;
    if (options?.signBody && body != null) {
      body = await options.signBody(body);
    }

    try {
      return await this.sendWithRetry<T>(method, path, queryString, url, {
        ...options,
        body,
      });
    } catch (error) {
      // Standard x402: a 402 carrying a PAYMENT-REQUIRED challenge is settled
      // inline by retrying the SAME request once with a PAYMENT-SIGNATURE header.
      const paid = await this.attachX402Payment(error, { ...options, body });
      if (paid) {
        return this.sendWithRetry<T>(method, path, queryString, url, paid);
      }
      if (!shouldRetryInvalidSignature(error) || !options?.signBody) {
        throw error;
      }
      const nextBody = await options.signBody(stripSignature(body));
      if (bodySignature(nextBody) === bodySignature(body)) {
        throw error;
      }
      return this.sendWithRetry<T>(method, path, queryString, url, {
        ...options,
        body: nextBody,
      });
    }
  }

  /**
   * If `error` is a 402 carrying a standard `PAYMENT-REQUIRED` challenge and an
   * {@link X402PayerConfig} is configured (and we haven't already paid this
   * request), build the Solana `exact` PaymentPayload and return request options
   * with the `PAYMENT-SIGNATURE` header attached for a single retry. Returns
   * undefined when the request is not a payable 402, no payer is configured, or a
   * payment was already attempted — so the caller falls through to normal error
   * handling.
   */
  private async attachX402Payment(
    error: unknown,
    options: RequestOptions,
  ): Promise<RequestOptions | undefined> {
    if (
      !this.x402Payer ||
      options.x402Paid ||
      !(error instanceof TinyPlaceError) ||
      error.status !== 402
    ) {
      return undefined;
    }
    const challenge = decodePaymentRequired(
      error.headers?.["payment-required"],
    );
    if (!challenge) {
      return undefined;
    }
    const payload = await buildExactSvmPaymentPayload({
      challenge,
      secretKey: this.x402Payer.secretKey,
      rpcUrl: this.x402Payer.rpcUrl,
      fetch: this.x402Payer.fetch ?? this._fetch,
    });
    return {
      ...options,
      x402Paid: true,
      headers: {
        ...options.headers,
        [X402_HEADER_PAYMENT_SIGNATURE]: encodePaymentSignature(payload),
      },
    };
  }

  /**
   * Wrap {@link sendRequest} with retry-with-backoff for transient failures.
   * Each attempt re-enters `sendRequest`, which re-signs the request, so retries
   * carry a fresh timestamp/nonce and are never rejected as a replay. Network
   * errors and configured retryable statuses are retried for eligible
   * (idempotent) methods only; a `Retry-After` header is honoured when present.
   */
  private async sendWithRetry<T>(
    method: string,
    path: string,
    queryString: string,
    url: string,
    options?: RequestOptions,
  ): Promise<T> {
    const retry = this.retryOptions;
    const eligible =
      retry.retries > 0 && retry.retryMethods.has(method.toUpperCase());
    let attempt = 0;
    for (;;) {
      try {
        return await this.sendRequest<T>(
          method,
          path,
          queryString,
          url,
          options,
        );
      } catch (error) {
        if (!eligible || attempt >= retry.retries) {
          throw error;
        }
        const wait = retryDelayMs(error, attempt, retry);
        if (wait === undefined) {
          throw error;
        }
        attempt += 1;
        await sleep(wait);
      }
    }
  }

  private async sendRequest<T>(
    method: string,
    path: string,
    queryString: string,
    url: string,
    options?: RequestOptions,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Identify this first-party SDK so the backend can serve the legacy x402
      // challenge shape during the standardization migration; standard clients
      // omit this header and receive a clean x402 v2 challenge.
      [HEADER_SDK_CLIENT]: SDK_CLIENT,
      ...(options?.headers ?? {}),
    };

    const bodyStr = options?.body != null ? JSON.stringify(options.body) : "";

    // A key-less onboarding client carries its bearer grant on every request in
    // place of a per-request signature. The backend authorizes only whitelisted
    // onboarding actions for the grant's wallet.
    if (this.onboardGrant) {
      headers["Authorization"] = this.onboardGrant.authorizationHeader();
    }

    if (options?.adminAuth && this.adminSigningKey) {
      const requestUri = `${path}${queryString}`;
      const adminHeaders = await signAdminRequest(
        this.adminSigningKey,
        method,
        requestUri,
        bodyStr,
        this.admin,
      );
      Object.assign(headers, adminHeaders);
    } else if (
      (options?.directoryAuth || options?.agentAuth) &&
      this.signingKey &&
      this.publicKeyBase64
    ) {
      const requestUri = `${path}${queryString}`;
      const writeHeaders = await signDirectoryWrite(
        this.signingKey,
        this.publicKeyBase64,
        method,
        requestUri,
        bodyStr,
      );
      Object.assign(headers, writeHeaders);
      headers["X-Agent-ID"] = options.agentAuth
        ? this.signingKey.agentId
        : (options.directoryActor ?? this.publicKeyBase64);
    } else if (options?.signed && this.signingKey) {
      const authHeaders = await signRequest(this.signingKey, bodyStr);
      Object.assign(headers, authHeaders);
    }

    const controller =
      this.timeoutMs > 0 && typeof AbortController !== "undefined"
        ? new AbortController()
        : undefined;
    const timer =
      controller !== undefined
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : undefined;
    let response: Response;
    try {
      response = await this._fetch(url, {
        method,
        headers,
        body: bodyStr || undefined,
        signal: controller?.signal,
      });
    } catch (error) {
      throw asTransportError(error, path, controller?.signal.aborted ?? false);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      let parsed: unknown;
      try {
        parsed = JSON.parse(errorBody);
      } catch {
        parsed = errorBody;
      }
      if (response.status === 401 && this.onAuthInvalid) {
        await this.onAuthInvalid(response.status, parsed);
      }
      throw new TinyPlaceError(
        response.status,
        parsed,
        `HTTP ${response.status}: ${path}`,
        {
          headers: responseHeaders(response.headers),
          paymentRequired: paymentRequiredFromHeader(response.headers),
        },
      );
    }

    // Surface a standard x402 settlement (PAYMENT-RESPONSE) to the payer hook.
    if (this.x402Payer?.onSettled) {
      const settlement = decodeSettlementResponse(
        response.headers.get(X402_HEADER_PAYMENT_RESPONSE),
      );
      if (settlement) {
        this.x402Payer.onSettled(settlement);
      }
    }

    if (response.status === 204) {
      return undefined as T;
    }

    if (options?.responseType === "raw") {
      return response as T;
    }

    if (options?.responseType === "text") {
      return response.text() as Promise<T>;
    }

    return response.json() as Promise<T>;
  }

  get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  getAuth<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, { query, signed: true });
  }

  getAdmin<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, { query, adminAuth: true });
  }

  getText(path: string, query?: Record<string, unknown>): Promise<string> {
    return this.request<string>("GET", path, { query, responseType: "text" });
  }

  getRaw(
    path: string,
    query?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<Response> {
    return this.request<Response>("GET", path, {
      query,
      headers,
      responseType: "raw",
    });
  }

  getAuthRaw(path: string, query?: Record<string, unknown>): Promise<Response> {
    return this.request<Response>("GET", path, {
      query,
      signed: true,
      responseType: "raw",
    });
  }

  getDirectoryAuth<T>(
    path: string,
    query?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>("GET", path, {
      query,
      headers,
      directoryAuth: true,
    });
  }

  getDirectoryAuthAs<T>(
    path: string,
    actor: string,
    query?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>("GET", path, {
      query,
      headers,
      directoryAuth: true,
      directoryActor: actor,
    });
  }

  getAgentAuth<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, { query, agentAuth: true });
  }

  getDirectoryAuthRaw(
    path: string,
    query?: Record<string, unknown>,
  ): Promise<Response> {
    return this.request<Response>("GET", path, {
      query,
      directoryAuth: true,
      responseType: "raw",
    });
  }

  getDirectoryAuthRawAs(
    path: string,
    actor: string,
    query?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<Response> {
    return this.request<Response>("GET", path, {
      query,
      headers,
      directoryAuth: true,
      directoryActor: actor,
      responseType: "raw",
    });
  }

  /**
   * Execute a read-only GraphQL query against POST /graphql, reusing the same
   * auth paths as the REST methods. `auth: "agent"` signs as the connected
   * wallet's agent (required for viewer-scoped fields like the home feed),
   * "directory"/"signed" use the other signing modes, and the default sends no
   * auth (public reads such as comments/profile/marketplace). The backend
   * answers 200 with `{ data, errors }`; field errors are surfaced as a
   * TinyPlaceError rather than a silently-null payload.
   */
  async graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
    options?: {
      auth?: "none" | "signed" | "agent" | "directory";
      operationName?: string;
    },
  ): Promise<T> {
    const body: Record<string, unknown> = { query, variables: variables ?? {} };
    if (options?.operationName) {
      body["operationName"] = options.operationName;
    }
    const requestOptions: {
      body: unknown;
      signed?: boolean;
      agentAuth?: boolean;
      directoryAuth?: boolean;
    } = { body };
    switch (options?.auth) {
      case "agent":
        requestOptions.agentAuth = true;
        break;
      case "directory":
        requestOptions.directoryAuth = true;
        break;
      case "signed":
        requestOptions.signed = true;
        break;
      default:
        break;
    }
    const result = await this.request<GraphQLResponse<T>>(
      "POST",
      "/graphql",
      requestOptions,
    );
    return unwrapGraphQL<T>(result);
  }

  post<T>(path: string, body?: unknown, signBody?: BodySigner): Promise<T> {
    return this.request<T>("POST", path, { body, signed: true, signBody });
  }

  postAdmin<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body, adminAuth: true });
  }

  postPublic<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    signBody?: BodySigner,
  ): Promise<T> {
    return this.request<T>("POST", path, { body, headers, signBody });
  }

  postPublicRaw(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<Response> {
    return this.request<Response>("POST", path, {
      body,
      headers,
      responseType: "raw",
    });
  }

  put<T>(path: string, body?: unknown, signBody?: BodySigner): Promise<T> {
    return this.request<T>("PUT", path, { body, signed: true, signBody });
  }

  putAdmin<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body, adminAuth: true });
  }

  postDirectoryAuth<T>(
    path: string,
    body?: unknown,
    signBody?: BodySigner,
  ): Promise<T> {
    return this.request<T>("POST", path, { body, directoryAuth: true, signBody });
  }

  postDirectoryAuthAs<T>(
    path: string,
    actor: string,
    body?: unknown,
    signBody?: BodySigner,
    headers?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>("POST", path, {
      body,
      directoryAuth: true,
      directoryActor: actor,
      signBody,
      ...(headers ? { headers } : {}),
    });
  }

  putDirectoryAuth<T>(
    path: string,
    body?: unknown,
    signBody?: BodySigner,
  ): Promise<T> {
    return this.request<T>("PUT", path, { body, directoryAuth: true, signBody });
  }

  putDirectoryAuthAs<T>(
    path: string,
    actor: string,
    body?: unknown,
    signBody?: BodySigner,
  ): Promise<T> {
    return this.request<T>("PUT", path, {
      body,
      directoryAuth: true,
      directoryActor: actor,
      signBody,
    });
  }

  putAgentAuth<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body, agentAuth: true });
  }

  postAgentAuth<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body, agentAuth: true });
  }

  delete<T>(path: string, body?: unknown, signBody?: BodySigner): Promise<T> {
    return this.request<T>("DELETE", path, { body, signed: true, signBody });
  }

  deletePublic<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>("DELETE", path, { body, headers });
  }

  deleteAdmin<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, { body, adminAuth: true });
  }

  deletePublicRaw(
    path: string,
    headers?: Record<string, string>,
  ): Promise<Response> {
    return this.request<Response>("DELETE", path, {
      headers,
      responseType: "raw",
    });
  }

  deleteDirectoryAuth<T>(
    path: string,
    body?: unknown,
    signBody?: BodySigner,
  ): Promise<T> {
    return this.request<T>("DELETE", path, {
      body,
      directoryAuth: true,
      signBody,
    });
  }

  deleteAgentAuth<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, { body, agentAuth: true });
  }

  deleteDirectoryAuthAs<T>(
    path: string,
    actor: string,
    body?: unknown,
    signBody?: BodySigner,
  ): Promise<T> {
    return this.request<T>("DELETE", path, {
      body,
      directoryAuth: true,
      directoryActor: actor,
      signBody,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a connection-level failure (network unreachable, DNS, refused
 * connection, or an abort from the request timeout) into a `TinyPlaceError`
 * with `status: 0`, so callers see one error type regardless of whether the
 * backend answered. The original error is preserved as the `cause`.
 */
function asTransportError(
  error: unknown,
  path: string,
  timedOut: boolean,
): TinyPlaceError {
  if (error instanceof TinyPlaceError) {
    return error;
  }
  const aborted =
    timedOut ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: string }).name === "AbortError");
  const detail = error instanceof Error ? error.message : String(error);
  const message = aborted
    ? `Request to ${path} timed out`
    : `Request to ${path} failed: ${detail}`;
  const wrapped = new TinyPlaceError(0, detail, message);
  (wrapped as { cause?: unknown }).cause = error;
  return wrapped;
}

/**
 * Decide how long to wait before retrying `error`, or `undefined` when it is not
 * a transient failure. Transport errors (`status: 0`) retry when network retries
 * are enabled; configured retryable statuses retry and honour a `Retry-After`
 * header; everything else is non-retryable.
 */
function retryDelayMs(
  error: unknown,
  attempt: number,
  retry: ResolvedRetryOptions,
): number | undefined {
  const backoff = (): number => {
    const ceiling = Math.min(
      retry.maxDelayMs,
      retry.baseDelayMs * 2 ** attempt,
    );
    // Half jitter: a guaranteed floor plus a random spread, to avoid retry
    // storms when many clients fail at once.
    return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
  };

  if (!(error instanceof TinyPlaceError)) {
    return retry.retryNetworkErrors ? backoff() : undefined;
  }
  if (error.status === 0) {
    return retry.retryNetworkErrors ? backoff() : undefined;
  }
  if (!retry.retryableStatuses.has(error.status)) {
    return undefined;
  }
  const retryAfter = retryAfterMs(error.headers["retry-after"]);
  return retryAfter ?? backoff();
}

/** Parse a `Retry-After` header (delta-seconds or HTTP date) into ms. */
function retryAfterMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.max(0, date - Date.now());
  }
  return undefined;
}

function shouldRetryInvalidSignature(error: unknown): boolean {
  if (!(error instanceof TinyPlaceError) || error.status !== 401) {
    return false;
  }
  const body = error.body;
  if (typeof body === "string") {
    return body.toLowerCase().includes("invalid signature");
  }
  if (body && typeof body === "object" && "error" in body) {
    return String(body.error).toLowerCase().includes("invalid signature");
  }
  return false;
}

function stripSignature(body: unknown): unknown {
  if (!body || typeof body !== "object" || !("signature" in body)) {
    return body;
  }
  const { signature: _signature, ...rest } = body as Record<string, unknown>;
  return rest;
}

function bodySignature(body: unknown): unknown {
  if (!body || typeof body !== "object" || !("signature" in body)) {
    return undefined;
  }
  return (body as { signature?: unknown }).signature;
}

function responseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function paymentRequiredFromHeader(
  headers: Headers,
): PaymentRequiredChallenge | undefined {
  // Prefer the canonical x402 v2 header (PAYMENT-REQUIRED); fall back to the
  // legacy tiny.place `x-payment-required` name during the transition. Header
  // lookups are case-insensitive.
  const encoded =
    headers.get("payment-required") ?? headers.get("x-payment-required");
  if (!encoded) return undefined;

  try {
    return asPaymentRequiredChallenge(JSON.parse(base64UrlDecode(encoded)));
  } catch {
    return undefined;
  }
}

function paymentRequiredFromBody(
  body: unknown,
): PaymentRequiredChallenge | undefined {
  return asPaymentRequiredChallenge(body);
}

function asPaymentRequiredChallenge(
  value: unknown,
): PaymentRequiredChallenge | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  // Prefer the STANDARD x402 v2 shape (top-level `accepts[]`) — the only shape
  // backend-v2 emits. Fall back to the legacy tiny.place `payment{}` shape so
  // older backends (and the header variant) keep working.
  return (
    standardPaymentRequiredChallenge(value as Record<string, unknown>) ??
    legacyPaymentRequiredChallenge(value as Record<string, unknown>)
  );
}

/**
 * Parse a STANDARD x402 v2 402 challenge: `{ x402Version, error, resource,
 * accepts: [{ scheme, network, asset, amount|maxAmountRequired, payTo,
 * maxTimeoutSeconds, extra: { feePayer } }] }`. We read the first `accepts`
 * entry and map it onto the SDK's `PaymentChallenge` (`payTo`→`to`,
 * `extra.feePayer`→`feePayer`+`metadata.feePayer`). The standard challenge
 * carries no payer field, so `from` is left undefined for callers to default.
 */
function standardPaymentRequiredChallenge(
  value: Record<string, unknown>,
): PaymentRequiredChallenge | undefined {
  const accepts = value["accepts"];
  if (!Array.isArray(accepts) || accepts.length === 0) {
    return undefined;
  }
  const entry = accepts[0];
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }
  const requirement = entry as Record<string, unknown>;

  const payment: PaymentChallenge = {
    ...stringField(requirement, "scheme"),
    ...stringField(requirement, "network"),
    ...stringField(requirement, "asset"),
    // Accept either `amount` (canonical x402 v2) or `maxAmountRequired`.
    ...amountField(requirement),
    ...stringField(requirement, "payTo", "to"),
    ...stringField(requirement, "nonce"),
    ...stringField(requirement, "expiresAt"),
    ...numberField(requirement, "maxTimeoutSeconds"),
  };

  const extra =
    typeof requirement["extra"] === "object" && requirement["extra"] !== null
      ? (requirement["extra"] as Record<string, unknown>)
      : undefined;
  if (extra) {
    const metadata: Record<string, string> = {};
    for (const [key, raw] of Object.entries(extra)) {
      if (
        typeof raw === "string" &&
        key !== "from" &&
        key !== "nonce" &&
        key !== "expiresAt"
      ) {
        metadata[key] = raw;
      }
    }
    if (!payment.from && typeof extra["from"] === "string") {
      payment.from = extra["from"];
    }
    if (!payment.nonce && typeof extra["nonce"] === "string") {
      payment.nonce = extra["nonce"];
    }
    if (!payment.expiresAt && typeof extra["expiresAt"] === "string") {
      payment.expiresAt = extra["expiresAt"];
    }
    if (typeof extra["feePayer"] === "string") {
      payment.feePayer = extra["feePayer"];
    }
    if (Object.keys(metadata).length > 0) {
      payment.metadata = metadata;
    }
  }

  const error = value["error"];
  const x402Version = value["x402Version"];
  const resource = resourceUrl(value["resource"]);
  return {
    ...(typeof error === "string" ? { error } : {}),
    ...(typeof x402Version === "number" ? { x402Version } : {}),
    ...(resource ? { resource } : {}),
    payment,
  };
}

/** Parse the legacy tiny.place `{ error?, payment: {...} }` 402 shape. */
function legacyPaymentRequiredChallenge(
  value: Record<string, unknown>,
): PaymentRequiredChallenge | undefined {
  const error = value["error"];
  const errorField = typeof error === "string" ? { error } : {};
  const payment = value["payment"];
  if (typeof payment !== "object" || payment === null) {
    return undefined;
  }
  const challengePayment = payment as Record<string, unknown>;
  return {
    ...errorField,
    payment: {
      ...stringField(challengePayment, "scheme"),
      ...stringField(challengePayment, "network"),
      ...stringField(challengePayment, "asset"),
      ...stringField(challengePayment, "amount"),
      ...stringField(challengePayment, "from"),
      ...stringField(challengePayment, "to"),
      ...stringField(challengePayment, "nonce"),
      ...stringField(challengePayment, "expiresAt"),
      ...stringField(challengePayment, "signature"),
      ...stringField(challengePayment, "feePayer"),
      ...metadataField(challengePayment),
    },
  };
}

/** `amount` (canonical v2), falling back to `maxAmountRequired`. */
function amountField(
  source: Record<string, unknown>,
): Partial<PaymentChallenge> {
  if (typeof source["amount"] === "string") {
    return { amount: source["amount"] };
  }
  if (typeof source["maxAmountRequired"] === "string") {
    return { amount: source["maxAmountRequired"] };
  }
  return {};
}

function numberField(
  source: Record<string, unknown>,
  key: "maxTimeoutSeconds",
): Partial<PaymentChallenge> {
  return typeof source[key] === "number" ? { [key]: source[key] } : {};
}

function resourceUrl(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { url?: unknown }).url === "string"
  ) {
    return (value as { url: string }).url;
  }
  return undefined;
}

function stringField(
  source: Record<string, unknown>,
  key: string,
  target: keyof PaymentChallenge = key as keyof PaymentChallenge,
): Partial<PaymentChallenge> {
  return typeof source[key] === "string" ? { [target]: source[key] } : {};
}

function metadataField(
  source: Record<string, unknown>,
): Pick<PaymentChallenge, "metadata"> | Record<string, never> {
  if (typeof source["metadata"] !== "object" || source["metadata"] === null) {
    return {};
  }

  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(source["metadata"])) {
    if (typeof value === "string") {
      metadata[key] = value;
    }
  }
  return { metadata };
}

function base64UrlDecode(value: string): string {
  const padded = value.padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
}

/** A GraphQL error entry as returned in the response `errors` array. */
export interface GraphQLError {
  message: string;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
}

/** The envelope returned by POST /graphql (HTTP 200 with data and/or errors). */
export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<GraphQLError>;
}

/**
 * Unwrap a GraphQL response: throw a TinyPlaceError when the server reported
 * field errors (preserving an x402 challenge if one rode along in an error
 * extension), otherwise return the data payload.
 */
function unwrapGraphQL<T>(response: GraphQLResponse<T>): T {
  if (response.errors && response.errors.length > 0) {
    const message = response.errors.map((error) => error.message).join("; ");
    throw new TinyPlaceError(200, response, `GraphQL error: ${message}`);
  }
  return response.data as T;
}
