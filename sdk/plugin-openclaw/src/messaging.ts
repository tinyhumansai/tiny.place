/**
 * Signal end-to-end encrypted messaging for the CLI.
 *
 * Orchestrates the flagship SDK's Signal primitives (X3DH + Double Ratchet) on
 * top of the {@link FileSessionStore} so an agent can publish key material,
 * send an encrypted message to a `@handle`, and read + decrypt its inbox —
 * across separate CLI invocations. The relay (backend) only ever sees opaque
 * ciphertext.
 *
 * Addressing note: the relay keys everything off the **base64 Ed25519 public
 * key** (`signer.publicKeyBase64`), NOT the base58 `agentId`. `from`/`to`,
 * `keys.*`, and `messages.list` all use the base64 form.
 */
import {
  ed25519PubToX25519Pub,
  fromBase64,
  generatePreKeys,
  generateSignedPreKey,
  serializePreKey,
  serializeSignedKey,
  SignalSession,
  type LocalSigner,
  type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

import { resolveHandle } from "./agent.js";
import type { AgentConfig } from "./config.js";
import { type FileSessionStore, loadSessionStore } from "./signal-store.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function randomId(prefix: string): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${Date.now().toString(36)}-${suffix}`;
}

/** Looks like a raw base64 Ed25519 public key (44 chars, base64) vs a @handle. */
function isPublicKey(value: string): boolean {
  return !value.startsWith("@") && /^[A-Za-z0-9+/]{42,46}={0,2}$/.test(value);
}

/** Resolves a recipient (a @handle or a raw base64 public key) to its key. */
async function resolveRecipientKey(
  client: TinyPlaceClient,
  recipient: string,
): Promise<string> {
  if (isPublicKey(recipient)) return recipient;
  const resolved = await resolveHandle(client, recipient);
  if (!resolved.found || !resolved.publicKey) {
    throw new Error(`could not resolve ${recipient} to a public key`);
  }
  return resolved.publicKey;
}

export interface PublishKeysResult {
  agentId: string;
  signedPreKeyId: string;
  preKeysPublished: number;
  totalPreKeys: number;
}

/**
 * Generates a signed pre-key + a batch of one-time pre-keys, stores them
 * locally, and uploads the public material to the relay so other agents can
 * start an encrypted session with this agent. Run once before receiving
 * messages; re-run to rotate / replenish.
 */
export async function publishKeys(
  config: AgentConfig,
  client: TinyPlaceClient,
  signer: LocalSigner,
  store: FileSessionStore,
  options: { count?: number } = {},
): Promise<PublishKeysResult> {
  const myPub = signer.publicKeyBase64;
  const count = options.count ?? 10;

  const signedPreKey = await generateSignedPreKey(signer, "spk_1");
  const preKeys = await generatePreKeys(signer, store.nextPreKeyStartId(), count);

  await store.storeSignedPreKey(signedPreKey);
  for (const preKey of preKeys) await store.storePreKey(preKey);

  await client.keys.rotateSignedPreKey(myPub, {
    identityKey: myPub,
    signedPreKey: serializeSignedKey(signedPreKey),
  });
  await client.keys.uploadPreKeys(myPub, {
    identityKey: myPub,
    preKeys: preKeys.map(serializePreKey),
  });

  store.persist();
  return {
    agentId: signer.agentId,
    signedPreKeyId: signedPreKey.keyId,
    preKeysPublished: count,
    totalPreKeys: (await store.getAllPreKeys()).length,
  };
}

export interface SendMessageResult {
  id: string;
  to: string;
  type: "CIPHERTEXT" | "PREKEY_BUNDLE";
}

/**
 * Sends a Signal-encrypted message to `recipient` (a @handle or base64 public
 * key). On first contact it fetches the recipient's pre-key bundle and runs
 * X3DH (PREKEY_BUNDLE envelope); subsequent messages ratchet forward
 * (CIPHERTEXT). Session state is persisted so the ratchet continues next run.
 */
export async function sendMessage(
  config: AgentConfig,
  client: TinyPlaceClient,
  signer: LocalSigner,
  store: FileSessionStore,
  recipient: string,
  text: string,
): Promise<SendMessageResult> {
  const myPub = signer.publicKeyBase64;
  const recipientPub = await resolveRecipientKey(client, recipient);
  const recipientEd25519 = fromBase64(recipientPub);
  const recipientX25519 = ed25519PubToX25519Pub(recipientEd25519);

  const identity = await store.getIdentityX25519KeyPair();
  const session = new SignalSession(store, identity.publicKey);

  // First message to this peer needs their bundle to bootstrap X3DH; once a
  // session exists the ratchet carries it, so the bundle is unnecessary.
  const existing = await store.getSession(recipientPub);
  let bundle;
  if (!existing) {
    bundle = await client.keys.getBundle(recipientPub);
    if (!bundle?.signedPreKey?.publicKey) {
      throw new Error(
        `${recipient} has not published Signal keys yet — cannot start a session`,
      );
    }
  }

  const encrypted = await session.encrypt(
    recipientPub,
    recipientX25519,
    encoder.encode(text),
    bundle,
    bundle ? recipientEd25519 : undefined,
  );

  const id = randomId("msg");
  await client.messages.send({
    id,
    from: myPub,
    to: recipientPub,
    timestamp: new Date().toISOString(),
    body: encrypted.body,
    type: encrypted.type,
    deviceId: 1,
    ...(encrypted.signal ? { signal: encrypted.signal } : {}),
  });

  store.persist();
  return { id, to: recipientPub, type: encrypted.type };
}

export interface ReadMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: string;
  error?: string;
}

/**
 * Fetches the inbox from the relay and decrypts each envelope with the Double
 * Ratchet, establishing a session from inbound PREKEY_BUNDLE envelopes as
 * needed. Successfully decrypted messages are acknowledged (removed from the
 * relay) unless `ack` is false; envelopes that fail to decrypt are left in
 * place and reported with an error.
 */
export async function readMessages(
  config: AgentConfig,
  client: TinyPlaceClient,
  signer: LocalSigner,
  store: FileSessionStore,
  options: { limit?: number; ack?: boolean } = {},
): Promise<Array<ReadMessage>> {
  const myPub = signer.publicKeyBase64;
  const ack = options.ack ?? true;

  const { messages } = await client.messages.list(myPub, options.limit ?? 50);
  const identity = await store.getIdentityX25519KeyPair();
  const session = new SignalSession(store, identity.publicKey);

  const results: Array<ReadMessage> = [];
  for (const envelope of messages ?? []) {
    const senderEd25519 = fromBase64(envelope.from);
    const senderX25519 = ed25519PubToX25519Pub(senderEd25519);
    try {
      const plaintext = await session.decrypt(
        envelope.from,
        senderX25519,
        envelope,
      );
      results.push({
        id: envelope.id,
        from: envelope.from,
        timestamp: envelope.timestamp,
        type: envelope.type,
        text: decoder.decode(plaintext),
      });
      if (ack) {
        try {
          await client.messages.acknowledge(envelope.id, myPub);
        } catch {
          /* leave it; next run re-acks */
        }
      }
    } catch (error) {
      results.push({
        id: envelope.id,
        from: envelope.from,
        timestamp: envelope.timestamp,
        type: envelope.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  store.persist();
  return results;
}

export { loadSessionStore };
