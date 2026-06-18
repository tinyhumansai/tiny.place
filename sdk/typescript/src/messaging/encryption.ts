import type { KeysApi } from "../api/keys.js";
import { TinyPlaceError } from "../http.js";
import type { Signer } from "../signer.js";
import {
  SignalSession,
  ed25519PubToX25519Pub,
  fromBase64,
  generatePreKeys,
  generateSignedPreKey,
  serializePreKey,
  serializeSignedKey,
} from "../signal/index.js";
import type { SessionStore } from "../signal/index.js";
import type { KeyBundle, MessageEnvelope } from "../types/index.js";

/** Number of one-time pre-keys uploaded per publish. */
const DEFAULT_PREKEY_COUNT = 10;

const encoder = new TextEncoder();

/**
 * Minimal cipher seam consumed by {@link MessagesApi}. Keeping this an interface
 * (rather than importing the concrete class) avoids a transport ↔ crypto import
 * cycle: `messages.ts` depends only on this shape.
 */
export interface MessageCipher {
  /** Encrypt an outbound envelope's `body` in place, returning a new envelope. */
  encryptEnvelope(envelope: MessageEnvelope): Promise<MessageEnvelope>;
  /** Decrypt an inbound envelope, returning the plaintext bytes. */
  decryptEnvelope(envelope: MessageEnvelope): Promise<Uint8Array>;
}

/**
 * Signal end-to-end encryption wired to a {@link SessionStore}. This is the single
 * orchestration layer shared by every runtime: the CLI hands it a filesystem store,
 * the browser an IndexedDB store, tests an in-memory one. Messaging addresses are
 * the peer's base64 Ed25519 public key; the X25519 key used for ECDH is derived
 * from it via {@link ed25519PubToX25519Pub}.
 */
export class EncryptionContext implements MessageCipher {
  private session?: SignalSession;

  constructor(
    private readonly signer: Signer,
    private readonly store: SessionStore,
    private readonly keys: KeysApi,
  ) {}

  /** This identity's messaging address (base64 Ed25519 public key). */
  get address(): string {
    return this.signer.publicKeyBase64;
  }

  /**
   * Generate, persist, and publish this identity's Signal key bundle — a fresh
   * signed pre-key plus a batch of one-time pre-keys — so peers can open an X3DH
   * session with us. The private halves are kept in the store to answer inbound
   * pre-key messages; re-publishing adds new one-time keys rather than colliding.
   */
  async publishKeyBundle(preKeyCount: number = DEFAULT_PREKEY_COUNT): Promise<void> {
    const address = this.address;
    const signedPreKey = await generateSignedPreKey(
      this.signer,
      `spk_${new Date().getTime()}`,
    );
    const preKeys = await generatePreKeys(
      this.signer,
      new Date().getTime(),
      preKeyCount,
    );

    await this.store.storeSignedPreKey(signedPreKey);
    await Promise.all(preKeys.map((preKey) => this.store.storePreKey(preKey)));

    await this.keys.rotateSignedPreKey(address, {
      identityKey: address,
      signedPreKey: serializeSignedKey(signedPreKey),
    });
    await this.keys.uploadPreKeys(address, {
      identityKey: address,
      preKeys: preKeys.map(serializePreKey),
    });
  }

  async encryptEnvelope(envelope: MessageEnvelope): Promise<MessageEnvelope> {
    const session = await this.getSession();
    const recipientEd25519 = fromBase64(envelope.to);
    const recipientX25519 = ed25519PubToX25519Pub(recipientEd25519);
    // First message to a peer needs their bundle to bootstrap X3DH; later messages
    // ride the established Double Ratchet session and need no bundle fetch.
    const bundle = (await session.hasSession(envelope.to))
      ? undefined
      : await this.fetchBundleForBootstrap(envelope.to);

    const encrypted = await session.encrypt(
      envelope.to,
      recipientX25519,
      encoder.encode(envelope.body),
      bundle,
      recipientEd25519,
    );

    return {
      ...envelope,
      type: encrypted.type,
      body: encrypted.body,
      ...(encrypted.signal ? { signal: encrypted.signal } : {}),
    };
  }

  /**
   * Fetch a recipient's key bundle to bootstrap the first X3DH session. A 404
   * here means the address has no published Signal bundle — the agent never
   * enabled encrypted messaging (their directory card may advertise a key, or we
   * may have optimistically fallen back to their wallet publicKey, but no bundle
   * was ever uploaded). Translate it into an actionable error instead of leaking
   * the raw 404 to the send call site.
   */
  private async fetchBundleForBootstrap(to: string): Promise<KeyBundle> {
    try {
      return await this.keys.getBundle(to);
    } catch (error) {
      if (error instanceof TinyPlaceError && error.status === 404) {
        throw new Error("Recipient hasn't enabled encrypted messaging yet");
      }
      throw error;
    }
  }

  async decryptEnvelope(envelope: MessageEnvelope): Promise<Uint8Array> {
    const session = await this.getSession();
    const senderX25519 = ed25519PubToX25519Pub(fromBase64(envelope.from));
    return session.decrypt(envelope.from, senderX25519, envelope);
  }

  /** Lazily build the session — the store's identity key load is async. */
  private async getSession(): Promise<SignalSession> {
    if (!this.session) {
      const identity = await this.store.getIdentityX25519KeyPair();
      this.session = new SignalSession(this.store, identity.publicKey);
    }
    return this.session;
  }
}
