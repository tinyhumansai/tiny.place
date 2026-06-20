import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket, TinyPlaceWebSocketOptions } from "../websocket.js";
import type {
  InboxClearParams,
  InboxClearResult,
  InboxCounts,
  InboxItem,
  InboxListResult,
  InboxMarkResult,
  InboxQueryParams,
  InboxReadAllResult,
} from "../types/index.js";
import { asNumber, asString, field, listField } from "../safe.js";

export class InboxApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyPlaceWebSocket,
  ) {}

  list(params?: InboxQueryParams, owner?: string): Promise<InboxListResult> {
    if (owner) {
      return this.http
        .getDirectoryAuthAs<InboxListResult>(
          "/inbox",
          owner,
          params as Record<string, unknown>,
        )
        .then(coalesceInboxList);
    }
    return this.http
      .getAgentAuth<InboxListResult>("/inbox", params as Record<string, unknown>)
      .then(coalesceInboxList);
  }

  get(itemId: string, owner?: string): Promise<InboxItem> {
    if (owner) {
      return this.http.getDirectoryAuthAs<InboxItem>(
        `/inbox/${encodeURIComponent(itemId)}`,
        owner,
      );
    }
    return this.http.getAgentAuth<InboxItem>(
      `/inbox/${encodeURIComponent(itemId)}`,
    );
  }

  search(query: string, owner?: string): Promise<{ items: Array<InboxItem> }> {
    if (owner) {
      return this.http
        .getDirectoryAuthAs<{ items: Array<InboxItem> | null }>(
          "/inbox/search",
          owner,
          { q: query },
        )
        .then((result) => ({ items: listField<InboxItem>(result, "items") }));
    }
    return this.http
      .getAgentAuth<{ items: Array<InboxItem> | null }>("/inbox/search", {
        q: query,
      })
      .then((result) => ({ items: listField<InboxItem>(result, "items") }));
  }

  counts(owner?: string): Promise<InboxCounts> {
    if (owner) {
      return this.http.getDirectoryAuthAs<InboxCounts>("/inbox/counts", owner);
    }
    return this.http.getAgentAuth<InboxCounts>("/inbox/counts");
  }

  markRead(itemId: string, owner?: string): Promise<InboxMarkResult> {
    if (owner) {
      return this.http.putDirectoryAuthAs<InboxMarkResult>(
        `/inbox/${encodeURIComponent(itemId)}/read`,
        owner,
        {},
      );
    }
    return this.http.putAgentAuth<InboxMarkResult>(
      `/inbox/${encodeURIComponent(itemId)}/read`,
      {},
    );
  }

  markReadBulk(
    itemIds: Array<string>,
    owner?: string,
  ): Promise<InboxMarkResult> {
    if (owner) {
      return this.http.putDirectoryAuthAs<InboxMarkResult>(
        "/inbox/read",
        owner,
        { itemIds },
      );
    }
    return this.http.putAgentAuth<InboxMarkResult>("/inbox/read", { itemIds });
  }

  markAllRead(
    params?: InboxClearParams,
    owner?: string,
  ): Promise<InboxReadAllResult> {
    if (owner) {
      return this.http.putDirectoryAuthAs<InboxReadAllResult>(
        "/inbox/read-all",
        owner,
        params ?? {},
      );
    }
    return this.http.putAgentAuth<InboxReadAllResult>(
      "/inbox/read-all",
      params ?? {},
    );
  }

  archive(itemId: string, owner?: string): Promise<InboxMarkResult> {
    if (owner) {
      return this.http.putDirectoryAuthAs<InboxMarkResult>(
        `/inbox/${encodeURIComponent(itemId)}/archive`,
        owner,
        {},
      );
    }
    return this.http.putAgentAuth<InboxMarkResult>(
      `/inbox/${encodeURIComponent(itemId)}/archive`,
      {},
    );
  }

  archiveBulk(
    itemIds: Array<string>,
    owner?: string,
  ): Promise<InboxMarkResult> {
    if (owner) {
      return this.http.putDirectoryAuthAs<InboxMarkResult>(
        "/inbox/archive",
        owner,
        { itemIds },
      );
    }
    return this.http.putAgentAuth<InboxMarkResult>("/inbox/archive", {
      itemIds,
    });
  }

  unarchive(itemId: string, owner?: string): Promise<InboxMarkResult> {
    if (owner) {
      return this.http.putDirectoryAuthAs<InboxMarkResult>(
        `/inbox/${encodeURIComponent(itemId)}/unarchive`,
        owner,
        {},
      );
    }
    return this.http.putAgentAuth<InboxMarkResult>(
      `/inbox/${encodeURIComponent(itemId)}/unarchive`,
      {},
    );
  }

  remove(itemId: string, owner?: string): Promise<void> {
    if (owner) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/inbox/${encodeURIComponent(itemId)}`,
        owner,
        {},
      );
    }
    return this.http.deleteAgentAuth<void>(
      `/inbox/${encodeURIComponent(itemId)}`,
      {},
    );
  }

  removeBulk(itemIds: Array<string>, owner?: string): Promise<void> {
    if (owner) {
      return this.http.deleteDirectoryAuthAs<void>("/inbox", owner, { itemIds });
    }
    return this.http.deleteAgentAuth<void>("/inbox", { itemIds });
  }

  clear(params?: InboxClearParams, owner?: string): Promise<InboxClearResult> {
    if (owner) {
      return this.http.deleteDirectoryAuthAs<InboxClearResult>(
        "/inbox/clear",
        owner,
        params ?? {},
      );
    }
    return this.http.deleteAgentAuth<InboxClearResult>(
      "/inbox/clear",
      params ?? {},
    );
  }

  stream(): TinyPlaceWebSocket | undefined {
    return this.wsFactory?.("/inbox/stream");
  }
}

function coalesceInboxList(result: InboxListResult): InboxListResult {
  const cursor = field(result, "cursor");
  return {
    items: listField<InboxItem>(result, "items"),
    ...(typeof cursor === "string" ? { cursor: asString(cursor) } : {}),
    unreadCount: asNumber(field(result, "unreadCount")),
    totalCount: asNumber(field(result, "totalCount")),
  };
}
