import type { SigningKey } from "./auth.js";
import {
  signAdminRequest,
  signDirectoryWrite,
  signRequest,
  type AdminSigningOptions,
} from "./auth.js";

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

export interface HttpClientOptions {
  baseUrl: string;
  signingKey?: SigningKey;
  publicKeyBase64?: string;
  adminSigningKey?: SigningKey;
  admin?: AdminSigningOptions;
  fetch?: typeof globalThis.fetch;
  /**
   * Invoked when a request is rejected with 401/403, just before the error is
   * thrown. Lets the caller react to an invalidated session (e.g. a revoked or
   * expired approved-signer grant) by re-authenticating. Must not throw.
   */
  onAuthInvalid?: (status: number, body: unknown) => void;
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
  private readonly _fetch: typeof globalThis.fetch;
  private readonly onAuthInvalid?: (status: number, body: unknown) => void;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.signingKey = options.signingKey;
    this.publicKeyBase64 = options.publicKeyBase64;
    this.adminSigningKey = options.adminSigningKey;
    this.admin = options.admin;
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.onAuthInvalid = options.onAuthInvalid;
  }

  /**
   * The base64 Ed25519 public key presented for signed requests (the signing
   * key's public key), if any. Used by callers that attach their own auth
   * headers (e.g. a DELETE with the signature in X-TinyPlace-Signature) and
   * need to also present the signing key for approved-signer delegation.
   */
  signingPublicKey(): string | undefined {
    return this.publicKeyBase64;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, unknown>;
      signed?: boolean;
      directoryAuth?: boolean;
      directoryActor?: string;
      agentAuth?: boolean;
      adminAuth?: boolean;
      headers?: Record<string, string>;
      responseType?: "json" | "text" | "raw";
    },
  ): Promise<T> {
    const queryString = options?.query ? buildQuery(options.query) : "";
    const url = `${this.baseUrl}${path}${queryString}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    };

    const bodyStr = options?.body != null ? JSON.stringify(options.body) : "";

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

    const response = await this._fetch(url, {
      method,
      headers,
      body: bodyStr || undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      let parsed: unknown;
      try {
        parsed = JSON.parse(errorBody);
      } catch {
        parsed = errorBody;
      }
      if (response.status === 401 && this.onAuthInvalid) {
        this.onAuthInvalid(response.status, parsed);
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
    return this.request<T>("GET", path, { query, headers, directoryAuth: true });
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

  getAgentAuth<T>(
    path: string,
    query?: Record<string, unknown>,
  ): Promise<T> {
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

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body, signed: true });
  }

  postAdmin<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body, adminAuth: true });
  }

  postPublic<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
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

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body, signed: true });
  }

  putAdmin<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body, adminAuth: true });
  }

  postDirectoryAuth<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body, directoryAuth: true });
  }

  postDirectoryAuthAs<T>(
    path: string,
    actor: string,
    body?: unknown,
  ): Promise<T> {
    return this.request<T>("POST", path, {
      body,
      directoryAuth: true,
      directoryActor: actor,
    });
  }

  putDirectoryAuth<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body, directoryAuth: true });
  }

  putDirectoryAuthAs<T>(
    path: string,
    actor: string,
    body?: unknown,
  ): Promise<T> {
    return this.request<T>("PUT", path, {
      body,
      directoryAuth: true,
      directoryActor: actor,
    });
  }

  putAgentAuth<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body, agentAuth: true });
  }

  postAgentAuth<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body, agentAuth: true });
  }

  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, { body, signed: true });
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

  deleteDirectoryAuth<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, { body, directoryAuth: true });
  }

  deleteAgentAuth<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, { body, agentAuth: true });
  }

  deleteDirectoryAuthAs<T>(
    path: string,
    actor: string,
    body?: unknown,
  ): Promise<T> {
    return this.request<T>("DELETE", path, {
      body,
      directoryAuth: true,
      directoryActor: actor,
    });
  }
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
    return asPaymentRequiredChallenge(
      JSON.parse(base64UrlDecode(encoded)),
    );
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
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
}
