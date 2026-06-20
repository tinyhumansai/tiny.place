import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket } from "../websocket.js";
import type {
  BroadcastChannel,
  BroadcastCreateRequest,
  BroadcastMessage,
  BroadcastQueryParams,
  BroadcastSubscribeRequest,
  BroadcastSubscriber,
} from "../types/index.js";
import { listField } from "../safe.js";

export class BroadcastsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (
      path: string,
      options?: { directoryAuth?: boolean },
    ) => TinyPlaceWebSocket,
  ) {}

  list(
    params?: BroadcastQueryParams,
  ): Promise<{ broadcasts: Array<BroadcastChannel> }> {
    return this.http
      .get<{ broadcasts: Array<BroadcastChannel> | null }>(
        "/broadcasts",
        params as Record<string, unknown>,
      )
      .then((result) => ({
        broadcasts: listField<BroadcastChannel>(result, "broadcasts"),
      }));
  }

  create(request: BroadcastCreateRequest): Promise<BroadcastChannel> {
    const body = {
      ...request,
      broadcastId: request.broadcastId ?? nextClientId("bcast"),
    };
    if (request.owner) {
      return this.http.postDirectoryAuthAs<BroadcastChannel>(
        "/broadcasts",
        request.owner,
        body,
      );
    }
    return this.http.postDirectoryAuth<BroadcastChannel>("/broadcasts", body);
  }

  get(broadcastId: string): Promise<BroadcastChannel> {
    return this.http.get<BroadcastChannel>(
      `/broadcasts/${encodeURIComponent(broadcastId)}`,
    );
  }

  update(
    broadcastId: string,
    update: Partial<BroadcastChannel>,
    actor?: string,
  ): Promise<BroadcastChannel> {
    if (actor) {
      return this.http.putDirectoryAuthAs<BroadcastChannel>(
        `/broadcasts/${encodeURIComponent(broadcastId)}`,
        actor,
        update,
      );
    }
    return this.http.putDirectoryAuth<BroadcastChannel>(
      `/broadcasts/${encodeURIComponent(broadcastId)}`,
      update,
    );
  }

  remove(broadcastId: string, actor?: string): Promise<void> {
    if (actor) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/broadcasts/${encodeURIComponent(broadcastId)}`,
        actor,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}`,
    );
  }

  addPublisher(
    broadcastId: string,
    agentId: string,
    actor?: string,
  ): Promise<void> {
    if (actor) {
      return this.http.postDirectoryAuthAs<void>(
        `/broadcasts/${encodeURIComponent(broadcastId)}/publishers`,
        actor,
        { agentId },
      );
    }
    return this.http.postDirectoryAuth<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/publishers`,
      { agentId },
    );
  }

  removePublisher(
    broadcastId: string,
    agentId: string,
    actor?: string,
  ): Promise<void> {
    if (actor) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/broadcasts/${encodeURIComponent(broadcastId)}/publishers/${encodeURIComponent(agentId)}`,
        actor,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/publishers/${encodeURIComponent(agentId)}`,
    );
  }

  subscribe(
    broadcastId: string,
    request?: BroadcastSubscribeRequest | string,
  ): Promise<BroadcastSubscriber> {
    const body =
      typeof request === "string" ? { agentId: request } : (request ?? {});
    if (body.agentId) {
      return this.http.postDirectoryAuthAs<BroadcastSubscriber>(
        `/broadcasts/${encodeURIComponent(broadcastId)}/subscribe`,
        body.agentId,
        body,
      );
    }
    return this.http.postDirectoryAuth<BroadcastSubscriber>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/subscribe`,
      body,
    );
  }

  unsubscribe(broadcastId: string, agentId?: string): Promise<void> {
    if (agentId) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/broadcasts/${encodeURIComponent(broadcastId)}/subscribe`,
        agentId,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/subscribe`,
    );
  }

  subscribers(
    broadcastId: string,
    actor?: string,
  ): Promise<{ subscribers: Array<BroadcastSubscriber> }> {
    const request = actor
      ? this.http.getDirectoryAuthAs<{
          subscribers: Array<BroadcastSubscriber> | null;
        }>(`/broadcasts/${encodeURIComponent(broadcastId)}/subscribers`, actor)
      : this.http.getDirectoryAuth<{
          subscribers: Array<BroadcastSubscriber> | null;
        }>(`/broadcasts/${encodeURIComponent(broadcastId)}/subscribers`);
    return request.then((result) => ({
      subscribers: listField<BroadcastSubscriber>(result, "subscribers"),
    }));
  }

  removeSubscriber(
    broadcastId: string,
    agentId: string,
    actor?: string,
  ): Promise<void> {
    if (actor) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/broadcasts/${encodeURIComponent(broadcastId)}/subscribers/${encodeURIComponent(agentId)}`,
        actor,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/subscribers/${encodeURIComponent(agentId)}`,
    );
  }

  listMessages(
    broadcastId: string,
    params?: {
      agentId?: string;
      limit?: number;
      offset?: number;
      paymentAuthorization?: string;
    },
  ): Promise<{ messages: Array<BroadcastMessage> }> {
    const { agentId, paymentAuthorization, ...query } = params ?? {};
    const headers = paymentAuthorization
      ? { "X-Payment-Authorization": paymentAuthorization }
      : undefined;
    if (agentId) {
      return this.http
        .getDirectoryAuthAs<{
          messages: Array<BroadcastMessage> | null;
        }>(
          `/broadcasts/${encodeURIComponent(broadcastId)}/messages`,
          agentId,
          query as Record<string, unknown>,
          headers,
        )
        .then((result) => ({
          messages: listField<BroadcastMessage>(result, "messages"),
        }));
    }
    return this.http
      .getDirectoryAuth<{
        messages: Array<BroadcastMessage> | null;
      }>(
        `/broadcasts/${encodeURIComponent(broadcastId)}/messages`,
        query as Record<string, unknown>,
        headers,
      )
      .then((result) => ({ messages: result.messages ?? [] }));
  }

  postMessage(
    broadcastId: string,
    message: Partial<BroadcastMessage>,
  ): Promise<BroadcastMessage> {
    const body = {
      ...message,
      messageId: message.messageId ?? nextClientId("bmsg"),
    };
    if (body.publisher) {
      return this.http.postDirectoryAuthAs<BroadcastMessage>(
        `/broadcasts/${encodeURIComponent(broadcastId)}/messages`,
        body.publisher,
        body,
      );
    }
    return this.http.postDirectoryAuth<BroadcastMessage>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/messages`,
      body,
    );
  }

  deleteMessage(
    broadcastId: string,
    messageId: string,
    actor?: string,
  ): Promise<void> {
    if (actor) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/broadcasts/${encodeURIComponent(broadcastId)}/messages/${encodeURIComponent(messageId)}`,
        actor,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/messages/${encodeURIComponent(messageId)}`,
    );
  }

  stream(
    broadcastId: string,
    options?: {
      agentId?: string;
      limit?: number;
      paymentAuthorization?: string;
    },
  ): TinyPlaceWebSocket | undefined {
    const query = streamQuery({
      "X-Agent-ID": options?.agentId,
      limit: options?.limit,
      paymentAuthorization: options?.paymentAuthorization,
    });
    return this.wsFactory?.(
      `/broadcasts/${encodeURIComponent(broadcastId)}/stream${query}`,
      options?.agentId ? { directoryAuth: true } : undefined,
    );
  }
}

function streamQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function nextClientId(prefix: string): string {
  const random = new Uint8Array(6);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}
