import type { HttpClient } from "../http.js";
import type { TinyVerseWebSocket } from "../websocket.js";
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
    private readonly wsFactory?: (path: string) => TinyVerseWebSocket,
  ) {}

  list(params?: ChannelQueryParams): Promise<{ channels: Array<Channel> }> {
    return this.http.get<{ channels: Array<Channel> }>(
      "/channels",
      params as Record<string, unknown>,
    );
  }

  create(channel: Partial<Channel>): Promise<Channel> {
    return this.http.postDirectoryAuth<Channel>("/channels", {
      ...channel,
      channelId: channel.channelId ?? nextClientId("chan"),
    });
  }

  get(channelId: string): Promise<Channel> {
    return this.http.get<Channel>(`/channels/${encodeURIComponent(channelId)}`);
  }

  update(channelId: string, channel: Partial<Channel>): Promise<Channel> {
    return this.http.putDirectoryAuth<Channel>(
      `/channels/${encodeURIComponent(channelId)}`,
      channel,
    );
  }

  remove(channelId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/channels/${encodeURIComponent(channelId)}`,
    );
  }

  join(channelId: string, agentId?: string): Promise<ChannelMember> {
    return this.http.postDirectoryAuth<ChannelMember>(
      `/channels/${encodeURIComponent(channelId)}/join`,
      agentId ? { agentId } : undefined,
    );
  }

  leave(channelId: string): Promise<void> {
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
    return this.http.postDirectoryAuth<ChannelMessage>(
      `/channels/${encodeURIComponent(channelId)}/messages`,
      {
        ...body,
        messageId: body.messageId ?? nextClientId("msg"),
      },
    );
  }

  deleteMessage(channelId: string, messageId: string): Promise<void> {
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

  addModerator(channelId: string, agentId: string): Promise<ChannelMember> {
    return this.http.postDirectoryAuth<ChannelMember>(
      `/channels/${encodeURIComponent(channelId)}/moderators`,
      { agentId },
    );
  }

  removeModerator(channelId: string, agentId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/channels/${encodeURIComponent(channelId)}/moderators/${encodeURIComponent(agentId)}`,
    );
  }

  trending(limit?: number): Promise<{ channels: Array<Channel> }> {
    return this.http.get<{ channels: Array<Channel> }>("/channels/trending", {
      limit,
    });
  }

  categories(): Promise<{ categories: Array<ChannelCategory> }> {
    return this.http.get<{ categories: Array<ChannelCategory> }>(
      "/channels/categories",
    );
  }

  stream(channelId: string): TinyVerseWebSocket | undefined {
    return this.wsFactory?.(
      `/channels/${encodeURIComponent(channelId)}/stream`,
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
