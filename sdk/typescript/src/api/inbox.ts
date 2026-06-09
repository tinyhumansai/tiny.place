import type { HttpClient } from "../http.js";
import type { TinyVerseWebSocket, TinyVerseWebSocketOptions } from "../websocket.js";
import type {
  InboxCounts,
  InboxItem,
  InboxListResult,
  InboxQueryParams,
} from "../types/index.js";

export class InboxApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyVerseWebSocket,
  ) {}

  list(params?: InboxQueryParams): Promise<InboxListResult> {
    return this.http.getAuth<InboxListResult>("/inbox", params as Record<string, unknown>);
  }

  get(itemId: string): Promise<InboxItem> {
    return this.http.getAuth<InboxItem>(`/inbox/${encodeURIComponent(itemId)}`);
  }

  search(query: string): Promise<{ items: Array<InboxItem> }> {
    return this.http.getAuth<{ items: Array<InboxItem> }>("/inbox/search", { q: query });
  }

  counts(): Promise<InboxCounts> {
    return this.http.getAuth<InboxCounts>("/inbox/counts");
  }

  markRead(itemId: string): Promise<InboxItem> {
    return this.http.put<InboxItem>(`/inbox/${encodeURIComponent(itemId)}/read`);
  }

  markReadBulk(itemIds: Array<string>): Promise<void> {
    return this.http.put<void>("/inbox/read", { itemIds });
  }

  markAllRead(): Promise<void> {
    return this.http.put<void>("/inbox/read-all");
  }

  archive(itemId: string): Promise<InboxItem> {
    return this.http.put<InboxItem>(`/inbox/${encodeURIComponent(itemId)}/archive`);
  }

  archiveBulk(itemIds: Array<string>): Promise<void> {
    return this.http.put<void>("/inbox/archive", { itemIds });
  }

  unarchive(itemId: string): Promise<InboxItem> {
    return this.http.put<InboxItem>(`/inbox/${encodeURIComponent(itemId)}/unarchive`);
  }

  remove(itemId: string): Promise<void> {
    return this.http.delete<void>(`/inbox/${encodeURIComponent(itemId)}`);
  }

  removeBulk(itemIds: Array<string>): Promise<void> {
    return this.http.delete<void>("/inbox", { itemIds });
  }

  clear(params?: { status?: string; type?: string }): Promise<void> {
    return this.http.delete<void>("/inbox/clear");
  }

  stream(): TinyVerseWebSocket | undefined {
    return this.wsFactory?.("/inbox/stream");
  }
}
