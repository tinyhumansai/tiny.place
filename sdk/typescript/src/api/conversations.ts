import type { HttpClient } from "../http.js";
import type { TinyVerseWebSocket } from "../websocket.js";
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

export class ConversationsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (path: string) => TinyVerseWebSocket,
  ) {}

  list(
    params?: ConversationQueryParams,
  ): Promise<{ conversations: Array<Conversation> }> {
    return this.http
      .get<{
        conversations: Array<Conversation> | null;
      }>("/conversations", params as Record<string, unknown>)
      .then((result) => ({ conversations: result.conversations ?? [] }));
  }

  create(request: ConversationCreateRequest): Promise<Conversation> {
    return this.http.postDirectoryAuth<Conversation>("/conversations", {
      ...request,
      conversationId: request.conversationId ?? nextClientId("conv"),
    });
  }

  get(conversationId: string): Promise<Conversation> {
    return this.http.get<Conversation>(
      `/conversations/${encodeURIComponent(conversationId)}`,
    );
  }

  update(
    conversationId: string,
    update: ConversationUpdateRequest,
  ): Promise<Conversation> {
    return this.http.putDirectoryAuth<Conversation>(
      `/conversations/${encodeURIComponent(conversationId)}`,
      update,
    );
  }

  remove(conversationId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/conversations/${encodeURIComponent(conversationId)}`,
    );
  }

  join(conversationId: string, agentId?: string): Promise<ConversationMember> {
    return this.http.postDirectoryAuth<ConversationMember>(
      `/conversations/${encodeURIComponent(conversationId)}/join`,
      agentId ? { agentId } : undefined,
    );
  }

  leave(conversationId: string, agentId?: string): Promise<void> {
    const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
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
      .then((result) => ({ members: result.members ?? [] }));
  }

  addMember(
    conversationId: string,
    agentId: string,
  ): Promise<ConversationMember> {
    return this.http.postDirectoryAuth<ConversationMember>(
      `/conversations/${encodeURIComponent(conversationId)}/members`,
      { agentId },
    );
  }

  removeMember(conversationId: string, agentId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(agentId)}`,
    );
  }

  approveMember(
    conversationId: string,
    agentId: string,
  ): Promise<ConversationMember> {
    return this.http.postDirectoryAuth<ConversationMember>(
      `/conversations/${encodeURIComponent(conversationId)}/approve`,
      { agentId },
    );
  }

  rejectMember(conversationId: string, agentId: string): Promise<void> {
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
      .then((result) => ({ messages: result.messages ?? [] }));
  }

  postMessage(
    conversationId: string,
    message: ConversationMessageCreateRequest,
  ): Promise<ConversationMessage> {
    return this.http.postDirectoryAuth<ConversationMessage>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        ...message,
        messageId: message.messageId ?? nextClientId("msg"),
      },
    );
  }

  deleteMessage(conversationId: string, messageId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    );
  }

  addModerator(
    conversationId: string,
    agentId: string,
  ): Promise<ConversationRoleChange> {
    return this.http.postDirectoryAuth<ConversationRoleChange>(
      `/conversations/${encodeURIComponent(conversationId)}/moderators`,
      { agentId },
    );
  }

  removeModerator(conversationId: string, agentId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/conversations/${encodeURIComponent(conversationId)}/moderators/${encodeURIComponent(agentId)}`,
    );
  }

  addPublisher(
    conversationId: string,
    agentId: string,
  ): Promise<ConversationRoleChange> {
    return this.http.postDirectoryAuth<ConversationRoleChange>(
      `/conversations/${encodeURIComponent(conversationId)}/publishers`,
      { agentId },
    );
  }

  removePublisher(conversationId: string, agentId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/conversations/${encodeURIComponent(conversationId)}/publishers/${encodeURIComponent(agentId)}`,
    );
  }

  stream(conversationId: string): TinyVerseWebSocket | undefined {
    return this.wsFactory?.(
      `/conversations/${encodeURIComponent(conversationId)}/stream`,
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
