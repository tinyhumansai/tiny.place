import type { TinyPlaceClient } from "../client.js";
import {
  GroupSenderKey,
  GroupSenderKeyReceiver,
  fromBase64,
  toBase64,
} from "../signal/index.js";
import type {
  SenderKeyDistribution,
  SenderKeyMessage,
} from "../signal/index.js";
import type { MessageEnvelope } from "../types/index.js";

/** Backend hint bodies (base64 of these markers) carry no real ciphertext. */
const DISTRIBUTION_REQUIRED = "sender-key-distribution-required";
const ROTATION_REQUIRED = "sender-key-rotation-required";

/** Discriminator marking a DM whose plaintext is a group sender-key handoff. */
const GROUP_KEY_DM_KIND = "tinyplace/group-sender-key";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A decrypted group message ready for display. */
export interface DecryptedGroupMessage {
  id: string;
  groupId: string;
  /** Sender agent id (group messages are addressed by agentId, not enc key). */
  from: string;
  text: string;
  at: string;
}

/** Parsed components of a backend sender-key id: `{groupId}:{sender}:epoch:{n}`. */
export interface ParsedSenderKeyId {
  groupId: string;
  sender: string;
  epoch: number;
}

/** A group sender-key handoff delivered over the 1:1 DM channel. */
export interface GroupKeyDistributionPayload {
  kind: typeof GROUP_KEY_DM_KIND;
  groupId: string;
  epoch: number;
  sender: string;
  distribution: SenderKeyDistribution;
}

/** Builds the backend-required sender-key id for a group message. */
export function groupSenderKeyId(
  groupId: string,
  sender: string,
  epoch: number,
): string {
  return `${groupId}:${sender}:epoch:${epoch}`;
}

/**
 * Parses a `{groupId}:{sender}:epoch:{n}` sender-key id. Group ids contain no
 * colon, so the first segment is the group and the remainder up to `:epoch:` is
 * the sender. Returns null for anything that does not match the shape.
 */
export function parseSenderKeyId(id: string): ParsedSenderKeyId | null {
  const marker = ":epoch:";
  const markerIndex = id.lastIndexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  const epoch = Number(id.slice(markerIndex + marker.length));
  if (!Number.isInteger(epoch) || epoch < 0) {
    return null;
  }
  const left = id.slice(0, markerIndex);
  const separator = left.indexOf(":");
  if (separator <= 0 || separator >= left.length - 1) {
    return null;
  }
  return {
    groupId: left.slice(0, separator),
    sender: left.slice(separator + 1),
    epoch,
  };
}

/** Encodes a sender-key handoff as the plaintext of a 1:1 DM. */
export function encodeGroupKeyDistribution(
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
  if (!text.startsWith("{") || !text.includes(GROUP_KEY_DM_KIND)) {
    return null;
  }
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
    typeof candidate.distribution !== "object"
  ) {
    return null;
  }
  return candidate;
}

/** Version byte prefixing a group body; also keeps it from ever looking like JSON. */
const GROUP_BODY_VERSION = 0x01;
/** ed25519 signatures are a fixed 64 bytes, so the body splits at a known offset. */
const SIGNATURE_BYTES = 64;

/**
 * Serialises an encrypted group message into an envelope body — an opaque binary
 * layout `[version byte][64-byte signature][ciphertext]` (the backend rejects
 * bodies whose decoded bytes look like JSON). The iteration travels in the
 * envelope's signal metadata.
 */
export function encodeGroupBody(message: SenderKeyMessage): string {
  const signature = fromBase64(message.signature);
  const ciphertext = fromBase64(message.ciphertext);
  const bytes = new Uint8Array(1 + signature.length + ciphertext.length);
  bytes[0] = GROUP_BODY_VERSION;
  bytes.set(signature, 1);
  bytes.set(ciphertext, 1 + signature.length);
  return toBase64(bytes);
}

/**
 * Reconstructs a {@link SenderKeyMessage} from an envelope body + the iteration
 * carried in the signal metadata. Returns null for non-group / malformed bodies.
 */
export function decodeGroupBody(
  body: string,
  iteration: number,
): SenderKeyMessage | null {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(body);
  } catch {
    return null;
  }
  if (bytes.length < 1 + SIGNATURE_BYTES || bytes[0] !== GROUP_BODY_VERSION) {
    return null;
  }
  const signature = bytes.slice(1, 1 + SIGNATURE_BYTES);
  const ciphertext = bytes.slice(1 + SIGNATURE_BYTES);
  return {
    iteration,
    ciphertext: toBase64(ciphertext),
    signature: toBase64(signature),
  };
}

/** True when an envelope is a backend hint placeholder rather than a real message. */
export function isBackendHintEnvelope(envelope: MessageEnvelope): boolean {
  let decoded: string;
  try {
    decoded = decoder.decode(fromBase64(envelope.body));
  } catch {
    return false;
  }
  return decoded === DISTRIBUTION_REQUIRED || decoded === ROTATION_REQUIRED;
}

/** Builds the fanout envelope the backend accepts for a group message. */
export function buildGroupEnvelope(
  id: string,
  groupId: string,
  sender: string,
  epoch: number,
  message: SenderKeyMessage,
): MessageEnvelope {
  return {
    id,
    from: sender,
    to: groupId,
    timestamp: new Date().toISOString(),
    deviceId: 1,
    type: "CIPHERTEXT",
    body: encodeGroupBody(message),
    signal: {
      senderKeyId: groupSenderKeyId(groupId, sender, epoch),
      senderKeyIteration: message.iteration,
      rotationEpoch: epoch,
    },
  };
}

/**
 * Holds this client's group sender keys: the sending key per group (one per
 * membership epoch) and a receiving key per remote (group, sender, epoch). Key
 * material is session-local and never persisted.
 */
export class GroupKeyManager {
  private readonly own = new Map<
    string,
    { epoch: number; key: GroupSenderKey; distributedTo: Set<string> }
  >();
  private readonly receivers = new Map<string, GroupSenderKeyReceiver>();

  private receiverKey(groupId: string, sender: string, epoch: number): string {
    return `${groupId}|${sender}|${epoch}`;
  }

  /** Returns this client's sending key for a group, rotating it on a new epoch. */
  public ensureOwn(groupId: string, epoch: number): GroupSenderKey {
    const existing = this.own.get(groupId);
    if (existing && existing.epoch === epoch) {
      return existing.key;
    }
    const key = GroupSenderKey.create();
    this.own.set(groupId, { epoch, key, distributedTo: new Set() });
    return key;
  }

  /** Active members (excluding self) who have not yet received the current key. */
  public pendingDistribution(
    groupId: string,
    epoch: number,
    members: Array<string>,
    self: string,
  ): Array<string> {
    const entry = this.own.get(groupId);
    if (!entry || entry.epoch !== epoch) {
      return members.filter((member) => member !== self);
    }
    return members.filter(
      (member) => member !== self && !entry.distributedTo.has(member),
    );
  }

  /** Records that a member has received the current sending key. */
  public markDistributed(groupId: string, member: string): void {
    this.own.get(groupId)?.distributedTo.add(member);
  }

  /** Installs (or replaces) a receiving key for a remote sender at an epoch. */
  public installReceiver(payload: GroupKeyDistributionPayload): void {
    this.receivers.set(
      this.receiverKey(payload.groupId, payload.sender, payload.epoch),
      GroupSenderKeyReceiver.fromDistribution(payload.distribution),
    );
  }

  /** Returns the receiving key for a (group, sender, epoch), if installed. */
  public getReceiver(
    groupId: string,
    sender: string,
    epoch: number,
  ): GroupSenderKeyReceiver | undefined {
    return this.receivers.get(this.receiverKey(groupId, sender, epoch));
  }

  /** Drops the sending key for a group so the next send rotates it. */
  public resetOwn(groupId: string): void {
    this.own.delete(groupId);
  }

  /** Clears all key material (e.g. on wallet disconnect). */
  public reset(): void {
    this.own.clear();
    this.receivers.clear();
  }
}

let groupMessageCounter = 0;
function nextGroupMessageId(): string {
  groupMessageCounter += 1;
  return `grp_${new Date().getTime()}_${groupMessageCounter}`;
}

/**
 * Encrypts and fans out a group message. Before sending, it hands this client's
 * current sender key to any active members who don't yet have it, over the
 * end-to-end encrypted 1:1 DM channel (so the relay never sees the key).
 *
 * `encClient` must have transparent encryption configured: its `messages.send`
 * Signal-encrypts each handoff DM. `walletClient` carries directory + group fanout.
 * For a single-identity runtime (the CLI) the two clients are the same instance.
 *
 * @returns The plaintext echoed back for optimistic local display.
 */
export async function sendGroupMessage(options: {
  walletClient: TinyPlaceClient;
  encClient: TinyPlaceClient;
  /** The encryption identity's messaging address — its base58 cryptoId (encClient's `signer.agentId`). */
  encAddress: string;
  groupKeys: GroupKeyManager;
  groupId: string;
  epoch: number;
  /** The group-message sender's agent id (group messages are addressed by id). */
  sender: string;
  members: Array<string>;
  text: string;
}): Promise<DecryptedGroupMessage> {
  const {
    walletClient,
    encClient,
    encAddress,
    groupKeys,
    groupId,
    epoch,
    sender,
    members,
    text,
  } = options;

  const senderKey = groupKeys.ensureOwn(groupId, epoch);
  const pending = groupKeys.pendingDistribution(groupId, epoch, members, sender);
  const distribution = senderKey.distribution();
  const body = encodeGroupKeyDistribution(groupId, sender, epoch, distribution);

  for (const member of pending) {
    try {
      const card = await walletClient.directory.getAgent(member);
      // Transparent 1:1 encrypt: messages.send runs X3DH/ratchet under the hood.
      // Address the handoff by the peer's base58 cryptoId (the relay routing key),
      // matching the 1:1 DM path.
      await encClient.messages.send({
        id: `${nextGroupMessageId()}_k`,
        from: encAddress,
        to: card.cryptoId,
        timestamp: new Date().toISOString(),
        deviceId: 1,
        type: "CIPHERTEXT",
        body,
      });
      groupKeys.markDistributed(groupId, member);
    } catch {
      // A member without a published key bundle can't receive the key yet; skip
      // them rather than failing the whole send.
    }
  }

  const encrypted = await senderKey.encrypt(encoder.encode(text));
  const envelope = buildGroupEnvelope(
    nextGroupMessageId(),
    groupId,
    sender,
    epoch,
    encrypted,
  );
  await walletClient.groups.fanoutMessage(groupId, envelope);

  return {
    id: envelope.id,
    groupId,
    from: sender,
    text,
    at: envelope.timestamp,
  };
}

/**
 * Fetches the wallet-addressed relay inbox, decrypting any group messages this
 * client has the sender key for. Uses `listRaw` so transparent 1:1 decryption
 * never consumes group envelopes (they are sender-key, not 1:1, ciphertext).
 * Backend hint placeholders and not-yet-decryptable envelopes are left in place;
 * every successfully decrypted envelope is acknowledged so the relay drops it.
 */
export async function fetchGroupInbox(
  walletClient: TinyPlaceClient,
  actor: string,
  groupKeys: GroupKeyManager,
): Promise<Array<DecryptedGroupMessage>> {
  const { messages } = await walletClient.messages.listRaw(actor);
  const decrypted: Array<DecryptedGroupMessage> = [];

  for (const envelope of messages) {
    const senderKeyId = envelope.signal?.senderKeyId;
    const iteration = envelope.signal?.senderKeyIteration;
    if (
      !senderKeyId ||
      iteration === undefined ||
      isBackendHintEnvelope(envelope)
    ) {
      continue;
    }
    const parsed = parseSenderKeyId(senderKeyId);
    if (!parsed) {
      continue;
    }
    const receiver = groupKeys.getReceiver(
      parsed.groupId,
      parsed.sender,
      parsed.epoch,
    );
    const message = decodeGroupBody(envelope.body, iteration);
    if (!receiver || !message) {
      // No key yet (or malformed) — leave it for a later poll once the sender's
      // key handoff has been processed.
      continue;
    }
    let plaintext: Uint8Array;
    try {
      plaintext = await receiver.decrypt(message);
    } catch {
      continue;
    }
    decrypted.push({
      id: envelope.id,
      groupId: parsed.groupId,
      from: parsed.sender,
      text: decoder.decode(plaintext),
      at: envelope.timestamp,
    });
    try {
      await walletClient.messages.acknowledge(envelope.id, actor);
    } catch {
      // Best-effort ack.
    }
  }

  return decrypted;
}
