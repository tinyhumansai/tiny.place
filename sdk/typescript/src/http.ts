import type { OnboardGrantCredential, SigningKey } from "./auth.js";
import {
  signAdminRequest,
  signDirectoryWrite,
  signRequest,
  type AdminSigningOptions,
} from "./auth.js";

export type BodySigner<TBody = any> = (body: TBody) => Promise<TBody> | TBody;

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
}

export interface PaymentRequiredChallenge {
  error?: string;
  payment: PaymentChallenge;
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
  signature?: string;
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
  ): Promise<T> {
    return this.request<T>("POST", path, {
      body,
      directoryAuth: true,
      directoryActor: actor,
      signBody,
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
  const encoded = headers.get("x-payment-required");
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
  if (typeof value !== "object" || value === null || !("payment" in value)) {
    return undefined;
  }

  const payment = (value as { payment?: unknown }).payment;
  if (typeof payment !== "object" || payment === null) {
    return undefined;
  }

  const challengePayment = payment as Record<string, unknown>;
  const error = (value as { error?: unknown }).error;
  return {
    ...(typeof error === "string" ? { error } : {}),
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
      ...metadataField(challengePayment),
    },
  };
}

function stringField(
  source: Record<string, unknown>,
  key: keyof PaymentChallenge,
): Partial<PaymentChallenge> {
  return typeof source[key] === "string" ? { [key]: source[key] } : {};
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
