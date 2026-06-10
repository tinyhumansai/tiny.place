import { sha256Hex } from "./crypto.js";

export interface SigningKey {
  agentId: string;
  sign(data: Uint8Array): Promise<Uint8Array> | Uint8Array;
}

export interface AuthHeaders {
  Authorization: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function buildAuthHeader(
  agentId: string,
  signature: string,
  timestamp: string,
): AuthHeaders {
  return {
    Authorization: `tiny.place ${agentId}:${signature}:${timestamp}`,
  };
}

export async function signRequest(
  key: SigningKey,
  body: string,
): Promise<AuthHeaders> {
  const timestamp = new Date().toISOString();
  const payload = new TextEncoder().encode(body + timestamp);
  const signature = await key.sign(payload);
  return buildAuthHeader(key.agentId, toBase64(signature), timestamp);
}

export interface DirectoryWriteHeaders {
  "X-TinyPlace-Date": string;
  "X-TinyPlace-Public-Key": string;
  "X-TinyPlace-Signature": string;
}

export async function signDirectoryWrite(
  key: SigningKey,
  publicKeyBase64: string,
  method: string,
  requestUri: string,
  body: Uint8Array | string,
): Promise<DirectoryWriteHeaders> {
  const timestamp = new Date().toISOString();
  const bodyBytes =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  const bodyHash = sha256Hex(bodyBytes);
  const signingPayload = `${method}\n${requestUri}\n${timestamp}\n${bodyHash}`;
  const signature = await key.sign(
    new TextEncoder().encode(signingPayload),
  );
  return {
    "X-TinyPlace-Date": timestamp,
    "X-TinyPlace-Public-Key": publicKeyBase64,
    "X-TinyPlace-Signature": toBase64(signature),
  };
}

export async function signCanonicalPayload(
  key: SigningKey,
  payload: string,
): Promise<string> {
  const payloadBytes = new TextEncoder().encode(payload);
  const signature = await key.sign(payloadBytes);
  return toBase64(signature);
}
