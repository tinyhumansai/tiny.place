import type { HttpClient } from "../http.js";
import type { TinyVerseWebSocket } from "../websocket.js";
import type {
  BroadcastChannel,
  BroadcastCreateRequest,
  BroadcastMessage,
  BroadcastQueryParams,
  BroadcastSubscriber,
  Subscription,
} from "../types/index.js";

export class BroadcastsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyVerseWebSocket,
  ) {}

  list(
    params?: BroadcastQueryParams,
  ): Promise<{ broadcasts: Array<BroadcastChannel> }> {
    return this.http.get<{ broadcasts: Array<BroadcastChannel> }>(
      "/broadcasts",
      params as Record<string, unknown>,
    );
  }

  create(request: BroadcastCreateRequest): Promise<BroadcastChannel> {
    return this.http.postDirectoryAuth<BroadcastChannel>("/broadcasts", {
      ...request,
      broadcastId: request.broadcastId ?? nextClientId("bcast"),
    });
  }

  get(broadcastId: string): Promise<BroadcastChannel> {
    return this.http.get<BroadcastChannel>(
      `/broadcasts/${encodeURIComponent(broadcastId)}`,
    );
  }

  update(
    broadcastId: string,
    update: Partial<BroadcastChannel>,
  ): Promise<BroadcastChannel> {
    return this.http.putDirectoryAuth<BroadcastChannel>(
      `/broadcasts/${encodeURIComponent(broadcastId)}`,
      update,
    );
  }

  remove(broadcastId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}`,
    );
  }

  addPublisher(broadcastId: string, agentId: string): Promise<void> {
    return this.http.postDirectoryAuth<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/publishers`,
      { agentId },
    );
  }

  removePublisher(broadcastId: string, agentId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/publishers/${encodeURIComponent(agentId)}`,
    );
  }

  subscribe(broadcastId: string): Promise<Subscription> {
    return this.http.postDirectoryAuth<Subscription>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/subscribe`,
    );
  }

  unsubscribe(broadcastId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/subscribe`,
    );
  }

  subscribers(
    broadcastId: string,
  ): Promise<{ subscribers: Array<BroadcastSubscriber> }> {
    return this.http.getDirectoryAuth<{
      subscribers: Array<BroadcastSubscriber>;
    }>(`/broadcasts/${encodeURIComponent(broadcastId)}/subscribers`);
  }

  removeSubscriber(broadcastId: string, agentId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/subscribers/${encodeURIComponent(agentId)}`,
    );
  }

  listMessages(
    broadcastId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<{ messages: Array<BroadcastMessage> }> {
    return this.http
      .getDirectoryAuth<{
        messages: Array<BroadcastMessage> | null;
      }>(`/broadcasts/${encodeURIComponent(broadcastId)}/messages`, params as Record<string, unknown>)
      .then((result) => ({ messages: result.messages ?? [] }));
  }

  postMessage(
    broadcastId: string,
    message: Partial<BroadcastMessage>,
  ): Promise<BroadcastMessage> {
    return this.http.postDirectoryAuth<BroadcastMessage>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/messages`,
      {
        ...message,
        messageId: message.messageId ?? nextClientId("bmsg"),
      },
    );
  }

  deleteMessage(broadcastId: string, messageId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/messages/${encodeURIComponent(messageId)}`,
    );
  }

  stream(broadcastId: string): TinyVerseWebSocket | undefined {
    return this.wsFactory?.(
      `/broadcasts/${encodeURIComponent(broadcastId)}/stream`,
    );
  }
}

function nextClientId(prefix: string): string {
  const random = new Uint8Array(6);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}
