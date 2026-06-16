/**
 * A file-backed Signal {@link SessionStore} for the CLI.
 *
 * The flagship SDK ships an in-memory store (good for one process) and a
 * browser IndexedDB store. The `tinyplace-agent` CLI is process-per-invocation,
 * so the Double Ratchet session state, signed pre-key, and one-time pre-keys
 * must survive between runs or every `message send` would start a brand-new
 * X3DH handshake and every inbound `PREKEY_BUNDLE` would fail to find its
 * one-time pre-key. This persists all of that to a single JSON file under the
 * agent home, sealed `0600` (it contains private key material).
 *
 * The wallet's identity X25519 keypair is NOT persisted here — it is derived
 * deterministically from the Ed25519 seed on each load (via the signer) and
 * injected into the store, mirroring how `MemorySessionStore` takes it in its
 * constructor.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  fromBase64,
  toBase64,
  type LocalSigner,
  type PreKeyPair,
  type SenderKeyOwnState,
  type SenderKeyReceiverState,
  type SessionState,
  type SessionStore,
  type SignedPreKeyPair,
  type X25519KeyPair,
} from "@tinyhumansai/tinyplace";

import type { AgentConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Serialization — Uint8Array → base64, Map → entry array. Mirrors the SDK's
// SessionState / PreKeyPair / SignedPreKeyPair shapes exactly.
// ---------------------------------------------------------------------------

interface SerializedKeyPair {
  publicKey: string;
  privateKey: string;
}

interface SerializedPreKey {
  keyId: string;
  keyPair: SerializedKeyPair;
  signature: string;
}

interface SerializedSession {
  dhSendKeyPair: SerializedKeyPair;
  dhRecvPublicKey: string | null;
  rootKey: string;
  sendChainKey: string | null;
  recvChainKey: string | null;
  sendMessageNumber: number;
  recvMessageNumber: number;
  previousChainLength: number;
  skippedKeys: Array<[string, string]>;
}

/**
 * This client's sending key for a group: the serialized {@link SenderKeyOwnState}
 * plus the membership epoch it belongs to and the set of members that have
 * already received its distribution (so re-sends don't re-hand-off the key). The
 * SDK's SessionStore interface models only 1:1 ratchet state; group sender keys
 * are persisted here as an extension so the chain survives across CLI runs.
 */
interface OwnSenderKeyEntry {
  epoch: number;
  state: SenderKeyOwnState;
  distributedTo: Array<string>;
}

interface SerializedState {
  version: 1;
  signedPreKeys: Record<string, SerializedPreKey>;
  activeSignedPreKeyId: string | null;
  preKeys: Record<string, SerializedPreKey>;
  sessions: Record<string, SerializedSession>;
  /** Own group sending keys, keyed by groupId. */
  senderKeysOwn?: Record<string, OwnSenderKeyEntry>;
  /** Received group sender keys, keyed by `${groupId}|${sender}|${epoch}`. */
  senderKeyReceivers?: Record<string, SenderKeyReceiverState>;
}

export type { OwnSenderKeyEntry };

function serializeKeyPair(keyPair: X25519KeyPair): SerializedKeyPair {
  return {
    publicKey: toBase64(keyPair.publicKey),
    privateKey: toBase64(keyPair.privateKey),
  };
}

function deserializeKeyPair(value: SerializedKeyPair): X25519KeyPair {
  return {
    publicKey: fromBase64(value.publicKey),
    privateKey: fromBase64(value.privateKey),
  };
}

function serializePreKeyPair(
  preKey: PreKeyPair | SignedPreKeyPair,
): SerializedPreKey {
  return {
    keyId: preKey.keyId,
    keyPair: serializeKeyPair(preKey.keyPair),
    signature: toBase64(preKey.signature),
  };
}

function deserializePreKeyPair(value: SerializedPreKey): PreKeyPair {
  return {
    keyId: value.keyId,
    keyPair: deserializeKeyPair(value.keyPair),
    signature: fromBase64(value.signature),
  };
}

function serializeSession(session: SessionState): SerializedSession {
  return {
    dhSendKeyPair: serializeKeyPair(session.dhSendKeyPair),
    dhRecvPublicKey: session.dhRecvPublicKey
      ? toBase64(session.dhRecvPublicKey)
      : null,
    rootKey: toBase64(session.rootKey),
    sendChainKey: session.sendChainKey ? toBase64(session.sendChainKey) : null,
    recvChainKey: session.recvChainKey ? toBase64(session.recvChainKey) : null,
    sendMessageNumber: session.sendMessageNumber,
    recvMessageNumber: session.recvMessageNumber,
    previousChainLength: session.previousChainLength,
    skippedKeys: Array.from(session.skippedKeys.entries()).map(([key, value]) => [
      key,
      toBase64(value),
    ]),
  };
}

function deserializeSession(value: SerializedSession): SessionState {
  return {
    dhSendKeyPair: deserializeKeyPair(value.dhSendKeyPair),
    dhRecvPublicKey: value.dhRecvPublicKey
      ? fromBase64(value.dhRecvPublicKey)
      : null,
    rootKey: fromBase64(value.rootKey),
    sendChainKey: value.sendChainKey ? fromBase64(value.sendChainKey) : null,
    recvChainKey: value.recvChainKey ? fromBase64(value.recvChainKey) : null,
    sendMessageNumber: value.sendMessageNumber,
    recvMessageNumber: value.recvMessageNumber,
    previousChainLength: value.previousChainLength,
    skippedKeys: new Map(
      value.skippedKeys.map(([key, encoded]) => [key, fromBase64(encoded)]),
    ),
  };
}

const EMPTY_STATE: SerializedState = {
  version: 1,
  signedPreKeys: {},
  activeSignedPreKeyId: null,
  preKeys: {},
  sessions: {},
};

/**
 * Persistent SessionStore backed by `<home>/signal-state.json`. All mutating
 * methods update the in-memory snapshot; call {@link persist} to flush. The
 * messaging helpers persist once at the end of each operation so a crash
 * mid-operation never leaves a half-written ratchet on disk.
 */
export class FileSessionStore implements SessionStore {
  private readonly identityKeyPair: X25519KeyPair;
  private readonly path: string;
  private state: SerializedState;

  constructor(identityKeyPair: X25519KeyPair, path: string) {
    this.identityKeyPair = identityKeyPair;
    this.path = path;
    this.state = FileSessionStore.read(path);
  }

  private static read(path: string): SerializedState {
    if (!existsSync(path)) return structuredClone(EMPTY_STATE);
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as SerializedState;
      if (parsed.version !== 1) return structuredClone(EMPTY_STATE);
      return parsed;
    } catch {
      return structuredClone(EMPTY_STATE);
    }
  }

  /** Atomically flush the current state to disk, sealed 0600. */
  persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 });
    renameSync(tmp, this.path);
  }

  async getIdentityX25519KeyPair(): Promise<X25519KeyPair> {
    return this.identityKeyPair;
  }

  async getSignedPreKey(keyId: string): Promise<SignedPreKeyPair | null> {
    const value = this.state.signedPreKeys[keyId];
    return value ? deserializePreKeyPair(value) : null;
  }

  async getActiveSignedPreKey(): Promise<SignedPreKeyPair> {
    const id = this.state.activeSignedPreKeyId;
    const value = id ? this.state.signedPreKeys[id] : undefined;
    if (!value) throw new Error("No active signed pre-key — run `keys publish`");
    return deserializePreKeyPair(value);
  }

  async storeSignedPreKey(preKey: SignedPreKeyPair): Promise<void> {
    this.state.signedPreKeys[preKey.keyId] = serializePreKeyPair(preKey);
    this.state.activeSignedPreKeyId = preKey.keyId;
  }

  async getPreKey(keyId: string): Promise<PreKeyPair | null> {
    const value = this.state.preKeys[keyId];
    return value ? deserializePreKeyPair(value) : null;
  }

  async removePreKey(keyId: string): Promise<void> {
    delete this.state.preKeys[keyId];
  }

  async storePreKey(preKey: PreKeyPair): Promise<void> {
    this.state.preKeys[preKey.keyId] = serializePreKeyPair(preKey);
  }

  async getAllPreKeys(): Promise<Array<PreKeyPair>> {
    return Object.values(this.state.preKeys).map(deserializePreKeyPair);
  }

  async getSession(address: string): Promise<SessionState | null> {
    const value = this.state.sessions[address];
    return value ? deserializeSession(value) : null;
  }

  async storeSession(address: string, session: SessionState): Promise<void> {
    this.state.sessions[address] = serializeSession(session);
  }

  async removeSession(address: string): Promise<void> {
    delete this.state.sessions[address];
  }

  /** True once a signed pre-key has been generated + uploaded (keys published). */
  hasSignedPreKey(): boolean {
    return this.state.activeSignedPreKeyId !== null;
  }

  // -------------------------------------------------------------------------
  // Group sender keys (extension beyond the SDK's SessionStore interface).
  // Pure persistence: callers create/restore/serialize the GroupSenderKey
  // objects and hand the serialized state here.
  // -------------------------------------------------------------------------

  /** This client's sending key for a group, or undefined if none stored yet. */
  getOwnSenderKey(groupId: string): OwnSenderKeyEntry | undefined {
    return this.state.senderKeysOwn?.[groupId];
  }

  /** Stores (or replaces) this client's sending key for a group. */
  setOwnSenderKey(groupId: string, entry: OwnSenderKeyEntry): void {
    this.state.senderKeysOwn ??= {};
    this.state.senderKeysOwn[groupId] = entry;
  }

  /** A received sender key for a (group, sender, epoch), or undefined. */
  getReceiverSenderKey(key: string): SenderKeyReceiverState | undefined {
    return this.state.senderKeyReceivers?.[key];
  }

  /** Stores (or replaces) a received sender key, keyed by `${groupId}|${sender}|${epoch}`. */
  setReceiverSenderKey(key: string, state: SenderKeyReceiverState): void {
    this.state.senderKeyReceivers ??= {};
    this.state.senderKeyReceivers[key] = state;
  }
}

/**
 * Builds a {@link FileSessionStore} for the unlocked wallet: derives the
 * identity X25519 keypair from the signer and points the store at
 * `<home>/signal-state.json`.
 */
export async function loadSessionStore(
  config: AgentConfig,
  signer: LocalSigner,
): Promise<FileSessionStore> {
  const identityKeyPair = await signer.getX25519KeyPair();
  return new FileSessionStore(
    identityKeyPair,
    join(config.home, "signal-state.json"),
  );
}
