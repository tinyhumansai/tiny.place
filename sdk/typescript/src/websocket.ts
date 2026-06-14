import type { SigningKey } from "./auth.js";
import { signDirectoryWriteQuery, signRequest } from "./auth.js";

export type WebSocketEventHandler<T = unknown> = (data: T) => void;

export interface TinyVerseWebSocketOptions {
  url: string;
  signingKey?: SigningKey;
  directoryAuth?: {
    publicKeyBase64: string;
  };
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class TinyVerseWebSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<WebSocketEventHandler>>();
  private reconnectCount = 0;
  private closed = false;

  private readonly url: string;
  private readonly signingKey?: SigningKey;
  private readonly directoryAuth?: {
    publicKeyBase64: string;
  };
  private readonly reconnect: boolean;
  private readonly reconnectInterval: number;
  private readonly maxReconnectAttempts: number;

  constructor(options: TinyVerseWebSocketOptions) {
    this.url = options.url;
    this.signingKey = options.signingKey;
    this.directoryAuth = options.directoryAuth;
    this.reconnect = options.reconnect ?? true;
    this.reconnectInterval = options.reconnectInterval ?? 3000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
  }

  async connect(): Promise<void> {
    this.closed = false;
    let wsUrl = this.url;

    if (this.signingKey && this.directoryAuth) {
      wsUrl = await this.signDirectoryWriteUrl(wsUrl);
    } else if (this.signingKey) {
      const authHeaders = await signRequest(this.signingKey, "");
      const auth = encodeURIComponent(authHeaders.Authorization);
      const separator = wsUrl.includes("?") ? "&" : "?";
      wsUrl = `${wsUrl}${separator}authorization=${auth}`;
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = (): void => {
        this.reconnectCount = 0;
        this.emit("open", undefined);
        resolve();
      };

      this.ws.onmessage = (event): void => {
        try {
          const data = JSON.parse(String(event.data));
          this.emit("message", data);
          if (data.type) {
            this.emit(data.type, data);
          }
        } catch {
          this.emit("message", event.data);
        }
      };

      this.ws.onclose = (): void => {
        this.emit("close", undefined);
        if (!this.closed && this.reconnect && this.reconnectCount < this.maxReconnectAttempts) {
          this.reconnectCount++;
          // Catch the reconnect's rejection so a failed retry doesn't surface as
          // an unhandled promise rejection; onclose will schedule the next one.
          setTimeout(() => {
            void this.connect().catch(() => {});
          }, this.reconnectInterval);
        }
      };

      this.ws.onerror = (error): void => {
        this.emit("error", error);
        if (this.ws?.readyState !== WebSocket.OPEN) {
          reject(error);
        }
      };
    });
  }

  on<T = unknown>(event: string, handler: WebSocketEventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    const set = this.handlers.get(event)!;
    set.add(handler as WebSocketEventHandler);
    return () => set.delete(handler as WebSocketEventHandler);
  }

  private emit(event: string, data: unknown): void {
    const set = this.handlers.get(event);
    if (set) {
      for (const handler of set) {
        handler(data);
      }
    }
  }

  private async signDirectoryWriteUrl(wsUrl: string): Promise<string> {
    if (!this.signingKey || !this.directoryAuth) {
      return wsUrl;
    }
    const url = new URL(wsUrl);
    const signedRequestUri = await signDirectoryWriteQuery(
      this.signingKey,
      this.directoryAuth.publicKeyBase64,
      "GET",
      `${url.pathname}${url.search}`,
      "",
    );
    return `${url.origin}${signedRequestUri}`;
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}
