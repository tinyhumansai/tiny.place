import type { SigningKey } from "./auth.js";
import {
  signAdminRequest,
  signDirectoryWrite,
  signRequest,
  type AdminSigningOptions,
} from "./auth.js";

export class TinyVerseError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
    this.name = "TinyVerseError";
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  signingKey?: SigningKey;
  publicKeyBase64?: string;
  adminSigningKey?: SigningKey;
  admin?: AdminSigningOptions;
  fetch?: typeof globalThis.fetch;
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

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.signingKey = options.signingKey;
    this.publicKeyBase64 = options.publicKeyBase64;
    this.adminSigningKey = options.adminSigningKey;
    this.admin = options.admin;
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
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
      throw new TinyVerseError(
        response.status,
        parsed,
        `HTTP ${response.status}: ${path}`,
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
  ): Promise<T> {
    return this.request<T>("GET", path, { query, directoryAuth: true });
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

  deleteAgentAuth<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, { body, agentAuth: true });
  }
}
