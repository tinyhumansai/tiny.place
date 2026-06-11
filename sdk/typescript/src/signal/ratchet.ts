import {
  generateX25519KeyPair,
  x25519SharedSecret,
  kdfRootKey,
  kdfChainKey,
  encrypt,
  decrypt,
} from "./crypto.js";
import { skippedKeyId } from "./store.js";
import type { SessionState } from "./store.js";

const MAX_SKIP = 1000;

export interface RatchetHeader {
  publicKey: Uint8Array;
  previousChainLength: number;
  messageNumber: number;
}

export interface RatchetMessage {
  header: RatchetHeader;
  ciphertext: Uint8Array;
}

export async function ratchetEncrypt(
  state: SessionState,
  plaintext: Uint8Array,
  associatedData: Uint8Array,
): Promise<RatchetMessage> {
  if (!state.sendChainKey) {
    dhRatchetStep(state);
  }
  const { chainKey, messageKey } = kdfChainKey(state.sendChainKey!);
  state.sendChainKey = chainKey;

  const header: RatchetHeader = {
    publicKey: state.dhSendKeyPair.publicKey,
    previousChainLength: state.previousChainLength,
    messageNumber: state.sendMessageNumber,
  };
  state.sendMessageNumber++;

  const headerBytes = encodeHeader(header);
  const ad = concat(associatedData, headerBytes);
  const ciphertext = await encrypt(messageKey, plaintext, ad);

  return { header, ciphertext };
}

export async function ratchetDecrypt(
  state: SessionState,
  message: RatchetMessage,
  associatedData: Uint8Array,
): Promise<Uint8Array> {
  const skId = skippedKeyId(message.header.publicKey, message.header.messageNumber);
  const skippedMk = state.skippedKeys.get(skId);
  if (skippedMk) {
    state.skippedKeys.delete(skId);
    const headerBytes = encodeHeader(message.header);
    const ad = concat(associatedData, headerBytes);
    return decrypt(skippedMk, message.ciphertext, ad);
  }

  const headerKeyChanged =
    !state.dhRecvPublicKey ||
    !uint8ArrayEqual(state.dhRecvPublicKey, message.header.publicKey);

  if (headerKeyChanged) {
    if (state.recvChainKey) {
      skipMessageKeys(state, message.header.previousChainLength);
    }
    dhRatchetStepWithRecv(state, message.header.publicKey);
  }

  skipMessageKeys(state, message.header.messageNumber);

  const { chainKey, messageKey } = kdfChainKey(state.recvChainKey!);
  state.recvChainKey = chainKey;
  state.recvMessageNumber++;

  const headerBytes = encodeHeader(message.header);
  const ad = concat(associatedData, headerBytes);
  return decrypt(messageKey, message.ciphertext, ad);
}

function dhRatchetStep(state: SessionState): void {
  if (!state.dhRecvPublicKey) {
    throw new Error("Cannot perform DH ratchet without recipient public key");
  }
  const dhOutput = x25519SharedSecret(
    state.dhSendKeyPair.privateKey,
    state.dhRecvPublicKey,
  );
  const { rootKey, chainKey } = kdfRootKey(state.rootKey, dhOutput);
  state.rootKey = rootKey;
  state.sendChainKey = chainKey;
}

function dhRatchetStepWithRecv(
  state: SessionState,
  newRecvPublicKey: Uint8Array,
): void {
  state.previousChainLength = state.sendMessageNumber;
  state.sendMessageNumber = 0;
  state.recvMessageNumber = 0;
  state.dhRecvPublicKey = newRecvPublicKey;

  const dhRecv = x25519SharedSecret(
    state.dhSendKeyPair.privateKey,
    state.dhRecvPublicKey,
  );
  const recvResult = kdfRootKey(state.rootKey, dhRecv);
  state.rootKey = recvResult.rootKey;
  state.recvChainKey = recvResult.chainKey;

  state.dhSendKeyPair = generateX25519KeyPair();
  const dhSend = x25519SharedSecret(
    state.dhSendKeyPair.privateKey,
    state.dhRecvPublicKey,
  );
  const sendResult = kdfRootKey(state.rootKey, dhSend);
  state.rootKey = sendResult.rootKey;
  state.sendChainKey = sendResult.chainKey;
}

function skipMessageKeys(state: SessionState, until: number): void {
  if (!state.recvChainKey) return;
  if (until - state.recvMessageNumber > MAX_SKIP) {
    throw new Error("Too many skipped messages");
  }
  while (state.recvMessageNumber < until) {
    const { chainKey, messageKey } = kdfChainKey(state.recvChainKey);
    state.recvChainKey = chainKey;
    const skId = skippedKeyId(state.dhRecvPublicKey!, state.recvMessageNumber);
    state.skippedKeys.set(skId, messageKey);
    state.recvMessageNumber++;
  }
}

function encodeHeader(header: RatchetHeader): Uint8Array {
  const result = new Uint8Array(32 + 4 + 4);
  result.set(header.publicKey);
  const view = new DataView(result.buffer);
  view.setUint32(32, header.previousChainLength, false);
  view.setUint32(36, header.messageNumber, false);
  return result;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}

function uint8ArrayEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
