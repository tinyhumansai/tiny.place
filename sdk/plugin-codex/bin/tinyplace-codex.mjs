#!/usr/bin/env node
// Interactive TUI launcher for the tiny.place Codex CLI plugin ("Door B").
//
// Pick / create / register a wallet, then boot a Codex session with this plugin
// wired in and the chosen wallet already active. Codex has no `--plugin-dir`, so
// this writes an ISOLATED CODEX_HOME (config.toml → [mcp_servers.tinyplace] +
// hooks = "hooks.json") and launches `CODEX_HOME=<iso> codex
// --dangerously-bypass-hook-trust`. The isolated home keeps the user's real
// ~/.codex config pristine; the ChatGPT/API login is carried over by symlinking
// auth.json. The identity "init" you'd otherwise do in-session (wallet_create ->
// use) happens up front via TINYPLACE_ACTIVE_WALLET, so Codex opens logged in.
//
// This is an OPTIONAL front door. The plugin stays usable the normal way in any
// Codex session ("Door A": `codex mcp add tinyplace -- node .../mcp/server.mjs`,
// then wallet_create / use / send / inbox) — launcher and in-session tools share
// one wallet store (~/.tinyplace-codex) and one MCP server.
//
// Usage:
//   tinyplace-codex                 # interactive TUI
//   tinyplace-codex --wallet alice  # skip the menu, launch straight in as `alice`
//   tinyplace-codex -- -m gpt-5.4   # anything after `--` is forwarded to `codex`

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { LocalSigner } from "@tinyhumansai/tinyplace";

// bin/tinyplace-codex.mjs -> plugin root is one dir up from bin/.
const PLUGIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = process.env.TINYPLACE_CODEX_HOME ?? join(homedir(), ".tinyplace-codex");
const WALLETS_FILE = join(DATA_DIR, "wallets.json");
const REGISTER_SCRIPT = join(PLUGIN_DIR, "register.mjs");
const SERVER_SCRIPT = join(PLUGIN_DIR, "mcp", "server.mjs");
const HOOKS_TEMPLATE = join(PLUGIN_DIR, "hooks", "hooks.json");
const API_URL = process.env.TINYPLACE_API_URL ?? "https://staging-api.tiny.place";
// The user's real Codex home — source of the login (auth.json) we carry over.
const REAL_CODEX_HOME = process.env.CODEX_HOME ?? join(homedir(), ".codex");

// ── wallet store (mirrors mcp/server.mjs byte-for-byte) ──────────────────────
function loadWallets() {
  if (!existsSync(WALLETS_FILE)) return [];
  // Surface a corrupt/unreadable store instead of returning [] — a silent empty
  // list would let the next create/import overwrite wallets.json and lose secrets.
  try {
    const parsed = JSON.parse(readFileSync(WALLETS_FILE, "utf8"));
    return Array.isArray(parsed?.wallets) ? parsed.wallets : [];
  } catch (error) {
    throw new Error(`Could not read wallet store at ${WALLETS_FILE}: ${error.message}`);
  }
}
function saveWallets(wallets) {
  mkdirSync(DATA_DIR, { recursive: true });
  // Write to a temp file then rename — an atomic publish so a crash/partial write
  // can never truncate or clobber the existing wallets.json.
  const tmp = join(DATA_DIR, `.wallets.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify({ wallets }, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    /* best-effort */
  }
  renameSync(tmp, WALLETS_FILE);
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
async function createWallet(name) {
  const wallets = loadWallets();
  if (wallets.some((w) => w.name === name)) throw new Error(`A wallet named '${name}' already exists.`);
  // Regenerate until slash-free — a `/` in the base64 key breaks the SDK's
  // keys/messages routing (%2F -> 404), so the wallet couldn't receive DMs.
  let seedHex, signer;
  do {
    seedHex = Buffer.from(randomBytes(32)).toString("hex");
    signer = await LocalSigner.fromSeed(hexToBytes(seedHex));
  } while (signer.publicKeyBase64.includes("/"));
  wallets.push({
    name,
    address: signer.agentId,
    publicKey: signer.publicKeyBase64,
    secretKey: seedHex,
    createdAt: new Date().toISOString(),
  });
  saveWallets(wallets);
}

// Base58 decode (Solana secret-key / cryptoId encoding), inline to avoid a dep.
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(str) {
  let num = 0n;
  for (const ch of str) {
    const idx = BASE58.indexOf(ch);
    if (idx === -1) throw new Error(`invalid base58 character '${ch}'`);
    num = num * 58n + BigInt(idx);
  }
  const bytes = [];
  while (num > 0n) { bytes.unshift(Number(num % 256n)); num /= 256n; }
  for (const ch of str) { if (ch === "1") bytes.unshift(0); else break; }
  return Uint8Array.from(bytes);
}

// Extract the 32-byte Ed25519 seed from whatever the user pastes: a base58 Solana
// secret key (32 or 64 bytes), a Solana id.json array, or a 64-hex-char seed.
function parseSecretToSeed(input) {
  const s = input.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return hexToBytes(s); // already a 32-byte seed
  const bytes = s.startsWith("[") ? Uint8Array.from(JSON.parse(s)) : base58Decode(s);
  if (bytes.length !== 32 && bytes.length !== 64) {
    throw new Error(`secret key must be 32 or 64 bytes (got ${bytes.length})`);
  }
  return bytes.slice(0, 32);
}

// Import an existing wallet into the store, deriving the same {address, publicKey}
// the plugin rebuilds via fromSeed. Same seed → same identity as the source wallet.
async function importWallet(name, secretInput) {
  const wallets = loadWallets();
  if (wallets.some((w) => w.name === name)) throw new Error(`A wallet named '${name}' already exists.`);
  const seed = parseSecretToSeed(secretInput);
  const signer = await LocalSigner.fromSeed(seed);
  // Same constraint as createWallet: a `/` in the base64 public key breaks the
  // SDK's keys/messages routing (%2F -> 404), so the wallet couldn't receive DMs.
  // An imported seed is fixed, so we can't regenerate — reject it instead.
  if (signer.publicKeyBase64.includes("/")) {
    throw new Error("This wallet's public key contains '/', which this plugin cannot route yet. Import a different wallet.");
  }
  wallets.push({
    name,
    address: signer.agentId,
    publicKey: signer.publicKeyBase64,
    secretKey: Buffer.from(seed).toString("hex"),
    createdAt: new Date().toISOString(),
  });
  saveWallets(wallets);
  return { address: signer.agentId, publicKey: signer.publicKeyBase64 };
}

// ── isolated CODEX_HOME (Path B) ─────────────────────────────────────────────
// TOML basic-string escaping is a superset-compatible subset of JSON for our
// values (paths, names) — reuse JSON.stringify for safe quoting.
const toml = (v) => JSON.stringify(String(v));

// Build (idempotently) the isolated Codex home for a wallet and return its path.
// Layout: ~/.tinyplace-codex/codex-home/<wallet>/{config.toml,hooks.json,auth.json→}
function ensureIsolatedHome(walletName) {
  const iso = join(DATA_DIR, "codex-home", encodeURIComponent(walletName));
  mkdirSync(iso, { recursive: true });

  // Carry over the login so the isolated home isn't asked to re-auth. Symlink so
  // token refreshes in either place stay in sync; fall back silently if absent.
  const realAuth = join(REAL_CODEX_HOME, "auth.json");
  const isoAuth = join(iso, "auth.json");
  try {
    if (existsSync(realAuth)) {
      try { if (lstatSync(isoAuth)) rmSync(isoAuth, { force: true }); } catch { /* none */ }
      symlinkSync(realAuth, isoAuth);
    }
  } catch {
    /* best-effort — user can `codex login` inside the isolated home */
  }

  // config.toml — MCP server + hooks. The MCP env pins identity + points state
  // back at the shared DATA_DIR (NOT this isolated home) and turns the durable
  // daemon on so inbound survives MCP restarts and the surfacing hook can see it.
  // NOTE: do NOT put a `hooks` key in config.toml — there it must be an inline
  // HooksToml struct and a path string errors out. Codex auto-discovers
  // `$CODEX_HOME/hooks.json` on its own (verified live: all three hooks fire),
  // so we just drop the file below and leave config.toml to the MCP server.
  const config =
    `# Generated by tinyplace-codex launcher — do not edit; regenerated on launch.\n` +
    `[mcp_servers.tinyplace]\n` +
    `command = "node"\n` +
    `args = [${toml(SERVER_SCRIPT)}]\n\n` +
    `[mcp_servers.tinyplace.env]\n` +
    `TINYPLACE_ACTIVE_WALLET = ${toml(walletName)}\n` +
    `TINYPLACE_CODEX_HOME = ${toml(DATA_DIR)}\n` +
    `TINYPLACE_API_URL = ${toml(API_URL)}\n` +
    `TINYPLACE_SESSION_DAEMON = "on"\n`;
  writeFileSync(join(iso, "config.toml"), config, { mode: 0o600 });

  // hooks.json — substitute the ${TINYPLACE_PLUGIN_ROOT} placeholder with the
  // absolute plugin dir so hook commands resolve regardless of Codex env
  // expansion. TINYPLACE_PLUGIN_ROOT is also exported for the running session.
  let hooks = readFileSync(HOOKS_TEMPLATE, "utf8");
  hooks = hooks.split("${TINYPLACE_PLUGIN_ROOT}").join(PLUGIN_DIR);
  writeFileSync(join(iso, "hooks.json"), hooks, { mode: 0o600 });

  return iso;
}

// ── tiny ANSI helpers ────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
};
const clear = () => process.stdout.write("\x1b[2J\x1b[H");
const short = (addr) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "");

// ── line prompt (cooked mode) ────────────────────────────────────────────────
function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

// Like prompt() but does not echo typed/pasted characters — for secret key input,
// so it doesn't leak into scrollback, screen shares, or terminal recordings.
function promptHidden(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write(question);
  rl._writeToOutput = () => {}; // suppress echo
  return new Promise((resolve) => rl.question("", (answer) => {
    process.stdout.write("\n");
    rl.close();
    resolve(answer.trim());
  }));
}

// ── arrow-key menu (raw mode); resolves selected index, or -1 to cancel ──────
function menu(subtitle, items) {
  return new Promise((resolve) => {
    let idx = 0;
    const stdin = process.stdin;
    const render = () => {
      clear();
      process.stdout.write(`${C.bold}${C.cyan}  tiny.place${C.reset}  ${C.dim}— open a Codex session as an agent${C.reset}\n\n`);
      if (subtitle) process.stdout.write(`  ${C.dim}${subtitle}${C.reset}\n\n`);
      items.forEach((it, i) => {
        const sel = i === idx;
        const arrow = sel ? `${C.green}❯${C.reset} ` : "  ";
        const label = sel ? `${C.bold}${it.label}${C.reset}` : it.label;
        const hint = it.hint ? `  ${C.dim}${it.hint}${C.reset}` : "";
        process.stdout.write(`  ${arrow}${label}${hint}\n`);
      });
      process.stdout.write(`\n  ${C.dim}↑/↓ move · enter select · q quit${C.reset}\n`);
    };
    const onData = (buf) => {
      const s = buf.toString();
      if (s === "" || s === "q") return finish(-1);
      // Raw TTY arrow keys arrive as the full ESC sequence (\x1b[A / \x1b[B);
      // match both those and the bare CSI/vim forms.
      if (s === "\x1b[A" || s === "[A" || s === "k") idx = (idx - 1 + items.length) % items.length;
      else if (s === "\x1b[B" || s === "[B" || s === "j") idx = (idx + 1) % items.length;
      else if (s === "\r" || s === "\n") return finish(idx);
      else if (/^[1-9]$/.test(s) && Number(s) <= items.length) return finish(Number(s) - 1);
      render();
    };
    const finish = (result) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      resolve(result);
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    render();
  });
}

// ── launch Codex with the plugin + chosen wallet (takes over terminal) ───────
function launch(walletName, forwardedArgs) {
  clear();
  let iso;
  try {
    iso = ensureIsolatedHome(walletName);
  } catch (error) {
    console.error(`\nCould not prepare Codex home: ${error.message}`);
    process.exit(1);
  }
  process.stdout.write(`${C.green}▶${C.reset} launching Codex as ${C.bold}${walletName}${C.reset} …\n\n`);
  const child = spawn("codex", ["--dangerously-bypass-hook-trust", ...forwardedArgs], {
    stdio: "inherit",
    env: {
      ...process.env,
      CODEX_HOME: iso,
      TINYPLACE_ACTIVE_WALLET: walletName,
      TINYPLACE_CODEX_HOME: DATA_DIR,
      TINYPLACE_PLUGIN_ROOT: PLUGIN_DIR,
    },
  });
  child.on("error", (error) => {
    console.error(`\nCould not launch 'codex': ${error.message}\nIs the Codex CLI installed and on your PATH? (npm i -g @openai/codex)`);
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function registerFlow(wallet) {
  clear();
  const base = await prompt(`  Base handle to register for '${wallet.name}': @`);
  if (!base) return;
  process.stdout.write(`\n  ${C.yellow}Registering${C.reset} @${base}* for ${wallet.name} (${short(wallet.address)}) on ${C.bold}${API_URL}${C.reset}.\n`);
  const confirmed = (await prompt("  Type 'yes' to proceed (anything else cancels): ")).toLowerCase() === "yes";
  if (!confirmed) return;
  spawnSync("node", [REGISTER_SCRIPT, wallet.name, base], { stdio: "inherit" });
  await prompt("\n  Press enter to continue…");
}

async function importFlow() {
  clear();
  process.stdout.write(`  ${C.dim}Import an existing wallet — paste a base58 Solana secret key, a Solana${C.reset}\n`);
  process.stdout.write(`  ${C.dim}id.json array, or a 32-byte seed in hex.${C.reset}\n`);
  process.stdout.write(`  ${C.yellow}The secret is stored locally (0600). Input is hidden (not echoed).${C.reset}\n\n`);
  const name = await prompt("  Name for this wallet (e.g. main): ");
  if (!name) return;
  const secret = await promptHidden("  Secret (base58 / id.json / seed-hex): ");
  if (!secret) return;
  try {
    const imported = await importWallet(name, secret);
    process.stdout.write(`\n  ${C.green}Imported${C.reset} ${name} → ${short(imported.address)}\n`);
  } catch (error) {
    console.error(`  ${error.message}`);
  }
  await prompt("  Press enter…");
}

async function main() {
  const argv = process.argv.slice(2);

  // Everything after `--` is forwarded verbatim to `codex`.
  const dashDash = argv.indexOf("--");
  const forwardedArgs = dashDash === -1 ? [] : argv.slice(dashDash + 1);
  const flags = dashDash === -1 ? argv : argv.slice(0, dashDash);

  // Non-interactive fast path: `tinyplace-codex --wallet alice`.
  const walletFlag = flags.indexOf("--wallet");
  if (walletFlag !== -1) {
    const name = flags[walletFlag + 1];
    if (!name || !loadWallets().some((w) => w.name === name)) {
      console.error(`No wallet named '${name ?? ""}'. Run 'tinyplace-codex' with no args to create one.`);
      process.exit(1);
    }
    return launch(name, forwardedArgs);
  }

  if (!process.stdin.isTTY) {
    console.error("tinyplace-codex: interactive menu needs a TTY. Use 'tinyplace-codex --wallet <name>' in non-interactive contexts.");
    process.exit(1);
  }

  for (;;) {
    const wallets = loadWallets();
    const items = [
      ...wallets.map((w) => ({ label: w.name, hint: `${w.handle ? "@" + w.handle + "  " : ""}${short(w.address)}` })),
      { label: "＋ Create new wallet", hint: "offline · free" },
      { label: "📥 Import existing wallet", hint: "Solana key / seed" },
      ...(wallets.length ? [{ label: "⚡ Register @handle", hint: "on staging" }] : []),
      { label: "Quit", hint: "" },
    ];
    const subtitle = wallets.length ? "Select an identity to launch:" : "No wallets yet — create one:";
    const choice = await menu(subtitle, items);
    if (choice === -1) {
      clear();
      process.exit(0);
    }

    // A wallet row → launch (this replaces the process's terminal with Codex).
    if (choice < wallets.length) return launch(wallets[choice].name, forwardedArgs);

    const action = items[choice].label;
    if (action.startsWith("＋")) {
      clear();
      const name = await prompt("  New wallet name (e.g. alice): ");
      if (name) {
        try {
          await createWallet(name);
        } catch (error) {
          console.error(`  ${error.message}`);
          await prompt("  Press enter…");
        }
      }
    } else if (action.startsWith("📥")) {
      await importFlow();
    } else if (action.startsWith("⚡")) {
      const pick = await menu("Register which wallet?", [
        ...wallets.map((w) => ({ label: w.name, hint: short(w.address) })),
        { label: "Back", hint: "" },
      ]);
      if (pick >= 0 && pick < wallets.length) await registerFlow(wallets[pick]);
    } else {
      clear();
      process.exit(0);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
