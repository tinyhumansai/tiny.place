import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fromBase64, toBase64 } from "../signal/index.js";
import type {
  OwnSenderKeyEntry,
  PreKeyPair,
  SenderKeyReceiverState,
  SessionState,
  SessionStore,
  SignedPreKeyPair,
  X25519KeyPair,
} from "../signal/index.js";

// On-disk shapes: every Uint8Array becomes base64, the skipped-key Map becomes an
// array of entries, so the whole store is plain JSON.
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
interface PersistShape {
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

function emptyState(): PersistShape {
  return {
    version: 1,
    signedPreKeys: {},
    activeSignedPreKeyId: null,
    preKeys: {},
    sessions: {},
  };
}

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

function serializePreKey(
  preKey: PreKeyPair | SignedPreKeyPair,
): SerializedPreKey {
  return {
    keyId: preKey.keyId,
    keyPair: serializeKeyPair(preKey.keyPair),
    signature: toBase64(preKey.signature),
  };
}
function deserializePreKey(value: SerializedPreKey): SignedPreKeyPair {
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
    skippedKeys: [...session.skippedKeys.entries()].map(([key, value]) => [
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

/**
 * Filesystem-backed {@link SessionStore} for Node runtimes (e.g. the `tinyplace`
 * CLI). All ratchet/pre-key state for one identity lives in a single JSON file
 * (mode 0600); the long-term X25519 identity itself is derived from the wallet
 * seed and supplied at construction, never written to disk by the store. The whole
 * file is read once and rewritten on each mutation — fine for a single-process CLI.
 */
export class FileSessionStore implements SessionStore {
  private cache?: PersistShape;

  constructor(
    private readonly filePath: string,
    private readonly identityKeyPair: X25519KeyPair,
  ) {}

  /** Default per-identity path under the tinyplace config dir. */
  static defaultPath(ownerId: string, configDir?: string): string {
    const dir = configDir ?? join(homedir(), ".tinyplace", "signal");
    const safe = ownerId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
    return join(dir, `${safe || "default"}.json`);
  }

  async getIdentityX25519KeyPair(): Promise<X25519KeyPair> {
    return this.identityKeyPair;
  }

  async getSignedPreKey(keyId: string): Promise<SignedPreKeyPair | null> {
    const state = await this.load();
    const value = state.signedPreKeys[keyId];
    return value ? deserializePreKey(value) : null;
  }

  async getActiveSignedPreKey(): Promise<SignedPreKeyPair> {
    const state = await this.load();
    const id = state.activeSignedPreKeyId;
    const value = id ? state.signedPreKeys[id] : undefined;
    if (!value) {
      throw new Error("No active signed pre-key — publish a key bundle first");
    }
    return deserializePreKey(value);
  }

  async storeSignedPreKey(preKey: SignedPreKeyPair): Promise<void> {
    const state = await this.load();
    state.signedPreKeys[preKey.keyId] = serializePreKey(preKey);
    state.activeSignedPreKeyId = preKey.keyId;
    await this.flush();
  }

  async getPreKey(keyId: string): Promise<PreKeyPair | null> {
    const state = await this.load();
    const value = state.preKeys[keyId];
    return value ? deserializePreKey(value) : null;
  }

  async removePreKey(keyId: string): Promise<void> {
    const state = await this.load();
    delete state.preKeys[keyId];
    await this.flush();
  }

  async storePreKey(preKey: PreKeyPair): Promise<void> {
    const state = await this.load();
    state.preKeys[preKey.keyId] = serializePreKey(preKey);
    await this.flush();
  }

  async getAllPreKeys(): Promise<Array<PreKeyPair>> {
    const state = await this.load();
    return Object.values(state.preKeys).map(deserializePreKey);
  }

  async getSession(address: string): Promise<SessionState | null> {
    const state = await this.load();
    const value = state.sessions[address];
    return value ? deserializeSession(value) : null;
  }

  async storeSession(address: string, session: SessionState): Promise<void> {
    const state = await this.load();
    state.sessions[address] = serializeSession(session);
    await this.flush();
  }

  async removeSession(address: string): Promise<void> {
    const state = await this.load();
    delete state.sessions[address];
    await this.flush();
  }

  /** True once a signed pre-key has been generated and stored (keys published). */
  async hasSignedPreKey(): Promise<boolean> {
    const state = await this.load();
    return state.activeSignedPreKeyId !== null;
  }

  // Group sender keys — pure persistence of the already-serialized state objects.
  // Callers (the group messaging layer) own the GroupSenderKey crypto; this just
  // keeps the chain durable across processes. Each setter auto-flushes like the
  // 1:1 methods, so the chain is on disk before a send/ack proceeds.

  /** This client's sending key for a group, or null if none stored yet. */
  async getOwnSenderKey(groupId: string): Promise<OwnSenderKeyEntry | null> {
    const state = await this.load();
    return state.senderKeysOwn?.[groupId] ?? null;
  }

  /** Stores (or replaces) this client's sending key for a group. */
  async setOwnSenderKey(
    groupId: string,
    entry: OwnSenderKeyEntry,
  ): Promise<void> {
    const state = await this.load();
    (state.senderKeysOwn ??= {})[groupId] = entry;
    await this.flush();
  }

  /** A received sender key for a `${groupId}|${sender}|${epoch}`, or null. */
  async getReceiverSenderKey(
    key: string,
  ): Promise<SenderKeyReceiverState | null> {
    const state = await this.load();
    return state.senderKeyReceivers?.[key] ?? null;
  }

  /** Stores (or replaces) a received sender key. */
  async setReceiverSenderKey(
    key: string,
    receiverState: SenderKeyReceiverState,
  ): Promise<void> {
    const state = await this.load();
    (state.senderKeyReceivers ??= {})[key] = receiverState;
    await this.flush();
  }

  /**
   * No-op compatibility hook. Every mutation auto-flushes, so there is nothing to
   * flush on demand; provided so callers written against the OpenClaw store's
   * explicit `persist()` keep working unchanged.
   */
  persist(): void {
    /* state is already durable after each mutation */
  }

  private async load(): Promise<PersistShape> {
    if (!this.cache) {
      try {
        const parsed = JSON.parse(
          await readFile(this.filePath, "utf8"),
        ) as Partial<PersistShape>;
        // Version-tolerant: merge over defaults so a file written by an older
        // build (no group fields / no version) loads without wiping live state.
        this.cache = { ...emptyState(), ...parsed, version: 1 };
      } catch (error) {
        if ((error as { code?: string }).code === "ENOENT") {
          this.cache = emptyState();
        } else {
          throw error;
        }
      }
    }
    return this.cache;
  }

  private async flush(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.cache), { mode: 0o600 });
  }
}
