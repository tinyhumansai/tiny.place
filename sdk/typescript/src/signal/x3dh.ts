import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  generateX25519KeyPair,
  x25519SharedSecret,
  toBase64,
} from "./crypto.js";
import type { X25519KeyPair } from "./crypto.js";
import type { SessionState } from "./store.js";

const X3DH_INFO = new TextEncoder().encode("WhisperText");
const PADDING = new Uint8Array(32).fill(0xff);

export interface X3DHBundle {
  identityKey: Uint8Array;
  signedPreKeyId: string;
  signedPreKey: Uint8Array;
  oneTimePreKeyId?: string;
  oneTimePreKey?: Uint8Array;
}

export interface X3DHInitResult {
  session: SessionState;
  ephemeralPublicKey: Uint8Array;
  signedPreKeyId: string;
  oneTimePreKeyId?: string;
}

export function x3dhInitiate(
  ourIdentityKeyPair: X25519KeyPair,
  theirBundle: X3DHBundle,
): X3DHInitResult {
  const ephemeral = generateX25519KeyPair();

  // DH1: our identity <-> their signed pre-key
  const dh1 = x25519SharedSecret(ourIdentityKeyPair.privateKey, theirBundle.signedPreKey);
  // DH2: our ephemeral <-> their identity
  const dh2 = x25519SharedSecret(ephemeral.privateKey, theirBundle.identityKey);
  // DH3: our ephemeral <-> their signed pre-key
  const dh3 = x25519SharedSecret(ephemeral.privateKey, theirBundle.signedPreKey);

  let dhConcat: Uint8Array;
  if (theirBundle.oneTimePreKey) {
    // DH4: our ephemeral <-> their one-time pre-key
    const dh4 = x25519SharedSecret(ephemeral.privateKey, theirBundle.oneTimePreKey);
    dhConcat = concat(PADDING, dh1, dh2, dh3, dh4);
  } else {
    dhConcat = concat(PADDING, dh1, dh2, dh3);
  }

  const sharedSecret = hkdf(sha256, dhConcat, new Uint8Array(32), X3DH_INFO, 32);

  const sendKeyPair = generateX25519KeyPair();
  const session: SessionState = {
    dhSendKeyPair: sendKeyPair,
    dhRecvPublicKey: theirBundle.signedPreKey,
    rootKey: sharedSecret,
    sendChainKey: null,
    recvChainKey: null,
    sendMessageNumber: 0,
    recvMessageNumber: 0,
    previousChainLength: 0,
    skippedKeys: new Map(),
  };

  return {
    session,
    ephemeralPublicKey: ephemeral.publicKey,
    signedPreKeyId: theirBundle.signedPreKeyId,
    oneTimePreKeyId: theirBundle.oneTimePreKeyId,
  };
}

export function x3dhRespond(
  ourIdentityKeyPair: X25519KeyPair,
  ourSignedPreKeyPair: X25519KeyPair,
  theirIdentityKey: Uint8Array,
  theirEphemeralKey: Uint8Array,
  ourOneTimePreKeyPair?: X25519KeyPair,
): SessionState {
  // DH1: their identity <-> our signed pre-key
  const dh1 = x25519SharedSecret(ourSignedPreKeyPair.privateKey, theirIdentityKey);
  // DH2: their ephemeral <-> our identity
  const dh2 = x25519SharedSecret(ourIdentityKeyPair.privateKey, theirEphemeralKey);
  // DH3: their ephemeral <-> our signed pre-key
  const dh3 = x25519SharedSecret(ourSignedPreKeyPair.privateKey, theirEphemeralKey);

  let dhConcat: Uint8Array;
  if (ourOneTimePreKeyPair) {
    const dh4 = x25519SharedSecret(ourOneTimePreKeyPair.privateKey, theirEphemeralKey);
    dhConcat = concat(PADDING, dh1, dh2, dh3, dh4);
  } else {
    dhConcat = concat(PADDING, dh1, dh2, dh3);
  }

  const sharedSecret = hkdf(sha256, dhConcat, new Uint8Array(32), X3DH_INFO, 32);

  return {
    dhSendKeyPair: ourSignedPreKeyPair,
    dhRecvPublicKey: null,
    rootKey: sharedSecret,
    sendChainKey: null,
    recvChainKey: null,
    sendMessageNumber: 0,
    recvMessageNumber: 0,
    previousChainLength: 0,
    skippedKeys: new Map(),
  };
}

export function buildAssociatedData(
  senderIdentityKey: Uint8Array,
  recipientIdentityKey: Uint8Array,
): Uint8Array {
  return concat(senderIdentityKey, recipientIdentityKey);
}

function concat(...arrays: Array<Uint8Array>): Uint8Array {
  let totalLength = 0;
  for (const array of arrays) {
    totalLength += array.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}
