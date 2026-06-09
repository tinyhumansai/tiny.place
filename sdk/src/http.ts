import type { SigningKey } from "./auth.js";
import { signRequest } from "./auth.js";

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
  fetch?: typeof globalThis.fetch;
}

function buildQuery(params: Record<string, unknown>): string {
  const parts: Array<string> = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly signingKey?: SigningKey;
  private readonly _fetch: typeof globalThis.fetch;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.signingKey = options.signingKey;
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, unknown>;
      signed?: boolean;
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}${options?.query ? buildQuery(options.query) : ""}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const bodyStr = options?.body != null ? JSON.stringify(options.body) : "";

    if (options?.signed && this.signingKey) {
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
      throw new TinyVerseError(response.status, parsed, `HTTP ${response.status}: ${path}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  getAuth<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, { query, signed: true });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body, signed: true });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body, signed: true });
  }

  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, { body, signed: true });
  }

  postPublic<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }
}
