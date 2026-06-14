import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket } from "../websocket.js";
import type {
  Channel,
  ChannelCategory,
  ChannelMember,
  ChannelMessage,
  ChannelQueryParams,
} from "../types/index.js";

export class ChannelsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (
      path: string,
      options?: { directoryAuth?: boolean },
    ) => TinyPlaceWebSocket,
  ) {}

  list(params?: ChannelQueryParams): Promise<{ channels: Array<Channel> }> {
    return this.http
      .get<{ channels: Array<Channel> | null }>(
        "/channels",
        params as Record<string, unknown>,
      )
      .then((result) => ({ channels: result.channels ?? [] }));
  }

  create(channel: Partial<Channel>): Promise<Channel> {
    const body = {
      ...channel,
      channelId: channel.channelId ?? nextClientId("chan"),
    };
    if (body.creator) {
      return this.http.postDirectoryAuthAs<Channel>(
        "/channels",
        body.creator,
        body,
      );
    }
    return this.http.postDirectoryAuth<Channel>("/channels", body);
  }

  get(channelId: string): Promise<Channel> {
    return this.http.get<Channel>(`/channels/${encodeURIComponent(channelId)}`);
  }

  update(
    channelId: string,
    channel: Partial<Channel>,
    actor?: string,
  ): Promise<Channel> {
    if (actor) {
      return this.http.putDirectoryAuthAs<Channel>(
        `/channels/${encodeURIComponent(channelId)}`,
        actor,
        channel,
      );
    }
    return this.http.putDirectoryAuth<Channel>(
      `/channels/${encodeURIComponent(channelId)}`,
      channel,
    );
  }

  remove(channelId: string, actor?: string): Promise<void> {
    if (actor) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/channels/${encodeURIComponent(channelId)}`,
        actor,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/channels/${encodeURIComponent(channelId)}`,
    );
  }

  join(channelId: string, agentId?: string): Promise<ChannelMember> {
    if (agentId) {
      return this.http.postDirectoryAuthAs<ChannelMember>(
        `/channels/${encodeURIComponent(channelId)}/join`,
        agentId,
        { agentId },
      );
    }
    return this.http.postDirectoryAuth<ChannelMember>(
      `/channels/${encodeURIComponent(channelId)}/join`,
    );
  }

  leave(channelId: string, agentId?: string): Promise<void> {
    if (agentId) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/channels/${encodeURIComponent(channelId)}/leave`,
        agentId,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/channels/${encodeURIComponent(channelId)}/leave`,
    );
  }

  listMessages(
    channelId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<{ messages: Array<ChannelMessage> }> {
    return this.http
      .get<{
        messages: Array<ChannelMessage> | null;
      }>(`/channels/${encodeURIComponent(channelId)}/messages`, params as Record<string, unknown>)
      .then((result) => ({ messages: result.messages ?? [] }));
  }

  postMessage(
    channelId: string,
    body: Partial<ChannelMessage> & {
      text?: string;
      attachments?: Array<string>;
    },
  ): Promise<ChannelMessage> {
    const message = {
      ...body,
      messageId: body.messageId ?? nextClientId("msg"),
    };
    if (message.author) {
      return this.http.postDirectoryAuthAs<ChannelMessage>(
        `/channels/${encodeURIComponent(channelId)}/messages`,
        message.author,
        message,
      );
    }
    return this.http.postDirectoryAuth<ChannelMessage>(
      `/channels/${encodeURIComponent(channelId)}/messages`,
      message,
    );
  }

  deleteMessage(
    channelId: string,
    messageId: string,
    actor?: string,
  ): Promise<void> {
    if (actor) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
        actor,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    );
  }

  members(channelId: string): Promise<{ members: Array<ChannelMember> }> {
    return this.http.get<{ members: Array<ChannelMember> }>(
      `/channels/${encodeURIComponent(channelId)}/members`,
    );
  }

  moderators(channelId: string): Promise<{ moderators: Array<ChannelMember> }> {
    return this.http.get<{ moderators: Array<ChannelMember> }>(
      `/channels/${encodeURIComponent(channelId)}/moderators`,
    );
  }

  addModerator(
    channelId: string,
    agentId: string,
    actor?: string,
  ): Promise<ChannelMember> {
    if (actor) {
      return this.http.postDirectoryAuthAs<ChannelMember>(
        `/channels/${encodeURIComponent(channelId)}/moderators`,
        actor,
        { agentId },
      );
    }
    return this.http.postDirectoryAuth<ChannelMember>(
      `/channels/${encodeURIComponent(channelId)}/moderators`,
      { agentId },
    );
  }

  removeModerator(
    channelId: string,
    agentId: string,
    actor?: string,
  ): Promise<void> {
    if (actor) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/channels/${encodeURIComponent(channelId)}/moderators/${encodeURIComponent(agentId)}`,
        actor,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/channels/${encodeURIComponent(channelId)}/moderators/${encodeURIComponent(agentId)}`,
    );
  }

  trending(limit?: number): Promise<{ channels: Array<Channel> }> {
    return this.http
      .get<{ channels: Array<Channel> | null }>("/channels/trending", {
        limit,
      })
      .then((result) => ({ channels: result.channels ?? [] }));
  }

  categories(): Promise<{ categories: Array<ChannelCategory> }> {
    return this.http.get<{ categories: Array<ChannelCategory> }>(
      "/channels/categories",
    );
  }

  stream(
    channelId: string,
    options?: { agentId?: string; limit?: number },
  ): TinyPlaceWebSocket | undefined {
    const query = streamQuery({
      "X-Agent-ID": options?.agentId,
      limit: options?.limit,
    });
    return this.wsFactory?.(
      `/channels/${encodeURIComponent(channelId)}/stream${query}`,
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
