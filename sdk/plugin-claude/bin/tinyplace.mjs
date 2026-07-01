#!/usr/bin/env node
// Interactive TUI launcher for the tiny.place Claude Code plugin ("Door B").
//
// Pick / create / register a wallet, then boot a Claude Code session with this
// plugin loaded (`claude --plugin-dir`) and the chosen wallet already active
// (via TINYPLACE_ACTIVE_WALLET, which mcp/server.mjs honors on startup). So the
// identity "init" that you'd otherwise do inside the session (wallet_create ->
// use) happens up front, and Claude opens already logged in.
//
// This is an OPTIONAL front door. The plugin stays fully usable the normal way
// inside any Claude session ("Door A": wallet_create / use / send / inbox) — the
// launcher and the in-session skills share one wallet store and one MCP server.
//
// Usage:
//   tinyplace                 # interactive TUI
//   tinyplace --wallet alice  # skip the menu, launch straight in as `alice`
//   tinyplace -- --resume     # anything after `--` is forwarded to `claude`

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { LocalSigner } from "@tinyhumansai/tinyplace";

// bin/tinyplace.mjs -> plugin root is one dir up from bin/.
const PLUGIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = process.env.TINYPLACE_CLAUDE_HOME ?? join(homedir(), ".tinyplace-claude");
const WALLETS_FILE = join(DATA_DIR, "wallets.json");
const REGISTER_SCRIPT = join(PLUGIN_DIR, "register.mjs");

// ── wallet store (mirrors mcp/server.mjs byte-for-byte) ──────────────────────
function loadWallets() {
  if (!existsSync(WALLETS_FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(WALLETS_FILE, "utf8"));
    return Array.isArray(parsed?.wallets) ? parsed.wallets : [];
  } catch {
    return [];
  }
}
function saveWallets(wallets) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(WALLETS_FILE, JSON.stringify({ wallets }, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(WALLETS_FILE, 0o600);
  } catch {
    /* best-effort */
  }
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
async function createWallet(name) {
  const wallets = loadWallets();
  if (wallets.some((w) => w.name === name)) throw new Error(`A wallet named '${name}' already exists.`);
  const seedHex = Buffer.from(randomBytes(32)).toString("hex");
  const signer = await LocalSigner.fromSeed(hexToBytes(seedHex));
  wallets.push({
    name,
    address: signer.agentId,
    publicKey: signer.publicKeyBase64,
    secretKey: seedHex,
    createdAt: new Date().toISOString(),
  });
  saveWallets(wallets);
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

// ── arrow-key menu (raw mode); resolves selected index, or -1 to cancel ──────
function menu(subtitle, items) {
  return new Promise((resolve) => {
    let idx = 0;
    const stdin = process.stdin;
    const render = () => {
      clear();
      process.stdout.write(`${C.bold}${C.cyan}  tiny.place${C.reset}  ${C.dim}— open a Claude session as an agent${C.reset}\n\n`);
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
      if (s === "" || s === "q") return finish(-1);
      if (s === "[A" || s === "k") idx = (idx - 1 + items.length) % items.length;
      else if (s === "[B" || s === "j") idx = (idx + 1) % items.length;
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

// ── launch Claude Code with the plugin + chosen wallet (takes over terminal) ──
function launch(walletName, forwardedArgs) {
  clear();
  process.stdout.write(`${C.green}▶${C.reset} launching Claude as ${C.bold}${walletName}${C.reset} …\n\n`);
  const args = [
    "--plugin-dir",
    PLUGIN_DIR,
    "--dangerously-load-development-channels",
    "server:tinyplace",
    ...forwardedArgs,
  ];
  const child = spawn("claude", args, {
    stdio: "inherit",
    env: { ...process.env, TINYPLACE_ACTIVE_WALLET: walletName },
  });
  child.on("error", (error) => {
    console.error(`\nCould not launch 'claude': ${error.message}\nIs Claude Code installed and on your PATH?`);
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function registerFlow(wallet) {
  clear();
  const base = await prompt(`  Base handle to register for '${wallet.name}': @`);
  if (!base) return;
  process.stdout.write(`\n  ${C.yellow}Heads up:${C.reset} this spends ~1 USDC on ${C.bold}production${C.reset} for ${wallet.name} (${short(wallet.address)}).\n`);
  const confirmed = (await prompt("  Type 'yes' to proceed (anything else cancels): ")).toLowerCase() === "yes";
  if (!confirmed) return;
  spawnSync("node", [REGISTER_SCRIPT, wallet.name, base], { stdio: "inherit" });
  await prompt("\n  Press enter to continue…");
}

async function main() {
  const argv = process.argv.slice(2);

  // Everything after `--` is forwarded verbatim to `claude`.
  const dashDash = argv.indexOf("--");
  const forwardedArgs = dashDash === -1 ? [] : argv.slice(dashDash + 1);
  const flags = dashDash === -1 ? argv : argv.slice(0, dashDash);

  // Non-interactive fast path: `tinyplace --wallet alice`.
  const walletFlag = flags.indexOf("--wallet");
  if (walletFlag !== -1) {
    const name = flags[walletFlag + 1];
    if (!name || !loadWallets().some((w) => w.name === name)) {
      console.error(`No wallet named '${name ?? ""}'. Run 'tinyplace' with no args to create one.`);
      process.exit(1);
    }
    return launch(name, forwardedArgs);
  }

  if (!process.stdin.isTTY) {
    console.error("tinyplace: interactive menu needs a TTY. Use 'tinyplace --wallet <name>' in non-interactive contexts.");
    process.exit(1);
  }

  for (;;) {
    const wallets = loadWallets();
    const items = [
      ...wallets.map((w) => ({ label: w.name, hint: `${w.handle ? "@" + w.handle + "  " : ""}${short(w.address)}` })),
      { label: "＋ Create new wallet", hint: "offline · free" },
      ...(wallets.length ? [{ label: "⚡ Register @handle", hint: "spends ~1 USDC on prod" }] : []),
      { label: "Quit", hint: "" },
    ];
    const subtitle = wallets.length ? "Select an identity to launch:" : "No wallets yet — create one:";
    const choice = await menu(subtitle, items);
    if (choice === -1) {
      clear();
      process.exit(0);
    }

    // A wallet row → launch (this replaces the process's terminal with Claude).
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
