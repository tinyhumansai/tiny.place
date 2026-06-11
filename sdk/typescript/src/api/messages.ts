import type { HttpClient } from "../http.js";
import type { MessageEnvelope } from "../types/index.js";

export class MessagesApi {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<Array<MessageEnvelope>> {
    return this.http.getAuth<Array<MessageEnvelope>>("/messages");
  }

  send(envelope: MessageEnvelope): Promise<void> {
    return this.http.putDirectoryAuth<void>("/messages", envelope);
  }

  acknowledge(messageId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(`/messages/${encodeURIComponent(messageId)}`);
  }
}
