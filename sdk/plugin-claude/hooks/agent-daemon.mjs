#!/usr/bin/env node
// Per-agent daemon: the single process that owns the relay drain + Signal ratchet
// for one agent. Started lazily by an MCP server on `use` when no live daemon
// exists (lock CAS in mcp/daemon-lock.mjs). Responsibilities:
//   - drain the cryptoId mailbox (decrypt + ack ONCE — the sole decryptor),
//   - route each inbound message to the right session's inbox by tp.to_session,
//   - send outbound jobs sessions drop in _outbox (the sole ratchet writer),
//   - trigger the auto-responder for idle sessions,
//   - idle-exit + release the lock when the agent has no live sessions.
//
// Env: TINYPLACE_DAEMON_WALLET (required) — the wallet name to serve.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TinyPlaceClient, LocalSigner } from "@tinyhumansai/tinyplace";
import { FileSessionStore } from "@tinyhumansai/tinyplace/node";
import { sendMessage, readMessages, publishKeys } from "@tinyhumansai/tinyplace/agent";

import { buildEnvelope, decodeBody } from "../mcp/format.mjs";
import { liveSessions } from "../mcp/registry.mjs";
import { enqueueRouted, redeliverUnrouted } from "../mcp/routing.mjs";
import { claimOutboxJobs } from "../mcp/outbox.mjs";
import { acquireLock, heartbeatLock, releaseLock } from "../mcp/daemon-lock.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(HERE);
const DATA_DIR = process.env.TINYPLACE_CLAUDE_HOME ?? join(homedir(), ".tinyplace-claude");
const WALLETS_FILE = join(DATA_DIR, "wallets.json");
const SIGNAL_DIR = join(DATA_DIR, "signal");
const QUEUE_DIR = join(DATA_DIR, "queue");
const BASE_URL =
  process.env.TINYPLACE_API_URL ?? process.env.TINYPLACE_ENDPOINT ?? "https://staging-api.tiny.place";

const POLL_INTERVAL_MS = Number(process.env.TINYPLACE_DAEMON_POLL_MS) || 3000;
const HEARTBEAT_MS = Number(process.env.TINYPLACE_DAEMON_HEARTBEAT_MS) || 10000;
const IDLE_MS = Number(process.env.TINYPLACE_DAEMON_IDLE_MS) || 60000;
// Re-handshake ping body (mirrors the server's RESET_SENTINEL) — consumed silently.
const RESET_SENTINEL = String.fromCharCode(1) + "tp-rehandshake" + String.fromCharCode(1);

const walletName = process.env.TINYPLACE_DAEMON_WALLET?.trim();
if (!walletName) {
  console.error("agent-daemon: TINYPLACE_DAEMON_WALLET is required");
  process.exit(1);
}

function loadWallet(name) {
  try {
    const parsed = JSON.parse(readFileSync(WALLETS_FILE, "utf8"));
    const list = Array.isArray(parsed?.wallets) ? parsed.wallets : [];
    return list.find((w) => w.name === name) ?? null;
  } catch {
    return null;
  }
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const wallet = loadWallet(walletName);
if (!wallet) {
  console.error(`agent-daemon: no wallet named '${walletName}'`);
  process.exit(1);
}
const AGENT = wallet.address;
const lockInfo = { wallet: walletName, startedAt: new Date().toISOString() };

// CAS for single ownership. If a live daemon already owns the agent, stand down.
if (!acquireLock(AGENT, lockInfo)) {
  process.exit(0);
}

let signer, client, store;
try {
  signer = await LocalSigner.fromSeed(hexToBytes(wallet.secretKey));
  const storePath = FileSessionStore.defaultPath(signer.publicKeyBase64, SIGNAL_DIR);
  store = new FileSessionStore(storePath, await signer.getX25519KeyPair());
  client = new TinyPlaceClient({ baseUrl: BASE_URL, signer, encryption: { store } });
} catch (e) {
  console.error("agent-daemon: failed to build client:", e?.message ?? e);
  releaseLock(AGENT);
  process.exit(1);
}

try { await publishKeys(client, signer); } catch { /* best-effort; retried by sessions */ }

// ── auto-responder enqueue (idle fallback) ───────────────────────────────────
const autorespondOff = process.env.TINYPLACE_AUTORESPOND === "off";
function enqueueForAutoResponse(msg) {
  try {
    const dir = join(QUEUE_DIR, encodeURIComponent(AGENT));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${encodeURIComponent(String(msg.id))}.json`),
      JSON.stringify({ id: msg.id, from: msg.from, text: msg.text, fromSession: msg.fromSession ?? null, role: msg.role ?? null, inReplyTo: msg.inReplyTo ?? null, ts: msg.ts }) + "\n",
      { mode: 0o600 },
    );
  } catch { /* non-fatal */ }
}
let dispatchPending = false;
function maybeSpawnResponder() {
  if (autorespondOff || dispatchPending) return;
  dispatchPending = true;
  setTimeout(() => {
    dispatchPending = false;
    try {
      spawn("node", [join(PLUGIN_ROOT, "hooks", "dispatch.mjs")], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, TINYPLACE_DISPATCH_ADDRESS: AGENT, TINYPLACE_DISPATCH_WALLET: walletName },
      }).unref();
    } catch { /* Stop hook remains a backup */ }
  }, 250);
}

// ── inbound loop (the only relay drain) ──────────────────────────────────────
let draining = false;
async function drainInbound() {
  if (draining) return;
  draining = true;
  try {
    const messages = await readMessages(client, signer);
    let enqueuedAny = false;
    for (const raw of messages) {
      const { auto, inReplyTo, text, messageId, fromSession, role, toSession } = decodeBody(raw.text);
      if (text === RESET_SENTINEL) continue; // handshake ping — consumed on decrypt
      // Correlate on the in-body envelope id when present, else the relay id.
      const id = messageId ?? raw.id;
      const decoded = { id, from: raw.from, fromSession, role, text, inReplyTo, toSession, ts: raw.timestamp ?? new Date().toISOString() };
      enqueueRouted(AGENT, decoded);
      // Auto-responder: answer non-auto messages when a session is idle (loop
      // guard: an auto-tagged reply is never itself enqueued for a response).
      if (!auto) { enqueueForAutoResponse(decoded); enqueuedAny = true; }
    }
    if (enqueuedAny) maybeSpawnResponder();
  } catch { /* relay hiccup — retry next tick */ } finally {
    draining = false;
  }
}

// ── outbound loop (the only ratchet writer) ──────────────────────────────────
const contactRequested = new Set(); // peers we've already sent a contact request to
async function drainOutbound() {
  const jobs = claimOutboxJobs(AGENT);
  for (const { job, done, fail } of jobs) {
    try {
      const { body } = buildEnvelope({
        messageId: job.id,
        text: job.text,
        role: job.role,
        toSession: job.toSession,
        inReplyTo: job.inReplyTo,
        auto: job.auto,
        fromSession: job.fromSession,
        harnessSessionId: job.harnessSessionId,
        agentAddress: AGENT,
        cwd: job.cwd,
      });
      await sendMessage(client, signer, job.to, body);
      done();
    } catch (e) {
      // Contact-gate: request the contact once, then leave the job queued so it
      // delivers as soon as the peer accepts. Other failures also re-queue.
      if (e?.status === 403 && !contactRequested.has(job.to)) {
        contactRequested.add(job.to);
        try { await client.contacts.request(job.to); } catch { /* best-effort */ }
      }
      fail();
    }
  }
}

// ── liveness / idle exit ─────────────────────────────────────────────────────
let lastLive = Date.now();
function checkIdle() {
  const live = liveSessions(AGENT);
  if (live.length > 0) { lastLive = Date.now(); return false; }
  return Date.now() - lastLive >= IDLE_MS;
}

let stopped = false;
function shutdown(code = 0) {
  if (stopped) return;
  stopped = true;
  clearInterval(pollTimer);
  clearInterval(heartbeatTimer);
  try { ws?.close(); } catch { /* ignore */ }
  releaseLock(AGENT);
  process.exit(code);
}

// WebSocket doorbell for near-real-time inbound (poll is the guarantee).
let ws = null;
try {
  ws = client.inbox.stream();
  if (ws) {
    ws.on("message", () => { void drainInbound(); });
    ws.connect().catch(() => {});
  }
} catch { /* poll-only */ }

const pollTimer = setInterval(() => {
  void (async () => {
    redeliverUnrouted(AGENT);
    await drainInbound();
    await drainOutbound();
    if (checkIdle()) shutdown(0);
  })();
}, POLL_INTERVAL_MS);

const heartbeatTimer = setInterval(() => {
  if (!heartbeatLock(AGENT, lockInfo)) shutdown(0); // lost ownership — stand down
}, HEARTBEAT_MS);

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => shutdown(0));

// Kick an immediate cycle so a just-started session sees prompt service.
void (async () => { await drainOutbound(); await drainInbound(); })();
