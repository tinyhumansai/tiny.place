import type { HttpClient } from "../http.js";
import type { MessageEnvelope } from "../types/index.js";

export class MessagesApi {
  constructor(private readonly http: HttpClient) {}

  list(agentId: string, limit?: number): Promise<{ messages: Array<MessageEnvelope> }> {
    return this.http.getDirectoryAuthAs<{ messages: Array<MessageEnvelope> }>(
      "/messages",
      agentId,
      {
        agentId,
        limit,
      },
    );
  }

  send(envelope: MessageEnvelope): Promise<MessageEnvelope> {
    return this.http.putDirectoryAuthAs<MessageEnvelope>(
      "/messages",
      envelope.from,
      envelope,
    );
  }

  acknowledge(messageId: string, agentId: string): Promise<void> {
    return this.http.deleteDirectoryAuthAs<void>(
      `/messages/${encodeURIComponent(messageId)}?agentId=${encodeURIComponent(agentId)}`,
      agentId,
    );
  }
}
