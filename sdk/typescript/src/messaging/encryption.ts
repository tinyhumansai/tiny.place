import type { KeysApi } from "../api/keys.js";
import { deriveCryptoId } from "../crypto.js";
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
import type { MessageEnvelope } from "../types/index.js";

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

    // The relay's key routes (`/keys/:cryptoId/...`) are addressed by the base58
    // cryptoId, NOT the base64 Ed25519 key: a base64 key contains `/` and `+`, and
    // the `/` breaks the single-segment `:cryptoId` route match (→ 404) for roughly
    // half of all identities. The Signal identity key (base64) still travels in the
    // body as `identityKey`. Mirrors the recipient path and the manual publish flow.
    const keyPathId = this.signer.agentId;
    await this.keys.rotateSignedPreKey(keyPathId, {
      identityKey: address,
      signedPreKey: serializeSignedKey(signedPreKey),
    });
    await this.keys.uploadPreKeys(keyPathId, {
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
    // Fetch by the recipient's base58 cryptoId, NOT their base64 key: the relay
    // key routes (/keys/:cryptoId/bundle) match a single path segment, which a
    // base64 key's `/` breaks (→ 404). Mirrors publishKeyBundle.
    const bundle = (await session.hasSession(envelope.to))
      ? undefined
      : await this.keys.getBundle(deriveCryptoId(recipientEd25519));

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
