import { generateX25519KeyPair, toBase64 } from "./crypto.js";
import type { Signer } from "../signer.js";
import type { PreKeyPair, SignedPreKeyPair } from "./store.js";

// Backend verifies: ed25519.Verify(identityPubKey, []byte(preKey.PublicKey), signature)
// So we sign the base64 string representation of the X25519 public key.
async function signPublicKey(signer: Signer, publicKey: Uint8Array): Promise<Uint8Array> {
  const publicKeyB64 = toBase64(publicKey);
  return signer.sign(new TextEncoder().encode(publicKeyB64));
}

export async function generateSignedPreKey(
  signer: Signer,
  keyId: string,
): Promise<SignedPreKeyPair> {
  const keyPair = generateX25519KeyPair();
  const signature = await signPublicKey(signer, keyPair.publicKey);
  return { keyId, keyPair, signature };
}

export async function generatePreKeys(
  signer: Signer,
  startId: number,
  count: number,
): Promise<Array<PreKeyPair>> {
  const preKeys: Array<PreKeyPair> = [];
  for (let i = 0; i < count; i++) {
    const keyId = `pk_${startId + i}`;
    const keyPair = generateX25519KeyPair();
    const signature = await signPublicKey(signer, keyPair.publicKey);
    preKeys.push({ keyId, keyPair, signature });
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
): { keyId: string; publicKey: string; signature: string } {
  return {
    keyId: preKey.keyId,
    publicKey: toBase64(preKey.keyPair.publicKey),
    signature: toBase64(preKey.signature),
  };
}
