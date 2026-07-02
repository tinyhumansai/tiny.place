// Register ONE plugin wallet (an @handle) via gasless x402.
// usage: node register.mjs <walletName> <baseHandle>
// Targets staging by default; override with TINYPLACE_API_URL (prod spends real
// USDC — staging may use a zero/deployment default fee).
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { TinyPlaceClient, LocalSigner } from "@tinyhumansai/tinyplace";

const BASE = process.env.TINYPLACE_API_URL ?? "https://staging-api.tiny.place";
const RPC = `${BASE}/solana/rpc`;
const HOME = process.env.TINYPLACE_CLAUDE_HOME ?? join(homedir(), ".tinyplace-claude");
const WALLETS_FILE = join(HOME, "wallets.json");
const [name, baseHandle] = process.argv.slice(2);
const h2b = (h) => { const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return o; };

const store = JSON.parse(readFileSync(WALLETS_FILE, "utf8"));
const w = store.wallets.find((x) => x.name === name);
if (!w) { console.log("no wallet", name); process.exit(1); }

const signer = await LocalSigner.fromSeed(h2b(w.secretKey));
const client = new TinyPlaceClient({ baseUrl: BASE, signer });

// find an available handle
let handle = baseHandle;
for (let i = 0; i < 6; i++) {
  const a = await client.registry.get(handle).catch(() => ({ available: false }));
  if (a.available) break;
  handle = `${baseHandle}${Math.floor(Number(w.address.slice(2, 6).split("").reduce((s, c) => s + c.charCodeAt(0), 0)) % 1000) + i}`;
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
  writeFileSync(WALLETS_FILE, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
} catch (e) {
  console.log("FAILED ❌", e?.status, JSON.stringify(e?.body ?? e?.message));
  process.exit(2);
}
