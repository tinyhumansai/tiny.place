import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  generateX25519KeyPair,
  x25519SharedSecret,
  toBase64,
  fromBase64,
} from "./crypto.js";
import type { X25519KeyPair } from "./crypto.js";
import type { SessionState } from "./store.js";

const X3DH_INFO = new TextEncoder().encode("WhisperText");
const PADDING = new Uint8Array(32).fill(0xff);

/**
 * Verifies that a fetched pre-key was signed by the peer's long-term Ed25519
 * identity key, using the exact construction the backend uses:
 *   ed25519.Verify(identityPubKey, base64(preKey.PublicKey), signature)
 *
 * The signed message is the UTF-8 bytes of the base64-encoded X25519 public key
 * (see `signal/keys.ts`). Throws on a missing or invalid signature so a malicious
 * relay/directory cannot substitute attacker-controlled pre-keys.
 *
 * @param identityEd25519PublicKey - The peer's long-term Ed25519 identity public
 *   key (the addressing key), NOT the derived X25519 key. This must come from a
 *   trusted source (the peer's handle/address), never from the served bundle.
 * @param preKeyPublicKeyBase64 - The base64-encoded X25519 pre-key public key, as
 *   carried verbatim in the fetched bundle.
 * @param signatureBase64 - The base64-encoded Ed25519 signature over the pre-key.
 * @param label - A human-readable label for the pre-key (for error messages).
 */
export function verifyPreKeySignature(
  identityEd25519PublicKey: Uint8Array,
  preKeyPublicKeyBase64: string,
  signatureBase64: string | undefined,
  label: string,
): void {
  if (!signatureBase64) {
    throw new Error(
      `Key bundle rejected: ${label} is missing its Ed25519 signature`,
    );
  }
  const signedMessage = new TextEncoder().encode(preKeyPublicKeyBase64);
  const signature = fromBase64(signatureBase64);
  let valid = false;
  try {
    valid = ed25519.verify(signature, signedMessage, identityEd25519PublicKey);
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new Error(
      `Key bundle rejected: invalid Ed25519 signature on ${label}`,
    );
  }
}

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
