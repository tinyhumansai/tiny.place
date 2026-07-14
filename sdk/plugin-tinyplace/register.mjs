// Register ONE plugin wallet (an @handle) via gasless x402.
// usage: node register.mjs <walletName> <baseHandle>
// Targets staging by default; override with TINYPLACE_API_URL (prod spends real
// USDC — staging may use a zero/deployment default fee).
//
// Harness-agnostic: identities live in the shared, CLI-independent wallet store
// (mcp/wallets.mjs), so the same script serves Codex and Claude.
import { TinyPlaceClient, LocalSigner } from "@tinyhumansai/tinyplace";

import { loadWallets, saveWallets } from "./mcp/wallets.mjs";

const BASE = process.env.TINYPLACE_API_URL ?? "https://staging-api.tiny.place";
const RPC = `${BASE}/solana/rpc`;
const [name, baseHandle] = process.argv.slice(2);
if (!name || !baseHandle) {
  console.error("usage: node register.mjs <walletName> <baseHandle>");
  process.exit(1);
}
const h2b = (h) => { const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return o; };

const wallets = loadWallets(); // shared, CLI-independent store
const w = wallets.find((x) => x.name === name);
if (!w) { console.log("no wallet", name); process.exit(1); }

const signer = await LocalSigner.fromSeed(h2b(w.secretKey));
const client = new TinyPlaceClient({ baseUrl: BASE, signer });

// find an available handle: try the base, then a few deterministic variants.
// Only ever register a candidate we've confirmed is available — never fall out
// of the loop onto an unchecked handle.
const suffixSeed = [...w.address.slice(2, 6)].reduce((s, c) => s + c.charCodeAt(0), 0) % 1000;
let handle;
for (let i = 0; i < 6; i++) {
  const candidate = i === 0 ? baseHandle : `${baseHandle}${suffixSeed + i - 1}`;
  const a = await client.registry.get(candidate).catch(() => ({ available: false }));
  if (a.available) { handle = candidate; break; }
}
if (!handle) {
  console.error(`no available handle found for base "${baseHandle}" after 6 tries`);
  process.exit(1);
}
console.log(`registering ${handle} for ${name} (${w.address}) — spends 1 USDC...`);

try {
  const result = await client.registry.registerWithSolanaPayment(
    { username: handle, cryptoId: w.address, publicKey: w.publicKey, primary: true },
    { secretKey: h2b(w.secretKey), rpcUrl: RPC },
  );
  console.log("REGISTERED ✅");
  console.log("  handle:", result.identity?.username);
  console.log("  status:", result.identity?.status);
  console.log("  cryptoId:", result.identity?.cryptoId);
  console.log("  onChainTx:", result.onChainTx ?? "(gasless/delegated — no client tx)");
  // persist handle into the wallet store so the TUI/menu shows and reuses it
  w.handle = result.identity?.username;
  saveWallets(wallets);
} catch (e) {
  console.log("FAILED ❌", e?.status, JSON.stringify(e?.body ?? e?.message));
  process.exit(2);
}
