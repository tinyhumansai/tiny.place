/**
 * Signal Sender-Key encrypted group messaging for the CLI.
 *
 * Groups use the Signal **Sender Key** protocol: each sender holds one symmetric
 * chain key per (group, membership epoch), ratcheted once per message and signed
 * with an ed25519 key so receivers can attribute it. The sender hands its key to
 * each member over the end-to-end encrypted **1:1 DM** channel (so the relay
 * never sees it), then fans the ciphertext out through the group relay.
 *
 * This mirrors the web app's `common/group-messaging.ts` orchestration exactly —
 * the same sender-key-id format, opaque body layout, and handoff payload — so a
 * CLI agent and a web user interoperate. The one difference: the web app keeps
 * sender keys in memory (one browser session), whereas this CLI is
 * process-per-invocation, so the sending chain, the distributed-to set, and each
 * received chain are persisted in the {@link FileSessionStore} and survive runs.
 *
 * Addressing: group messages are keyed off the **agentId** (cryptoId), not the
 * base64 encryption key that 1:1 messaging uses — fanout delivers to each
 * member's agentId inbox, and `sender` in the sender-key id is the agentId. The
 * key handoff, being a 1:1 DM, is addressed to the member's encryption key.
 */
import {
  fromBase64,
  GroupSenderKey,
  GroupSenderKeyReceiver,
  toBase64,
  type LocalSigner,
  type MessageEnvelope,
  type SenderKeyDistribution,
  type SenderKeyMessage,
  type TinyPlaceClient,
} from "@tinyhumansai/tinyplace";

import type { AgentConfig } from "./config.js";
import { sendMessage } from "./messaging.js";
import type { FileSessionStore } from "./signal-store.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Discriminator marking a DM whose plaintext is a group sender-key handoff. */
const GROUP_KEY_DM_KIND = "tinyplace/group-sender-key";
/** Backend hint bodies (base64 of these markers) carry no real ciphertext. */
const DISTRIBUTION_REQUIRED = "sender-key-distribution-required";
const ROTATION_REQUIRED = "sender-key-rotation-required";
/** Version byte prefixing a group body; also keeps it from looking like JSON. */
const GROUP_BODY_VERSION = 0x01;
/** ed25519 signatures are a fixed 64 bytes, so the body splits at a known offset. */
const SIGNATURE_BYTES = 64;

/** A group sender-key handoff delivered over the 1:1 DM channel. */
export interface GroupKeyDistributionPayload {
  kind: typeof GROUP_KEY_DM_KIND;
  groupId: string;
  epoch: number;
  sender: string;
  distribution: SenderKeyDistribution;
}

export interface ParsedSenderKeyId {
  groupId: string;
  sender: string;
  epoch: number;
}

/** Builds the backend-required sender-key id: `{groupId}:{sender}:epoch:{n}`. */
export function groupSenderKeyId(groupId: string, sender: string, epoch: number): string {
  return `${groupId}:${sender}:epoch:${epoch}`;
}

/** The store key under which a received sender key is persisted. */
function receiverKey(groupId: string, sender: string, epoch: number): string {
  return `${groupId}|${sender}|${epoch}`;
}

/**
 * Parses a `{groupId}:{sender}:epoch:{n}` sender-key id. Group ids contain no
 * colon, so the first segment is the group and the remainder up to `:epoch:` is
 * the sender. Returns null for anything that does not match the shape.
 */
export function parseSenderKeyId(id: string): ParsedSenderKeyId | null {
  const marker = ":epoch:";
  const markerIndex = id.lastIndexOf(marker);
  if (markerIndex < 0) return null;
  const epoch = Number(id.slice(markerIndex + marker.length));
  if (!Number.isInteger(epoch) || epoch < 0) return null;
  const left = id.slice(0, markerIndex);
  const separator = left.indexOf(":");
  if (separator <= 0 || separator >= left.length - 1) return null;
  return {
    groupId: left.slice(0, separator),
    sender: left.slice(separator + 1),
    epoch,
  };
}

/** Encodes a sender-key handoff as the plaintext of a 1:1 DM. */
function encodeGroupKeyDistribution(
  groupId: string,
  sender: string,
  epoch: number,
  distribution: SenderKeyDistribution,
): string {
  const payload: GroupKeyDistributionPayload = {
    kind: GROUP_KEY_DM_KIND,
    groupId,
    epoch,
    sender,
    distribution,
  };
  return JSON.stringify(payload);
}

/** Parses a DM plaintext into a group sender-key handoff, or null if it isn't one. */
export function parseGroupKeyDistribution(
  text: string,
): GroupKeyDistributionPayload | null {
  if (!text.startsWith("{") || !text.includes(GROUP_KEY_DM_KIND)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { kind?: unknown }).kind !== GROUP_KEY_DM_KIND
  ) {
    return null;
  }
  const candidate = parsed as GroupKeyDistributionPayload;
  if (
    typeof candidate.groupId !== "string" ||
    typeof candidate.sender !== "string" ||
    typeof candidate.epoch !== "number" ||
    !isValidSenderKeyDistribution(candidate.distribution)
  ) {
    return null;
  }
  return candidate;
}

/**
 * Validates a {@link SenderKeyDistribution} payload before it is fed to
 * `GroupSenderKeyReceiver.fromDistribution` (which base64-decodes `chainKey` /
 * `signaturePublicKey` and would throw on a malformed handoff). Requires a
 * non-empty base64 `chainKey`, a finite numeric `iteration`, and a non-empty
 * base64 `signaturePublicKey`; anything else is treated as not a handoff.
 */
function isValidSenderKeyDistribution(
  distribution: unknown,
): distribution is SenderKeyDistribution {
  if (typeof distribution !== "object" || distribution === null) return false;
  const candidate = distribution as Record<string, unknown>;
  return (
    typeof candidate["chainKey"] === "string" &&
    candidate["chainKey"].length > 0 &&
    typeof candidate["iteration"] === "number" &&
    Number.isFinite(candidate["iteration"]) &&
    typeof candidate["signaturePublicKey"] === "string" &&
    candidate["signaturePublicKey"].length > 0
  );
}

/**
 * Installs a received sender-key handoff into the store (persists the receiving
 * chain so future group messages from that sender decrypt). Called by the 1:1
 * inbox reader when it decrypts a handoff DM. Does not flush — the caller
 * persists once for the whole operation.
 */
export function installGroupKeyHandoff(
  store: FileSessionStore,
  payload: GroupKeyDistributionPayload,
): void {
  const receiver = GroupSenderKeyReceiver.fromDistribution(payload.distribution);
  store.setReceiverSenderKey(
    receiverKey(payload.groupId, payload.sender, payload.epoch),
    receiver.serialize(),
  );
}

/** Serialises an encrypted group message into an opaque envelope body. */
export function encodeGroupBody(message: SenderKeyMessage): string {
  const signature = fromBase64(message.signature);
  const ciphertext = fromBase64(message.ciphertext);
  const bytes = new Uint8Array(1 + signature.length + ciphertext.length);
  bytes[0] = GROUP_BODY_VERSION;
  bytes.set(signature, 1);
  bytes.set(ciphertext, 1 + signature.length);
  return toBase64(bytes);
}

/** Reconstructs a {@link SenderKeyMessage} from a body + the iteration metadata. */
export function decodeGroupBody(body: string, iteration: number): SenderKeyMessage | null {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(body);
  } catch {
    return null;
  }
  if (bytes.length < 1 + SIGNATURE_BYTES || bytes[0] !== GROUP_BODY_VERSION) {
    return null;
  }
  return {
    iteration,
    ciphertext: toBase64(bytes.slice(1 + SIGNATURE_BYTES)),
    signature: toBase64(bytes.slice(1, 1 + SIGNATURE_BYTES)),
  };
}

/** True when an envelope is a backend hint placeholder rather than a real message. */
function isBackendHintEnvelope(body: string): boolean {
  let decoded: string;
  try {
    decoded = decoder.decode(fromBase64(body));
  } catch {
    return false;
  }
  return decoded === DISTRIBUTION_REQUIRED || decoded === ROTATION_REQUIRED;
}

/**
 * Resolves a group member's agentId to its base64 encryption public key.
 * A member with no directory card (the lookup throws / 404s) is treated as
 * "no encryption key yet" (returns `undefined`) so a single missing card does
 * not abort the whole group send — the caller skips that member instead.
 */
async function memberEncryptionKey(
  client: TinyPlaceClient,
  agentId: string,
): Promise<string | undefined> {
  let card: { publicKey?: string; metadata?: Record<string, unknown> } | null;
  try {
    card = (await client.directory.getAgent(agentId)) as {
      publicKey?: string;
      metadata?: Record<string, unknown>;
    } | null;
  } catch {
    return undefined;
  }
  const advertised = card?.metadata?.["encryptionPublicKey"];
  return (
    (typeof advertised === "string" && advertised.length > 0 ? advertised : undefined) ??
    card?.publicKey
  );
}

export interface SendGroupMessageResult {
  id: string;
  groupId: string;
  epoch: number;
  iteration: number;
  /** Members the sender key was handed off to on this send. */
  distributedTo: Array<string>;
  /** Members skipped because they have no published encryption keys yet. */
  skipped: Array<string>;
  recipients: number;
}

/**
 * Encrypts and fans out a group message. Before fanning out, hands this client's
 * current sender key to any active members who don't yet have it, over the
 * encrypted 1:1 DM channel. The sending chain + distributed-to set are persisted
 * so the next run continues the same chain (and re-hands only to new members).
 */
export async function sendGroupMessage(
  config: AgentConfig,
  client: TinyPlaceClient,
  signer: LocalSigner,
  store: FileSessionStore,
  groupId: string,
  text: string,
): Promise<SendGroupMessageResult> {
  const sender = signer.agentId;
  const group = await client.groups.get(groupId);
  const epoch = group.membershipEpoch;

  const { members } = await client.groups.members(groupId);
  const activeMembers = (members ?? [])
    .filter((member) => member.status === "active")
    .map((member) => member.agentId);

  // Restore (or create) this client's sending key for the current epoch. A new
  // epoch (membership change) means a fresh key + empty distributed-to set.
  const existing = store.getOwnSenderKey(groupId);
  const senderKey =
    existing && existing.epoch === epoch
      ? GroupSenderKey.restore(existing.state)
      : GroupSenderKey.create();
  const distributedTo = new Set<string>(
    existing && existing.epoch === epoch ? existing.distributedTo : [],
  );

  // Hand the key to members who don't have it yet, over encrypted 1:1 DM.
  const distribution = senderKey.distribution();
  const handoff = encodeGroupKeyDistribution(groupId, sender, epoch, distribution);
  const skipped: Array<string> = [];
  const newlyDistributed: Array<string> = [];
  for (const member of activeMembers) {
    if (member === sender || distributedTo.has(member)) continue;
    const encryptionKey = await memberEncryptionKey(client, member);
    if (!encryptionKey) {
      skipped.push(member);
      continue;
    }
    try {
      await sendMessage(config, client, signer, store, encryptionKey, handoff);
      distributedTo.add(member);
      newlyDistributed.push(member);
    } catch {
      // Member has no published key bundle (DM encryption not enabled) — skip
      // rather than failing the whole send; they'll get the key on a later send.
      skipped.push(member);
    }
  }

  // Encrypt the actual message and fan it out via the group relay.
  const encrypted = await senderKey.encrypt(encoder.encode(text));
  const id = `grp_${Date.now().toString(36)}`;
  const envelope: MessageEnvelope = {
    id,
    from: sender,
    to: groupId,
    timestamp: new Date().toISOString(),
    deviceId: 1,
    type: "CIPHERTEXT",
    body: encodeGroupBody(encrypted),
    signal: {
      senderKeyId: groupSenderKeyId(groupId, sender, epoch),
      senderKeyIteration: encrypted.iteration,
      rotationEpoch: epoch,
    },
  };

  // Persist the advanced sending chain BEFORE fanout: if fanout fails the
  // members just see a skipped iteration (tolerated), whereas a sent-but-
  // unpersisted message would reuse a chain key on the next send.
  store.setOwnSenderKey(groupId, {
    epoch,
    state: senderKey.serialize(),
    distributedTo: Array.from(distributedTo),
  });
  store.persist();

  await client.groups.fanoutMessage(groupId, envelope);

  return {
    id,
    groupId,
    epoch,
    iteration: encrypted.iteration,
    distributedTo: newlyDistributed,
    skipped,
    recipients: activeMembers.filter((member) => member !== sender).length,
  };
}

export interface GroupInboxMessage {
  id: string;
  groupId: string;
  from: string;
  timestamp: string;
  text?: string;
  /** Set when the message could not be decrypted yet (handoff not received). */
  pending?: boolean;
  error?: string;
}

/**
 * Fetches the agentId-addressed relay inbox and decrypts fanned-out group
 * messages this client holds a sender key for. Messages whose sender-key handoff
 * has not yet been processed (run `message read` first) are reported `pending`
 * and left in the relay for a later read. Backend hint placeholders are skipped;
 * decrypted (and undecryptable) messages are acknowledged unless `ack` is false.
 */
export async function readGroupMessages(
  config: AgentConfig,
  client: TinyPlaceClient,
  signer: LocalSigner,
  store: FileSessionStore,
  options: { limit?: number; ack?: boolean; groupId?: string } = {},
): Promise<Array<GroupInboxMessage>> {
  const actor = signer.agentId;
  const ack = options.ack ?? true;
  const { messages } = await client.messages.list(actor, options.limit ?? 50);

  const results: Array<GroupInboxMessage> = [];
  // Sequential: each sender's chain advances per message, so a sender's messages
  // must decrypt in delivery order.
  for (const envelope of messages ?? []) {
    const senderKeyId = envelope.signal?.senderKeyId;
    const iteration = envelope.signal?.senderKeyIteration;
    if (!senderKeyId || iteration === undefined || isBackendHintEnvelope(envelope.body)) {
      continue;
    }
    const parsed = parseSenderKeyId(senderKeyId);
    if (!parsed) continue;
    if (options.groupId && parsed.groupId !== options.groupId) continue;

    const state = store.getReceiverSenderKey(
      receiverKey(parsed.groupId, parsed.sender, parsed.epoch),
    );
    const message = decodeGroupBody(envelope.body, iteration);
    if (!state || !message) {
      // No key yet (handoff not processed) or malformed — leave it in the relay.
      results.push({
        id: envelope.id,
        groupId: parsed.groupId,
        from: parsed.sender,
        timestamp: envelope.timestamp,
        pending: true,
      });
      continue;
    }

    const receiver = GroupSenderKeyReceiver.restore(state);
    try {
      const plaintext = await receiver.decrypt(message);
      // Persist the advanced receiving chain BEFORE acking, so a crash between
      // ack and persist can't desync it.
      store.setReceiverSenderKey(
        receiverKey(parsed.groupId, parsed.sender, parsed.epoch),
        receiver.serialize(),
      );
      store.persist();
      results.push({
        id: envelope.id,
        groupId: parsed.groupId,
        from: parsed.sender,
        timestamp: envelope.timestamp,
        text: decoder.decode(plaintext),
      });
    } catch (error) {
      results.push({
        id: envelope.id,
        groupId: parsed.groupId,
        from: parsed.sender,
        timestamp: envelope.timestamp,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (ack) {
      try {
        await client.messages.acknowledge(envelope.id, actor);
      } catch {
        /* best effort */
      }
    }
  }

  return results;
}
