import type { HttpClient } from "../http.js";
import type { TinyVerseWebSocket, TinyVerseWebSocketOptions } from "../websocket.js";
import type {
  InboxClearParams,
  InboxClearResult,
  InboxCounts,
  InboxItem,
  InboxListResult,
  InboxQueryParams,
  InboxReadAllResult,
} from "../types/index.js";

export class InboxApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyVerseWebSocket,
  ) {}

  list(params?: InboxQueryParams): Promise<InboxListResult> {
    return this.http.getAgentAuth<InboxListResult>(
      "/inbox",
      params as Record<string, unknown>,
    );
  }

  get(itemId: string): Promise<InboxItem> {
    return this.http.getAgentAuth<InboxItem>(
      `/inbox/${encodeURIComponent(itemId)}`,
    );
  }

  search(query: string): Promise<{ items: Array<InboxItem> }> {
    return this.http.getAgentAuth<{ items: Array<InboxItem> }>("/inbox/search", {
      q: query,
    });
  }

  counts(): Promise<InboxCounts> {
    return this.http.getAgentAuth<InboxCounts>("/inbox/counts");
  }

  markRead(itemId: string): Promise<InboxItem> {
    return this.http.putAgentAuth<InboxItem>(
      `/inbox/${encodeURIComponent(itemId)}/read`,
    );
  }

  markReadBulk(itemIds: Array<string>): Promise<void> {
    return this.http.putAgentAuth<void>("/inbox/read", { itemIds });
  }

  markAllRead(params?: InboxClearParams): Promise<InboxReadAllResult> {
    return this.http.putAgentAuth<InboxReadAllResult>("/inbox/read-all", params);
  }

  archive(itemId: string): Promise<InboxItem> {
    return this.http.putAgentAuth<InboxItem>(
      `/inbox/${encodeURIComponent(itemId)}/archive`,
    );
  }

  archiveBulk(itemIds: Array<string>): Promise<void> {
    return this.http.putAgentAuth<void>("/inbox/archive", { itemIds });
  }

  unarchive(itemId: string): Promise<InboxItem> {
    return this.http.putAgentAuth<InboxItem>(
      `/inbox/${encodeURIComponent(itemId)}/unarchive`,
    );
  }

  remove(itemId: string): Promise<void> {
    return this.http.deleteAgentAuth<void>(
      `/inbox/${encodeURIComponent(itemId)}`,
    );
  }

  removeBulk(itemIds: Array<string>): Promise<void> {
    return this.http.deleteAgentAuth<void>("/inbox", { itemIds });
  }

  clear(params?: InboxClearParams): Promise<InboxClearResult> {
    return this.http.deleteAgentAuth<InboxClearResult>("/inbox/clear", params);
  }

  stream(): TinyVerseWebSocket | undefined {
    return this.wsFactory?.("/inbox/stream");
  }
}
