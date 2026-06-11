import type { X25519KeyPair } from "./crypto.js";

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

export function skippedKeyId(
  ratchetPublicKey: Uint8Array,
  messageNumber: number,
): string {
  const hex = Array.from(ratchetPublicKey)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex}:${messageNumber}`;
}
