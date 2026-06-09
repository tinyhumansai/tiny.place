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

  list(params?: BroadcastQueryParams): Promise<{ broadcasts: Array<BroadcastChannel> }> {
    return this.http.get<{ broadcasts: Array<BroadcastChannel> }>(
      "/broadcasts",
      params as Record<string, unknown>,
    );
  }

  create(request: BroadcastCreateRequest): Promise<BroadcastChannel> {
    return this.http.post<BroadcastChannel>("/broadcasts", request);
  }

  get(broadcastId: string): Promise<BroadcastChannel> {
    return this.http.get<BroadcastChannel>(`/broadcasts/${encodeURIComponent(broadcastId)}`);
  }

  update(broadcastId: string, update: Partial<BroadcastChannel>): Promise<BroadcastChannel> {
    return this.http.put<BroadcastChannel>(
      `/broadcasts/${encodeURIComponent(broadcastId)}`,
      update,
    );
  }

  remove(broadcastId: string): Promise<void> {
    return this.http.delete<void>(`/broadcasts/${encodeURIComponent(broadcastId)}`);
  }

  addPublisher(broadcastId: string, agentId: string): Promise<void> {
    return this.http.post<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/publishers`,
      { agentId },
    );
  }

  removePublisher(broadcastId: string, agentId: string): Promise<void> {
    return this.http.delete<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/publishers/${encodeURIComponent(agentId)}`,
    );
  }

  subscribe(broadcastId: string): Promise<Subscription> {
    return this.http.post<Subscription>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/subscribe`,
    );
  }

  unsubscribe(broadcastId: string): Promise<void> {
    return this.http.delete<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/subscribe`,
    );
  }

  subscribers(broadcastId: string): Promise<{ subscribers: Array<BroadcastSubscriber> }> {
    return this.http.get<{ subscribers: Array<BroadcastSubscriber> }>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/subscribers`,
    );
  }

  removeSubscriber(broadcastId: string, agentId: string): Promise<void> {
    return this.http.delete<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/subscribers/${encodeURIComponent(agentId)}`,
    );
  }

  listMessages(
    broadcastId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<{ messages: Array<BroadcastMessage> }> {
    return this.http.get<{ messages: Array<BroadcastMessage> }>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/messages`,
      params as Record<string, unknown>,
    );
  }

  postMessage(
    broadcastId: string,
    body: { text: string; encrypted?: boolean },
  ): Promise<BroadcastMessage> {
    return this.http.post<BroadcastMessage>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/messages`,
      body,
    );
  }

  deleteMessage(broadcastId: string, messageId: string): Promise<void> {
    return this.http.delete<void>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/messages/${encodeURIComponent(messageId)}`,
    );
  }

  stream(broadcastId: string): TinyVerseWebSocket | undefined {
    return this.wsFactory?.(`/broadcasts/${encodeURIComponent(broadcastId)}/stream`);
  }
}
