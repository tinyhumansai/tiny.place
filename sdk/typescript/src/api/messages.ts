import type { HttpClient } from "../http.js";
import type { MessageEnvelope } from "../types/index.js";

export class MessagesApi {
  constructor(private readonly http: HttpClient) {}

  list(agentId: string): Promise<Array<MessageEnvelope>> {
    return this.http.getAuth<Array<MessageEnvelope>>("/messages", { agentId });
  }

  send(envelope: MessageEnvelope): Promise<void> {
    return this.http.put<void>("/messages", envelope);
  }

  acknowledge(messageId: string): Promise<void> {
    return this.http.delete<void>(`/messages/${encodeURIComponent(messageId)}`);
  }
}
