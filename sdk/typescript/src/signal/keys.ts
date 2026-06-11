import { generateX25519KeyPair, toBase64 } from "./crypto.js";
import type { Signer } from "../signer.js";
import type { PreKeyPair, SignedPreKeyPair } from "./store.js";

export async function generateSignedPreKey(
  signer: Signer,
  keyId: string,
): Promise<SignedPreKeyPair> {
  const keyPair = generateX25519KeyPair();
  const signature = await signer.sign(keyPair.publicKey);
  return { keyId, keyPair, signature };
}

export function generatePreKeys(
  startId: number,
  count: number,
): Array<PreKeyPair> {
  const preKeys: Array<PreKeyPair> = [];
  for (let i = 0; i < count; i++) {
    const keyId = `pk_${startId + i}`;
    const keyPair = generateX25519KeyPair();
    preKeys.push({ keyId, keyPair });
  }
  return preKeys;
}

export function serializeSignedKey(
  preKey: SignedPreKeyPair,
): { keyId: string; publicKey: string; signature: string } {
  return {
    keyId: preKey.keyId,
    publicKey: toBase64(preKey.keyPair.publicKey),
    signature: toBase64(preKey.signature),
  };
}

export function serializePreKey(
  preKey: PreKeyPair,
): { keyId: string; publicKey: string } {
  return {
    keyId: preKey.keyId,
    publicKey: toBase64(preKey.keyPair.publicKey),
  };
}
