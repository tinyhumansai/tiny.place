/**
 * Signal end-to-end messaging facade.
 *
 * Built on the client's transparent encryption: when the `TinyPlaceClient` is
 * constructed with `encryption: { store }` and a signer, `client.messages.send`
 * encrypts and `client.messages.list` decrypts + acknowledges automatically
 * (X3DH on first contact, then the Double Ratchet — all inside the SDK). These
 * functions only add address resolution (@handle | cryptoId | messaging key) and
 * a flat JSON shape, so an agent never touches Signal internals.
 *
 * Addressing note: the relay keys everything off the **base58 cryptoId**
 * (`signer.agentId`) — the same identifier the Rust SDK uses. A base64 messaging
 * key is accepted as input but normalized to its cryptoId (both encode one key).
 */
import type { TinyPlaceClient } from "../client.js";
import { publicKeyToSolanaAddress } from "../crypto.js";
import { fromBase64 } from "../signal/index.js";
import type { EnvelopeType, MessageEnvelope } from "../types/index.js";
import { normalizeHandle } from "./handles.js";
import type { AgentSigner } from "./types.js";

/**
 * Looks like a raw base64 Ed25519 public key: 43 base64 chars plus one `=` pad.
 * The trailing pad distinguishes it from a base58 cryptoId (also ~44 chars, but
 * never containing `+`, `/`, or `=`), so a cryptoId is not misread as a key.
 */
const MESSAGING_KEY = /^[A-Za-z0-9+/]{43}=$/;

/** Looks like a base58 cryptoId / agentId (the Solana address alphabet). */
const CRYPTO_ID = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** True when `value` is a raw base64 messaging key (vs a @handle or cryptoId). */
export function isMessagingKey(value: string): boolean {
  return MESSAGING_KEY.test(value);
}

/**
 * Resolves a recipient to the base58 cryptoId to address a message to — the relay
 * routing key. Accepts three forms: a base58 cryptoId/agentId (used as-is), a raw
 * base64 messaging key (normalized to its cryptoId — both encode the same 32-byte
 * Ed25519 key), or a @handle (resolved to its cryptoId via the directory).
 */
export async function resolveRecipientKey(
  client: TinyPlaceClient,
  recipient: string,
): Promise<string> {
  if (isMessagingKey(recipient)) {
    return publicKeyToSolanaAddress(fromBase64(recipient));
  }

  if (!recipient.startsWith("@") && CRYPTO_ID.test(recipient)) {
    return recipient;
  }

  const handle = normalizeHandle(recipient);
  const resolved = await client.directory.resolve(handle);
  const cryptoId = resolved.agent?.cryptoId ?? resolved.identity?.cryptoId;
  if (!cryptoId) {
    throw new Error(`could not resolve ${recipient} to a cryptoId`);
  }
  return cryptoId;
}

export interface PublishKeysResult {
  address: string;
  preKeysPublished: number;
}

/**
 * Publishes this identity's Signal key bundle (a signed pre-key + one-time
 * pre-keys) so peers can open an encrypted session. Run once before receiving
 * messages; re-run to replenish. Requires the client to have been built with
 * encryption configured.
 */
export async function publishKeys(
  client: TinyPlaceClient,
  signer: AgentSigner,
  options: { count?: number } = {},
): Promise<PublishKeysResult> {
  const count = options.count ?? 10;
  await client.enableEncryption({ preKeyCount: count });
  return { address: signer.agentId, preKeysPublished: count };
}

export interface SendMessageResult {
  id: string;
  to: string;
  type: EnvelopeType;
}

/**
 * Sends a message to `recipient` (a @handle, cryptoId, or base64 key). The body
 * is Signal-encrypted by the client before it leaves the process when encryption
 * is configured (the recommended setup); otherwise it is sent as plaintext.
 */
export async function sendMessage(
  client: TinyPlaceClient,
  signer: AgentSigner,
  recipient: string,
  text: string,
): Promise<SendMessageResult> {
  const to = await resolveRecipientKey(client, recipient);
  const envelope: MessageEnvelope = {
    id: messageId(),
    from: signer.agentId,
    to,
    timestamp: new Date().toISOString(),
    deviceId: 1,
    type: "CIPHERTEXT",
    body: text,
  };
  const sent = await client.messages.send(envelope);
  return { id: sent.id, to, type: sent.type };
}

export interface ReadMessage {
  id: string;
  from: string;
  timestamp: string;
  type: EnvelopeType;
  text: string;
}

/**
 * Reads and decrypts the inbox. With encryption configured, `client.messages.list`
 * decrypts each envelope and acknowledges it (receiving is destructive because the
 * ratchet advances per message), so this returns plaintext `text` and the relay is
 * left empty. Undecryptable envelopes are dropped by the client.
 */
export async function readMessages(
  client: TinyPlaceClient,
  signer: AgentSigner,
  options: { limit?: number } = {},
): Promise<Array<ReadMessage>> {
  const { messages } = await client.messages.list(
    signer.agentId,
    options.limit ?? 50,
  );
  return messages.map((message) => ({
    id: message.id,
    from: message.from,
    timestamp: message.timestamp,
    type: message.type,
    text: message.body,
  }));
}

function messageId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `msg-${suffix}`;
}
