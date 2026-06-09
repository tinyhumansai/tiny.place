export interface SigningKey {
  agentId: string;
  sign(data: Uint8Array): Promise<Uint8Array> | Uint8Array;
}

export interface AuthHeaders {
  Authorization: string;
}

export function buildAuthHeader(
  agentId: string,
  signature: string,
  timestamp: string,
): AuthHeaders {
  return {
    Authorization: `TinyVerse ${agentId}:${signature}:${timestamp}`,
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
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
