import { toBase64, fromBase64 } from "./crypto.js";
import type { X25519KeyPair } from "./crypto.js";
import { x3dhInitiate, x3dhRespond, buildAssociatedData, verifyPreKeySignature } from "./x3dh.js";
import type { X3DHBundle } from "./x3dh.js";
import { ratchetEncrypt, ratchetDecrypt } from "./ratchet.js";
import type { RatchetMessage, RatchetHeader } from "./ratchet.js";
import type { SessionStore, SessionState } from "./store.js";
import type { KeyBundle, MessageEnvelope, SignalMetadata } from "../types/index.js";

export interface EncryptedMessage {
  body: string;
  type: "CIPHERTEXT" | "PREKEY_BUNDLE";
  signal?: SignalMetadata;
}

export class SignalSession {
  private readonly store: SessionStore;
  private readonly ourIdentityPublicKey: Uint8Array;

  constructor(store: SessionStore, ourIdentityPublicKey: Uint8Array) {
    this.store = store;
    this.ourIdentityPublicKey = ourIdentityPublicKey;
  }

  async encrypt(
    recipientAddress: string,
    recipientIdentityKey: Uint8Array,
    plaintext: Uint8Array,
    recipientBundle?: KeyBundle,
    recipientIdentityEd25519Key?: Uint8Array,
  ): Promise<EncryptedMessage> {
    let session = await this.store.getSession(recipientAddress);
    let isPreKeyMessage = false;
    let ephemeralPublicKey: Uint8Array | undefined;
    let signedPreKeyId: string | undefined;
    let oneTimePreKeyId: string | undefined;

    if (!session && recipientBundle) {
      const bundle = parseKeyBundle(
        recipientBundle,
        recipientIdentityKey,
        recipientIdentityEd25519Key,
      );
      const identityKeyPair = await this.store.getIdentityX25519KeyPair();
      const result = x3dhInitiate(identityKeyPair, bundle);
      session = result.session;
      ephemeralPublicKey = result.ephemeralPublicKey;
      signedPreKeyId = result.signedPreKeyId;
      oneTimePreKeyId = result.oneTimePreKeyId;
      isPreKeyMessage = true;
    }

    if (!session) {
      throw new Error(
        `No session for ${recipientAddress}. Provide a key bundle for initial message.`,
      );
    }

    const associatedData = buildAssociatedData(
      this.ourIdentityPublicKey,
      recipientIdentityKey,
    );
    const message = await ratchetEncrypt(session, plaintext, associatedData);
    await this.store.storeSession(recipientAddress, session);

    const signal = buildSignalMetadata(message.header, ephemeralPublicKey, signedPreKeyId, oneTimePreKeyId);

    return {
      body: toBase64(message.ciphertext),
      type: isPreKeyMessage ? "PREKEY_BUNDLE" : "CIPHERTEXT",
      signal,
    };
  }

  async decrypt(
    senderAddress: string,
    senderIdentityKey: Uint8Array,
    envelope: MessageEnvelope,
  ): Promise<Uint8Array> {
    let session = await this.store.getSession(senderAddress);
    const ciphertext = fromBase64(envelope.body);

    if (envelope.type === "PREKEY_BUNDLE" && envelope.signal) {
      session = await this.processPreKeyMessage(
        senderIdentityKey,
        envelope.signal,
      );
    }

    if (!session) {
      throw new Error(`No session for ${senderAddress}`);
    }

    const header = parseSignalHeader(envelope.signal);
    const associatedData = buildAssociatedData(
      senderIdentityKey,
      this.ourIdentityPublicKey,
    );
    const ratchetMessage: RatchetMessage = { header, ciphertext };
    const plaintext = await ratchetDecrypt(session, ratchetMessage, associatedData);
    await this.store.storeSession(senderAddress, session);

    return plaintext;
  }

  private async processPreKeyMessage(
    senderIdentityKey: Uint8Array,
    signal: SignalMetadata,
  ): Promise<SessionState> {
    const identityKeyPair = await this.store.getIdentityX25519KeyPair();
    const signedPreKey = await this.store.getSignedPreKey(signal.signedPreKeyId!);
    if (!signedPreKey) {
      throw new Error(`Signed pre-key ${signal.signedPreKeyId} not found`);
    }

    let oneTimePreKeyPair: X25519KeyPair | undefined;
    if (signal.oneTimePreKeyId) {
      const oneTimePreKey = await this.store.getPreKey(signal.oneTimePreKeyId);
      if (oneTimePreKey) {
        oneTimePreKeyPair = oneTimePreKey.keyPair;
        await this.store.removePreKey(signal.oneTimePreKeyId);
      }
    }

    const ephemeralKey = fromBase64(signal.ephemeralKey!);

    return x3dhRespond(
      identityKeyPair,
      signedPreKey.keyPair,
      senderIdentityKey,
      ephemeralKey,
      oneTimePreKeyPair,
    );
  }

  async hasSession(address: string): Promise<boolean> {
    const session = await this.store.getSession(address);
    return session !== null;
  }

  async removeSession(address: string): Promise<void> {
    await this.store.removeSession(address);
  }
}

function parseKeyBundle(
  bundle: KeyBundle,
  recipientX25519IdentityKey: Uint8Array,
  recipientEd25519IdentityKey?: Uint8Array,
): X3DHBundle {
  // Verify the signed pre-key (and one-time pre-key) signatures against the
  // peer's long-term Ed25519 identity key before trusting any served key
  // material. This is the X3DH binding that prevents a malicious or compromised
  // relay/directory from substituting attacker-controlled pre-keys (MITM /
  // unknown-key-share). The Ed25519 identity key must come from the caller's
  // trusted addressing of the peer, never from the bundle itself.
  if (!recipientEd25519IdentityKey) {
    throw new Error(
      "Key bundle rejected: peer Ed25519 identity key is required to verify the signed pre-key signature",
    );
  }
  verifyPreKeySignature(
    recipientEd25519IdentityKey,
    bundle.signedPreKey.publicKey,
    bundle.signedPreKey.signature,
    "signed pre-key",
  );

  const result: X3DHBundle = {
    identityKey: recipientX25519IdentityKey,
    signedPreKeyId: bundle.signedPreKey.keyId,
    signedPreKey: fromBase64(bundle.signedPreKey.publicKey),
  };
  if (bundle.oneTimePreKey) {
    verifyPreKeySignature(
      recipientEd25519IdentityKey,
      bundle.oneTimePreKey.publicKey,
      bundle.oneTimePreKey.signature,
      "one-time pre-key",
    );
    result.oneTimePreKeyId = bundle.oneTimePreKey.keyId;
    result.oneTimePreKey = fromBase64(bundle.oneTimePreKey.publicKey);
  }
  return result;
}

function buildSignalMetadata(
  header: RatchetHeader,
  ephemeralPublicKey?: Uint8Array,
  signedPreKeyId?: string,
  oneTimePreKeyId?: string,
): SignalMetadata {
  const signal: SignalMetadata = {
    ratchetKey: toBase64(header.publicKey),
    messageNumber: header.messageNumber,
    previousChainLength: header.previousChainLength,
  };
  if (ephemeralPublicKey) {
    signal.ephemeralKey = toBase64(ephemeralPublicKey);
  }
  if (signedPreKeyId) {
    signal.signedPreKeyId = signedPreKeyId;
  }
  if (oneTimePreKeyId) {
    signal.oneTimePreKeyId = oneTimePreKeyId;
  }
  return signal;
}

function parseSignalHeader(signal?: SignalMetadata): RatchetHeader {
  if (!signal?.ratchetKey) {
    throw new Error("Missing ratchet key in signal metadata");
  }
  return {
    publicKey: fromBase64(signal.ratchetKey),
    previousChainLength: signal.previousChainLength ?? 0,
    messageNumber: signal.messageNumber ?? 0,
  };
}
