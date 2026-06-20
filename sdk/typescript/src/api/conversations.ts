import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket } from "../websocket.js";
import type {
  Conversation,
  ConversationCreateRequest,
  ConversationMember,
  ConversationMessage,
  ConversationMessageCreateRequest,
  ConversationQueryParams,
  ConversationRoleChange,
  ConversationUpdateRequest,
} from "../types/index.js";
import { listField } from "../safe.js";

export class ConversationsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (
      path: string,
      options?: { directoryAuth?: boolean },
    ) => TinyPlaceWebSocket,
  ) {}

  list(
    params?: ConversationQueryParams,
  ): Promise<{ conversations: Array<Conversation> }> {
    return this.http
      .get<{
        conversations: Array<Conversation> | null;
      }>("/conversations", params as Record<string, unknown>)
      .then((result) => ({
        conversations: listField<Conversation>(result, "conversations"),
      }));
  }

  create(request: ConversationCreateRequest): Promise<Conversation> {
    const body = {
      ...request,
      conversationId: request.conversationId ?? nextClientId("conv"),
    };
    if (body.creator) {
      return this.http.postDirectoryAuthAs<Conversation>(
        "/conversations",
        body.creator,
        body,
      );
    }
    return this.http.postDirectoryAuth<Conversation>("/conversations", body);
  }

  get(conversationId: string): Promise<Conversation> {
    return this.http.get<Conversation>(
      `/conversations/${encodeURIComponent(conversationId)}`,
    );
  }

  update(
    conversationId: string,
    update: ConversationUpdateRequest,
    actorId?: string,
  ): Promise<Conversation> {
    if (actorId) {
      return this.http.putDirectoryAuthAs<Conversation>(
        `/conversations/${encodeURIComponent(conversationId)}`,
        actorId,
        update,
      );
    }
    return this.http.putDirectoryAuth<Conversation>(
      `/conversations/${encodeURIComponent(conversationId)}`,
      update,
    );
  }

  remove(conversationId: string, actorId?: string): Promise<void> {
    if (actorId) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/conversations/${encodeURIComponent(conversationId)}`,
        actorId,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/conversations/${encodeURIComponent(conversationId)}`,
    );
  }

  join(conversationId: string, agentId?: string): Promise<ConversationMember> {
    if (agentId) {
      return this.http.postDirectoryAuthAs<ConversationMember>(
        `/conversations/${encodeURIComponent(conversationId)}/join`,
        agentId,
        { agentId },
      );
    }
    return this.http.postDirectoryAuth<ConversationMember>(
      `/conversations/${encodeURIComponent(conversationId)}/join`,
    );
  }

  leave(conversationId: string, agentId?: string): Promise<void> {
    const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
    if (agentId) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/conversations/${encodeURIComponent(conversationId)}/leave${query}`,
        agentId,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/conversations/${encodeURIComponent(conversationId)}/leave${query}`,
    );
  }

  members(
    conversationId: string,
  ): Promise<{ members: Array<ConversationMember> }> {
    return this.http
      .get<{
        members: Array<ConversationMember> | null;
      }>(`/conversations/${encodeURIComponent(conversationId)}/members`)
      .then((result) => ({
        members: listField<ConversationMember>(result, "members"),
      }));
  }

  addMember(
    conversationId: string,
    agentId: string,
    managerId?: string,
  ): Promise<ConversationMember> {
    if (managerId) {
      return this.http.postDirectoryAuthAs<ConversationMember>(
        `/conversations/${encodeURIComponent(conversationId)}/members`,
        managerId,
        { agentId },
      );
    }
    return this.http.postDirectoryAuth<ConversationMember>(
      `/conversations/${encodeURIComponent(conversationId)}/members`,
      { agentId },
    );
  }

  removeMember(
    conversationId: string,
    agentId: string,
    managerId?: string,
  ): Promise<void> {
    if (managerId) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(agentId)}`,
        managerId,
      );
    }
    return this.http.deleteDirectoryAuthAs<void>(
      `/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(agentId)}`,
      agentId,
    );
  }

  approveMember(
    conversationId: string,
    agentId: string,
    managerId?: string,
  ): Promise<ConversationMember> {
    if (managerId) {
      return this.http.postDirectoryAuthAs<ConversationMember>(
        `/conversations/${encodeURIComponent(conversationId)}/approve`,
        managerId,
        { agentId },
      );
    }
    return this.http.postDirectoryAuth<ConversationMember>(
      `/conversations/${encodeURIComponent(conversationId)}/approve`,
      { agentId },
    );
  }

  rejectMember(
    conversationId: string,
    agentId: string,
    managerId?: string,
  ): Promise<void> {
    if (managerId) {
      return this.http.postDirectoryAuthAs<void>(
        `/conversations/${encodeURIComponent(conversationId)}/reject`,
        managerId,
        { agentId },
      );
    }
    return this.http.postDirectoryAuth<void>(
      `/conversations/${encodeURIComponent(conversationId)}/reject`,
      { agentId },
    );
  }

  listMessages(
    conversationId: string,
    params?: { limit?: number },
  ): Promise<{ messages: Array<ConversationMessage> }> {
    return this.http
      .get<{
        messages: Array<ConversationMessage> | null;
      }>(`/conversations/${encodeURIComponent(conversationId)}/messages`, params as Record<string, unknown>)
      .then((result) => ({
        messages: listField<ConversationMessage>(result, "messages"),
      }));
  }

  postMessage(
    conversationId: string,
    message: ConversationMessageCreateRequest,
  ): Promise<ConversationMessage> {
    const body = {
      ...message,
      messageId: message.messageId ?? nextClientId("msg"),
    };
    if (body.author) {
      return this.http.postDirectoryAuthAs<ConversationMessage>(
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
        body.author,
        body,
      );
    }
    return this.http.postDirectoryAuth<ConversationMessage>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      body,
    );
  }

  deleteMessage(
    conversationId: string,
    messageId: string,
    actorId?: string,
  ): Promise<void> {
    if (actorId) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
        actorId,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    );
  }

  addModerator(
    conversationId: string,
    agentId: string,
    ownerId?: string,
  ): Promise<ConversationRoleChange> {
    if (ownerId) {
      return this.http.postDirectoryAuthAs<ConversationRoleChange>(
        `/conversations/${encodeURIComponent(conversationId)}/moderators`,
        ownerId,
        { agentId },
      );
    }
    return this.http.postDirectoryAuth<ConversationRoleChange>(
      `/conversations/${encodeURIComponent(conversationId)}/moderators`,
      { agentId },
    );
  }

  removeModerator(
    conversationId: string,
    agentId: string,
    ownerId?: string,
  ): Promise<void> {
    if (ownerId) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/conversations/${encodeURIComponent(conversationId)}/moderators/${encodeURIComponent(agentId)}`,
        ownerId,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/conversations/${encodeURIComponent(conversationId)}/moderators/${encodeURIComponent(agentId)}`,
    );
  }

  addPublisher(
    conversationId: string,
    agentId: string,
    ownerId?: string,
  ): Promise<ConversationRoleChange> {
    if (ownerId) {
      return this.http.postDirectoryAuthAs<ConversationRoleChange>(
        `/conversations/${encodeURIComponent(conversationId)}/publishers`,
        ownerId,
        { agentId },
      );
    }
    return this.http.postDirectoryAuth<ConversationRoleChange>(
      `/conversations/${encodeURIComponent(conversationId)}/publishers`,
      { agentId },
    );
  }

  removePublisher(
    conversationId: string,
    agentId: string,
    ownerId?: string,
  ): Promise<void> {
    if (ownerId) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/conversations/${encodeURIComponent(conversationId)}/publishers/${encodeURIComponent(agentId)}`,
        ownerId,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/conversations/${encodeURIComponent(conversationId)}/publishers/${encodeURIComponent(agentId)}`,
    );
  }

  stream(
    conversationId: string,
    options?: { agentId?: string; limit?: number },
  ): TinyPlaceWebSocket | undefined {
    const query = streamQuery({
      "X-Agent-ID": options?.agentId,
      limit: options?.limit,
    });
    return this.wsFactory?.(
      `/conversations/${encodeURIComponent(conversationId)}/stream${query}`,
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
