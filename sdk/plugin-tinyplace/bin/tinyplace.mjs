#!/usr/bin/env node
// Interactive TUI launcher for the tiny.place plugin ("Door B") — ONE launcher,
// any harness. Pick / create / register a wallet, then boot a harness session
// with this plugin wired in and the chosen wallet already active.
//
// The launcher itself is harness-agnostic: it owns the wallet store, the menu,
// and the import/register flows, then hands off to the active adapter's
// `launch.prepare()` for the {command, args, env} that boots THIS harness. Claude
// takes a plugin dir directly; Codex gets an isolated CODEX_HOME written for it —
// both live in the adapter, not here. Adding a new harness = one adapter file, no
// change to this launcher.
//
// Harness selection: `--harness <name>` (or TINYPLACE_HARNESS) forces it; else it
// auto-detects from the environment (defaults to claude in a plain shell).
//
// Usage:
//   tinyplace-plugin                       # interactive TUI (auto-detect harness)
//   tinyplace-plugin --harness codex       # force the Codex adapter
//   tinyplace-plugin --wallet alice        # skip the menu, launch straight in as `alice`
//   tinyplace-plugin -- --resume           # anything after `--` is forwarded to the harness

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { LocalSigner } from "@tinyhumansai/tinyplace";

import { activeAdapter, harnessDataDir, ADAPTERS, _resetAdapterCache } from "../mcp/harness.mjs";
import { canForegroundInject } from "../mcp/foreground-inject.mjs";
import { loadWallets, saveWallets, sharedDir } from "../mcp/wallets.mjs";

// bin/tinyplace.mjs -> plugin root is one dir up from bin/.
const PLUGIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const API_URL = process.env.TINYPLACE_API_URL ?? "https://staging-api.tiny.place";
const REGISTER_SCRIPT = join(PLUGIN_DIR, "register.mjs");

// Resolved lazily in main() AFTER the --harness flag is folded into env, so the
// forced adapter (if any) wins detection. These are set once, up front.
let ADAPTER;
let DATA_DIR;
// Wallets come from the shared, CLI-independent store (mcp/wallets.mjs).
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

// Fold the tinyplace **CLI's** auto-minted wallet (`~/.tinyplace/config.json` →
// `secretKey`, a 32-byte seed in hex) into the shared plugin store on first run.
// The CLI mints its identity into `config.json`; the plugin reads `wallets.json`
// — two different files in the same dir — so without this a session started via
// the CLI sees "no wallets" and prompts for a brand-new identity instead of
// reusing the one you already created. Best-effort + only when the store is
// empty, so it never overwrites or duplicates a wallet the user already has.
async function seedFromCliConfig() {
  if (loadWallets().length) return;
  let secretKey;
  try {
    // Resolve the CLI config the same way the SDK's configPathFor does — honor
    // TINYPLACE_CONFIG so a non-default profile / embedder / test that moved the
    // CLI identity is adopted, instead of silently reading the default file.
    const configPath =
      process.env.TINYPLACE_CONFIG ?? join(sharedDir(), "config.json");
    secretKey = JSON.parse(readFileSync(configPath, "utf8"))?.secretKey;
  } catch {
    return; // no CLI config / unreadable
  }
  if (typeof secretKey !== "string" || !secretKey) return;
  try {
    await importWallet("cli", secretKey);
  } catch {
    /* bad key or a race created the store — leave it to the menu */
  }
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
      process.stdout.write(`${C.bold}${C.cyan}  tiny.place${C.reset}  ${C.dim}— open a ${ADAPTER.launch.displayHarness} session as an agent${C.reset}\n\n`);
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
      // In raw mode Ctrl+C/Ctrl+D arrive as bytes 0x03/0x04, NOT as SIGINT — treat
      // them as cancel so the terminal is restored and we exit cleanly (same as q/ESC).
      if (s === "\x03" || s === "\x04" || s === "" || s === "q") return finish(-1);
      // Arrow keys arrive as a full ESC sequence in one chunk (ESC "[" "A"/"B");
      // match that (not a bare "[A", which never occurs) plus vim j/k.
      if (s === "\x1b[A" || s === "\x1bOA" || s === "k") idx = (idx - 1 + items.length) % items.length;
      else if (s === "\x1b[B" || s === "\x1bOB" || s === "j") idx = (idx + 1) % items.length;
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

// ── launch the active harness with the plugin + chosen wallet ────────────────
// Harness-agnostic: the adapter's prepare() returns the {command, args, env} and
// performs any per-harness install step (e.g. Codex's isolated-home write). When
// the harness supports foreground-inject (any TUI harness), we ensure the session
// lives in a tmux pane so the daemon can wake it in-context on inbound DMs — this
// wrap is the SAME for Claude and Codex (it wraps whatever prepare() returned).

// A dedicated tmux socket so wrapped sessions stay out of the user's own tmux.
const TMUX_SOCKET = "tinyplace";
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function tmuxAvailable() {
  try {
    return spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

// Best-effort auto-install of tmux via the platform package manager. Returns true
// if tmux is available afterward. Each entry is [managerBinary, installArgv] — we
// probe the MANAGER (not sudo) so we never run e.g. `sudo apt-get` on a box that
// has sudo but not apt.
function installTmux() {
  const managers =
    process.platform === "darwin"
      ? [["brew", ["brew", "install", "tmux"]]]
      : [
          ["apt-get", ["sudo", "apt-get", "install", "-y", "tmux"]],
          ["dnf", ["sudo", "dnf", "install", "-y", "tmux"]],
          ["pacman", ["sudo", "pacman", "-S", "--noconfirm", "tmux"]],
        ];
  for (const [manager, [cmd, ...args]] of managers) {
    try {
      if (spawnSync(manager, ["--version"], { stdio: "ignore" }).status !== 0) continue; // manager absent
      process.stdout.write(`  ${C.dim}Installing tmux via ${cmd} ${args.join(" ")} …${C.reset}\n`);
      spawnSync(cmd, args, { stdio: "inherit" });
      if (tmuxAvailable()) return true;
    } catch {
      /* try next */
    }
  }
  return tmuxAvailable();
}

// Launch the prepared plan directly in the current terminal. Foreground-resolve
// still works when $TMUX is set (the current pane is injectable); otherwise
// inbound mail is answered by the isolated responder.
function launchDirect(plan) {
  const child = spawn(plan.command, plan.args, {
    stdio: "inherit",
    env: { ...process.env, ...plan.env },
  });
  child.on("error", (error) => {
    console.error(`\nCould not launch '${plan.command}': ${error.message}\n${ADAPTER.launch.notFoundHint ?? ""}`);
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

// Pick a free `tp-<wallet>[-N]` session name on our dedicated socket so each launch
// is its own harness instance (a distinct agent session → its own <harness>:N label).
function freeSessionName(walletName) {
  const base = `tp-${walletName}`;
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}-${n}`;
    if (spawnSync("tmux", ["-L", TMUX_SOCKET, "has-session", "-t", name], { stdio: "ignore" }).status !== 0) return name;
  }
}

// Wrap the launch in a tmux session on our dedicated socket, then attach. This
// makes the agent ALWAYS live in a tmux pane, so the daemon can TTY-inject inbound
// queries for the live session to resolve in-context — in ANY terminal, not just
// when the user happens to already run tmux. Harness-agnostic: it wraps whatever
// plan.command/args prepare() produced (Claude or Codex).
function launchWrapped(plan, walletName) {
  const name = freeSessionName(walletName);
  const S = ["-L", TMUX_SOCKET];
  // Carry the adapter's launch env into the SESSION environment via `-e` (not the
  // command line), so nothing lands in `ps`/tmux listings and each launch gets its
  // own env. plan.env is a curated non-secret config set (wallet secrets live in
  // wallets.json, never in env), so forwarding all of it is safe.
  const envFlags = [];
  for (const [k, v] of Object.entries(plan.env ?? {})) if (v != null) envFlags.push("-e", `${k}=${v}`);
  const cmd = [plan.command, ...plan.args].map(shq).join(" ");
  const created = spawnSync("tmux", [...S, "new-session", "-d", "-s", name, ...envFlags, cmd], { stdio: "inherit" });
  if (created.status !== 0) {
    process.stdout.write(`  ${C.dim}tmux wrap failed; launching directly (auto-replies use an isolated context).${C.reset}\n`);
    return launchDirect(plan);
  }
  // Make the wrap feel like a plain terminal + pass color through.
  for (const opt of [
    ["status", "off"],
    ["mouse", "on"],
    ["escape-time", "0"],
    ["default-terminal", "tmux-256color"],
  ]) {
    spawnSync("tmux", [...S, "set-option", "-g", ...opt], { stdio: "ignore" });
  }
  spawnSync("tmux", [...S, "set-option", "-ga", "terminal-overrides", ",*:Tc"], { stdio: "ignore" });
  const att = spawnSync("tmux", [...S, "attach-session", "-t", name], { stdio: "inherit" });
  process.exit(att.status ?? 0);
}

function launch(walletName, forwardedArgs) {
  clear();
  let plan;
  try {
    plan = ADAPTER.launch.prepare({
      pluginDir: PLUGIN_DIR,
      dataDir: DATA_DIR,
      apiUrl: API_URL,
      walletName,
      forwardedArgs,
      cwd: process.cwd(),
    });
  } catch (error) {
    console.error(`\nCould not prepare ${ADAPTER.launch.displayHarness}: ${error.message}`);
    process.exit(1);
  }
  process.stdout.write(`${C.green}▶${C.reset} launching ${ADAPTER.launch.displayHarness} as ${C.bold}${walletName}${C.reset} …\n\n`);
  // Harness doesn't support foreground-inject, or we're already inside tmux (the
  // current pane is injectable) → launch directly. Otherwise wrap so the daemon
  // can wake an idle session in-context; install tmux if missing.
  if (!canForegroundInject(ADAPTER) || process.env.TMUX) return launchDirect(plan);
  if (!tmuxAvailable()) {
    process.stdout.write(`  ${C.yellow}tmux not found${C.reset} — needed so the agent can answer inbound DMs in-context.\n`);
    // Only auto-install (a privileged `sudo`/brew step) when interactive and not
    // opted out — never from a scripted `--wallet`/CI invocation.
    const mayInstall = Boolean(process.stdout.isTTY) && !process.env.TINYPLACE_NO_AUTO_INSTALL;
    if (!mayInstall) {
      process.stdout.write(`  ${C.dim}Skipping tmux auto-install (non-interactive or TINYPLACE_NO_AUTO_INSTALL set); launching without it (auto-replies use an isolated context).${C.reset}\n`);
      return launchDirect(plan);
    }
    if (!installTmux()) {
      process.stdout.write(`  ${C.dim}Could not install tmux; launching without it (auto-replies use an isolated context).${C.reset}\n`);
      return launchDirect(plan);
    }
  }
  return launchWrapped(plan, walletName);
}

// The harnesses whose CLI is actually installed (on PATH). `spawnSync` sets `error`
// only when the binary can't be found, so a non-zero `--version` still counts.
function installedHarnesses() {
  return Object.entries(ADAPTERS)
    .filter(([, a]) => {
      try {
        return !spawnSync(a.launch.binary, ["--version"], { stdio: "ignore" }).error;
      } catch {
        return false;
      }
    })
    .map(([name, adapter]) => ({ name, adapter }));
}

// Pin the active harness for THIS launch (and the child, via env) and re-resolve the
// adapter + its per-harness data dir. Wallets are shared, so only sessions/signal move.
function selectHarness(name) {
  process.env.TINYPLACE_HARNESS = name;
  _resetAdapterCache();
  ADAPTER = activeAdapter();
  DATA_DIR = harnessDataDir(ADAPTER);
}

// After an identity is chosen, let the user pick which CLI to drive it with (Claude /
// Codex …) when more than one is installed and none was forced via --harness.
// Returns true if it launched (caller should return/exit), false if the user backed
// out (caller re-shows its menu). `launch()` takes over the terminal, so on a real
// launch control only returns here for the async launchDirect case.
async function chooseHarnessAndLaunch(walletName, forwardedArgs, { forced }) {
  const installed = installedHarnesses();
  if (forced || installed.length <= 1) {
    if (installed.length === 1) selectHarness(installed[0].name);
    launch(walletName, forwardedArgs);
    return true;
  }
  const pick = await menu(`Launch ${walletName} with which CLI?`, [
    ...installed.map((h) => ({ label: h.adapter.launch.displayHarness, hint: h.adapter.launch.binary })),
    { label: "← Back", hint: "" },
  ]);
  if (pick < 0 || pick >= installed.length) return false; // back → caller's menu loop
  selectHarness(installed[pick].name);
  launch(walletName, forwardedArgs);
  return true;
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

  // Everything after `--` is forwarded verbatim to the harness.
  const dashDash = argv.indexOf("--");
  const forwardedArgs = dashDash === -1 ? [] : argv.slice(dashDash + 1);
  const flags = dashDash === -1 ? argv : argv.slice(0, dashDash);

  // `--harness <name>` forces the adapter; fold it into env BEFORE resolving so
  // detectHarness() honors it (TINYPLACE_HARNESS is the built-in override).
  const harnessFlag = flags.indexOf("--harness");
  const harnessForced = harnessFlag !== -1 && Boolean(flags[harnessFlag + 1]);
  if (harnessForced) {
    process.env.TINYPLACE_HARNESS = flags[harnessFlag + 1];
  }

  // Resolve the active adapter + its data dir now that the override is in env.
  ADAPTER = activeAdapter();
  DATA_DIR = harnessDataDir(ADAPTER);

  // First-run: adopt the CLI's auto-minted wallet so `--wallet cli` and the menu
  // both see the identity created by the tinyplace CLI, not just plugin-created ones.
  await seedFromCliConfig();

  // Non-interactive fast path: `tinyplace-plugin --wallet alice`.
  const walletFlag = flags.indexOf("--wallet");
  if (walletFlag !== -1) {
    const name = flags[walletFlag + 1];
    if (!name || !loadWallets().some((w) => w.name === name)) {
      console.error(`No wallet named '${name ?? ""}'. Run 'tinyplace-plugin' with no args to create one.`);
      process.exit(1);
    }
    return launch(name, forwardedArgs);
  }

  if (!process.stdin.isTTY) {
    console.error("tinyplace-plugin: interactive menu needs a TTY. Use 'tinyplace-plugin --wallet <name>' in non-interactive contexts.");
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

    // A wallet row → pick the CLI (if >1 installed), then launch (this replaces the
    // process's terminal with the harness). "Back" from the CLI picker re-shows this.
    if (choice < wallets.length) {
      if (await chooseHarnessAndLaunch(wallets[choice].name, forwardedArgs, { forced: harnessForced })) return;
      continue;
    }

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
