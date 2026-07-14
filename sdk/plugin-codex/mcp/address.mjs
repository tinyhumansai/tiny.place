// Address helpers shared by the MCP server and the daemon.
//
// Contacts are keyed by the base58 cryptoId (a base64 key gives 404 on
// /contacts/{id}). Convert whatever was passed (cryptoId, base64 messaging key,
// or @handle) into the cryptoId the contacts API expects.
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const CRYPTO_ID_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const B64KEY_RE = /^[A-Za-z0-9+/]{43}=$/;

export function bytesToBase58(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = "";
  while (n > 0n) { out = BASE58[Number(n % 58n)] + out; n = n / 58n; }
  for (const b of bytes) { if (b !== 0) break; out = "1" + out; }
  return out || "1";
}

export async function toCryptoId(client, value) {
  if (B64KEY_RE.test(value)) return bytesToBase58(Buffer.from(value, "base64"));
  if (!value.startsWith("@") && CRYPTO_ID_RE.test(value)) return value;
  const handle = value.startsWith("@") ? value : `@${value}`;
  const r = await client.directory.resolve(handle).catch(() => null);
  return r?.agent?.agentId ?? r?.agentId ?? r?.cryptoId ?? value;
}
