import type { X25519KeyPair } from "./crypto.js";
import type { SessionStore, SessionState, PreKeyPair, SignedPreKeyPair } from "./store.js";

export class MemorySessionStore implements SessionStore {
  private readonly identityKeyPair: X25519KeyPair;
  private readonly signedPreKeys = new Map<string, SignedPreKeyPair>();
  private readonly preKeys = new Map<string, PreKeyPair>();
  private readonly sessions = new Map<string, SessionState>();
  private activeSignedPreKeyId: string | null = null;

  constructor(identityKeyPair: X25519KeyPair) {
    this.identityKeyPair = identityKeyPair;
  }

  async getIdentityX25519KeyPair(): Promise<X25519KeyPair> {
    return this.identityKeyPair;
  }

  async getSignedPreKey(keyId: string): Promise<SignedPreKeyPair | null> {
    return this.signedPreKeys.get(keyId) ?? null;
  }

  async getActiveSignedPreKey(): Promise<SignedPreKeyPair> {
    if (!this.activeSignedPreKeyId) {
      throw new Error("No active signed pre-key");
    }
    const key = this.signedPreKeys.get(this.activeSignedPreKeyId);
    if (!key) {
      throw new Error("Active signed pre-key not found");
    }
    return key;
  }

  async storeSignedPreKey(preKey: SignedPreKeyPair): Promise<void> {
    this.signedPreKeys.set(preKey.keyId, preKey);
    this.activeSignedPreKeyId = preKey.keyId;
  }

  async getPreKey(keyId: string): Promise<PreKeyPair | null> {
    return this.preKeys.get(keyId) ?? null;
  }

  async removePreKey(keyId: string): Promise<void> {
    this.preKeys.delete(keyId);
  }

  async storePreKey(preKey: PreKeyPair): Promise<void> {
    this.preKeys.set(preKey.keyId, preKey);
  }

  async getAllPreKeys(): Promise<Array<PreKeyPair>> {
    return Array.from(this.preKeys.values());
  }

  async getSession(address: string): Promise<SessionState | null> {
    return this.sessions.get(address) ?? null;
  }

  async storeSession(address: string, session: SessionState): Promise<void> {
    this.sessions.set(address, session);
  }

  async removeSession(address: string): Promise<void> {
    this.sessions.delete(address);
  }
}
