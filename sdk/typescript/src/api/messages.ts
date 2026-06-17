import type { HttpClient } from "../http.js";
import type { MessageCipher } from "../messaging/encryption.js";
import type { MessageEnvelope } from "../types/index.js";

const decoder = new TextDecoder();

let messageIdCounter = 0;
/** Client-generated message id for callers that don't supply one. */
function newMessageId(): string {
  messageIdCounter += 1;
  return `msg_${new Date().getTime()}_${messageIdCounter}`;
}

export class MessagesApi {
  constructor(
    private readonly http: HttpClient,
    /**
     * When set, `send` encrypts and `list` decrypts transparently (Signal E2E).
     * When absent, both are plain relay transport — identical to the legacy
     * behavior. Use `sendRaw` / `listRaw` to bypass encryption either way.
     */
    private readonly cipher?: MessageCipher,
  ) {}

  /**
   * List pending messages. With encryption configured, each envelope is decrypted
   * in place (so `body` is plaintext) and acknowledged — receiving is destructive
   * because the Double Ratchet advances per message, so an un-acked message would
   * fail to decrypt on the next poll. Undecryptable envelopes are acknowledged and
   * skipped rather than wedging the loop. Without encryption this is a plain read.
   */
  async list(
    agentId: string,
    limit?: number,
  ): Promise<{ messages: Array<MessageEnvelope> }> {
    const { messages } = await this.listRaw(agentId, limit);
    if (!this.cipher) {
      return { messages };
    }

    const decrypted: Array<MessageEnvelope> = [];
    // Sequential by design: the ratchet advances per message, so decryption must
    // happen in delivery order — these awaits cannot be parallelized.
    for (const envelope of messages) {
      let plaintext: Uint8Array | undefined;
      try {
        plaintext = await this.cipher.decryptEnvelope(envelope);
      } catch {
        // An envelope we can't decrypt is unreadable regardless; fall through to
        // acknowledge it so it stops coming back on every poll.
      }
      if (plaintext) {
        decrypted.push({ ...envelope, body: decoder.decode(plaintext) });
      }
      try {
        await this.acknowledge(envelope.id, agentId);
      } catch {
        // Best-effort: a failed ack must not abort the rest of the batch.
      }
    }
    return { messages: decrypted };
  }

  /** Raw relay read — never decrypts, never acknowledges. */
  listRaw(
    agentId: string,
    limit?: number,
  ): Promise<{ messages: Array<MessageEnvelope> }> {
    return this.http.getDirectoryAuthAs<{ messages: Array<MessageEnvelope> }>(
      "/messages",
      agentId,
      {
        agentId,
        limit,
      },
    );
  }

  /**
   * Send a message. With encryption configured the `body` is Signal-encrypted
   * before it leaves the process (X3DH on the first message to a peer, then the
   * Double Ratchet); without it, the body is sent as-is.
   */
  async send(envelope: MessageEnvelope): Promise<MessageEnvelope> {
    const outbound = this.cipher
      ? await this.cipher.encryptEnvelope(envelope)
      : envelope;
    return this.sendRaw(outbound);
  }

  /** Raw relay send — never encrypts; the caller owns the envelope body. */
  sendRaw(envelope: MessageEnvelope): Promise<MessageEnvelope> {
    return this.http.putDirectoryAuthAs<MessageEnvelope>(
      "/messages",
      envelope.from,
      {
        ...envelope,
        // The relay requires id/from/to; default the fields a caller may omit
        // (the CLI passes only from/to/body) so every envelope is well-formed.
        id: envelope.id ?? newMessageId(),
        deviceId: envelope.deviceId ?? 1,
        type: envelope.type ?? "CIPHERTEXT",
        timestamp: envelope.timestamp ?? new Date().toISOString(),
      },
    );
  }

  acknowledge(messageId: string, agentId: string): Promise<void> {
    return this.http.deleteDirectoryAuthAs<void>(
      `/messages/${encodeURIComponent(messageId)}?agentId=${encodeURIComponent(agentId)}`,
      agentId,
    );
  }
}
