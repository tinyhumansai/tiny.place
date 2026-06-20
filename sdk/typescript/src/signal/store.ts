import type { X25519KeyPair } from "./crypto.js";
import type {
  SenderKeyOwnState,
  SenderKeyReceiverState,
} from "./sender-key.js";

export interface SessionState {
  dhSendKeyPair: X25519KeyPair;
  dhRecvPublicKey: Uint8Array | null;
  rootKey: Uint8Array;
  sendChainKey: Uint8Array | null;
  recvChainKey: Uint8Array | null;
  sendMessageNumber: number;
  recvMessageNumber: number;
  previousChainLength: number;
  skippedKeys: Map<string, Uint8Array>;
}

export interface PreKeyPair {
  keyId: string;
  keyPair: X25519KeyPair;
  signature: Uint8Array;
}

export interface SignedPreKeyPair {
  keyId: string;
  keyPair: X25519KeyPair;
  signature: Uint8Array;
}

/**
 * This client's sending key for a group: the {@link SenderKeyOwnState} plus the
 * membership epoch it belongs to and the members that have already received its
 * distribution (so re-sends don't re-hand-off the key). Persisted as an extension
 * to the 1:1 ratchet state so a group chain survives across processes.
 */
export interface OwnSenderKeyEntry {
  epoch: number;
  state: SenderKeyOwnState;
  distributedTo: Array<string>;
}

export interface SessionStore {
  getIdentityX25519KeyPair(): Promise<X25519KeyPair>;
  getSignedPreKey(keyId: string): Promise<SignedPreKeyPair | null>;
  getActiveSignedPreKey(): Promise<SignedPreKeyPair>;
  storeSignedPreKey(preKey: SignedPreKeyPair): Promise<void>;
  getPreKey(keyId: string): Promise<PreKeyPair | null>;
  removePreKey(keyId: string): Promise<void>;
  storePreKey(preKey: PreKeyPair): Promise<void>;
  getAllPreKeys(): Promise<Array<PreKeyPair>>;
  getSession(address: string): Promise<SessionState | null>;
  storeSession(address: string, session: SessionState): Promise<void>;
  removeSession(address: string): Promise<void>;
}

/**
 * The optional group sender-key capability, modeled as a SEPARATE interface so
 * {@link SessionStore} stays unchanged (a 1:1-only store, or a third-party store
 * with its own sync group methods, keeps conforming). The node FileSessionStore
 * implements both. Use a structural check (`"getOwnSenderKey" in store`) or accept
 * a `GroupSessionStore` where group messaging is required.
 */
export interface GroupSessionStore {
  /** True once a signed pre-key has been generated and stored. */
  hasSignedPreKey(): Promise<boolean>;
  getOwnSenderKey(groupId: string): Promise<OwnSenderKeyEntry | null>;
  setOwnSenderKey(groupId: string, entry: OwnSenderKeyEntry): Promise<void>;
  getReceiverSenderKey(key: string): Promise<SenderKeyReceiverState | null>;
  setReceiverSenderKey(
    key: string,
    state: SenderKeyReceiverState,
  ): Promise<void>;
}

export function skippedKeyId(
  ratchetPublicKey: Uint8Array,
  messageNumber: number,
): string {
  const hex = Array.from(ratchetPublicKey)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex}:${messageNumber}`;
}
