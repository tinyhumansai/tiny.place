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

import type { AgentConfig } from "./config.js";
import {
  installGroupKeyHandoff,
  parseGroupKeyDistribution,
} from "./group-messaging.js";
import { type FileSessionStore, loadSessionStore } from "./signal-store.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Agent-card metadata key under which an agent advertises its Signal encryption
 * public key. Mirrors the web app's `encryption-discovery.ts` so the CLI
 * addresses messages to the same key the web app would.
 */
const ENCRYPTION_PUBLIC_KEY_METADATA = "encryptionPublicKey";

function randomId(prefix: string): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${prefix}-${Date.now().toString(36)}-${suffix}`;
}

/**
 * Looks like a raw base64 Ed25519 public key. A base64-encoded 32-byte key is
 * always 44 chars ending in a single `=` pad. We require that trailing pad so a
 * base58 cryptoId/agentId — which is also ~44 chars of [A-Za-z0-9] but never
 * contains `+`, `/`, or `=` — is NOT misread as a raw key (that misread sent the
 * bundle fetch to `/keys/<cryptoId>/bundle`, which 404s instead of resolving the
 * recipient's card to its advertised encryption key).
 */
export function isPublicKey(value: string): boolean {
  return /^[A-Za-z0-9+/]{43}=$/.test(value);
}

/**
 * Looks like a base58 cryptoId / agentId: 32-44 base58 chars (the Solana address
 * alphabet, no 0/O/I/l). A registered @handle ("iris") is short and may also use
 * those characters, so this length-bounded check is what tells a bare cryptoId
 * apart from a bare handle — the former is looked up directly, the latter is
 * normalized + resolved.
 */
function isCryptoId(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

/** Picks the messaging address from a card: advertised encryption key, else the card's own key. */
function cardEncryptionAddress(
  advertised: unknown,
  publicKey: string | undefined,
  identityKey: string | undefined,
  recipient: string,
): string {
  const address =
    (typeof advertised === "string" && advertised.length > 0
      ? advertised
      : undefined) ??
    publicKey ??
    identityKey;
  if (!address) {
    throw new Error(
      `could not resolve ${recipient} to an encryption public key`,
    );
  }
  return address;
}

/**
 * Resolves a recipient to the base64 encryption public key to address messages +
 * bundles to. Accepts three forms:
 *   - a raw base64 key — used as-is;
 *   - a base58 cryptoId/agentId — looked up directly via `directory.getAgent`;
 *   - a handle, with or without a leading `@` (e.g. `iris` or `@iris`) — a bare
 *     name is normalized to `@iris` and resolved via `directory.resolve`.
 * For the directory paths it mirrors the web app's `resolveEncryptionAddress`:
 * prefer the card's advertised encryption key, then the card's own public key
 * (single-key agents, like this CLI), then the identity key. This is what lets
 * the CLI message web-app users that run a distinct encryption identity.
 */
export async function resolveRecipientKey(
  client: TinyPlaceClient,
  recipient: string,
): Promise<string> {
  if (isPublicKey(recipient)) return recipient;

  // A bare base58 cryptoId/agentId is fetched directly; anything else is a
  // handle (a bare name like "iris" is normalized to "@iris") and resolved.
  if (!recipient.startsWith("@") && isCryptoId(recipient)) {
    const card = await client.directory.getAgent(recipient);
    return cardEncryptionAddress(
      card.metadata?.[ENCRYPTION_PUBLIC_KEY_METADATA],
      card.publicKey,
      undefined,
      recipient,
    );
  }

  const handle = recipient.startsWith("@") ? recipient : `@${recipient}`;
  const resolved = await client.directory.resolve(handle);
  return cardEncryptionAddress(
    resolved.agent?.metadata?.[ENCRYPTION_PUBLIC_KEY_METADATA],
    resolved.agent?.publicKey,
    resolved.identity?.publicKey,
    handle,
  );
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

  // Unique ids per publish (not a fixed spk_1 / start=1): re-publishing then ADDS
  // fresh pre-keys instead of colliding with the relay's existing ids (409) and
  // orphaning them. The local store keeps a private for whatever the relay
  // advertises — exactly what X3DH on the sender side needs. Mirrors the web app.
  const now = Date.now();
  const signedPreKey = await generateSignedPreKey(signer, `spk_${now}`);
  const preKeys = await generatePreKeys(signer, now, count);

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
  const hasSession = await session.hasSession(recipientPub);
  let bundle;
  if (!hasSession) {
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

  // Persist the advanced ratchet BEFORE sending: if the send fails the recipient
  // simply sees a skipped message number (tolerated by the ratchet), whereas a
  // sent-but-unpersisted message would reuse a message key on the next send.
  store.persist();

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

  return { id, to: recipientPub, type: encrypted.type };
}

export interface ReadMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: string;
  error?: string;
  /** Set for non-chat control DMs (e.g. an installed group sender-key handoff). */
  control?: string;
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

  // Sequential by design: the Double Ratchet advances per message, so decryption
  // must happen in delivery order — these awaits cannot be parallelized.
  const results: Array<ReadMessage> = [];
  for (const envelope of messages ?? []) {
    const senderEd25519 = fromBase64(envelope.from);
    const senderX25519 = ed25519PubToX25519Pub(senderEd25519);
    let plaintext: Uint8Array;
    try {
      plaintext = await session.decrypt(envelope.from, senderX25519, envelope);
    } catch (error) {
      results.push({
        id: envelope.id,
        from: envelope.from,
        timestamp: envelope.timestamp,
        type: envelope.type,
        error: error instanceof Error ? error.message : String(error),
      });
      // An undecryptable envelope is unreadable regardless; ack it to drop it
      // from the relay and avoid an unbounded re-fetch loop on every read.
      // Trade-off (same as the web app): we discard a message we could never
      // have read. Skipped when --no-ack so a human can inspect it.
      if (ack) {
        try {
          await client.messages.acknowledge(envelope.id, myPub);
        } catch {
          /* best effort */
        }
      }
      continue;
    }

    // A group sender-key handoff rides the 1:1 channel: detect it, install the
    // receiving chain (so `group read` can decrypt that sender's messages), and
    // surface it as a control item rather than a chat message.
    const text = decoder.decode(plaintext);
    const handoff = parseGroupKeyDistribution(text);
    if (handoff) {
      installGroupKeyHandoff(store, handoff);
    }

    // Persist the advanced ratchet (and any installed handoff) BEFORE acking: the
    // ratchet has moved forward, so the state must be durable before the message
    // is dropped from the relay — otherwise a crash between ack and persist would
    // desync the ratchet.
    store.persist();
    results.push({
      id: envelope.id,
      from: envelope.from,
      timestamp: envelope.timestamp,
      type: envelope.type,
      ...(handoff ? { control: `group-key:${handoff.groupId}` } : { text }),
    });
    // Acknowledge separately: the message is already decrypted + persisted, so an
    // ack failure must not be reported as a decrypt failure.
    if (ack) {
      try {
        await client.messages.acknowledge(envelope.id, myPub);
      } catch {
        /* leave it; next run re-acks */
      }
    }
  }

  return results;
}

export { loadSessionStore };
