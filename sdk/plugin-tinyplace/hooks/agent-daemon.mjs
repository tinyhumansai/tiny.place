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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TinyPlaceClient, LocalSigner } from "@tinyhumansai/tinyplace";
import { FileSessionStore } from "@tinyhumansai/tinyplace/node";
import { sendMessage, readMessages, publishKeys } from "@tinyhumansai/tinyplace/agent";

import { buildEnvelope, decodeBody } from "../mcp/format.mjs";
import { liveSessions, resolveConversationUuid, sessionUuidForConversation } from "../mcp/registry.mjs";
import {
  DEFAULT_CAPABILITIES,
  buildSessionInfoEnvelope,
  gitInfo,
  loadEmitted,
  ownerAddress,
  persistEmitted,
  planSessionInfoEmit,
  sessionTitle,
} from "../mcp/session-info.mjs";
import { enqueueRouted, redeliverUnrouted, reapClosedTargets } from "../mcp/routing.mjs";
import { claimOutboxJobs, writeOutboxJob } from "../mcp/outbox.mjs";
import { acquireLock, heartbeatLock, releaseLock } from "../mcp/daemon-lock.mjs";
import { isCryptoId, toCryptoId } from "../mcp/address.mjs";
import { harnessDataDir } from "../mcp/harness.mjs";
import { foregroundInject } from "../mcp/foreground-inject.mjs";
import { loadWallets } from "../mcp/wallets.mjs";

// Survive transient relay errors — a stray unhandled rejection must not kill the
// single per-agent daemon (it owns the ratchet); the poll loop retries next tick.
process.on("unhandledRejection", (reason) => {
  try { process.stderr.write(`tinyplace-daemon: unhandledRejection: ${reason?.stack ?? reason}\n`); } catch {}
});
process.on("uncaughtException", (err) => {
  try { process.stderr.write(`tinyplace-daemon: uncaughtException: ${err?.stack ?? err}\n`); } catch {}
});

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(HERE);
// Data dir for the active harness (env override wins) — the daemon serves ONE
// harness's agent; harnessDataDir() reads the adapter's env + default.
const DATA_DIR = harnessDataDir();
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
  return loadWallets().find((w) => w.name === name) ?? null; // shared, CLI-independent store
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
      JSON.stringify({ id: msg.id, from: msg.from, text: msg.text, fromSession: msg.fromSession ?? null, toSession: msg.toSession ?? null, role: msg.role ?? null, inReplyTo: msg.inReplyTo ?? null, ts: msg.ts }) + "\n",
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
    // Group pending (non-auto) mail by the session label it was ROUTED to, so we
    // wake the RIGHT session's pane — a DM addressed to to_session=claude:2 must
    // wake claude:2, not whichever pane happens to be first. Mail with no live
    // target (unrouted/held) can't be woken, so it takes the isolated responder
    // directly — a fully-headless agent (daemon only, no live session) keeps
    // auto-replying, and the held copy is redelivered when a target comes live.
    const pendingByLabel = new Map(); // label -> [decoded]
    let headlessPending = false;
    for (const raw of messages) {
      const { auto, inReplyTo, text, messageId, fromSession, fromSessionUuid, role, toSession } = decodeBody(raw.text);
      if (text === RESET_SENTINEL) continue; // handshake ping — consumed on decrypt
      // Correlate on the in-body envelope id when present, else the relay id.
      const id = messageId ?? raw.id;
      // Carry the conversation uuids so enqueueRouted can do reuse-proof routing and
      // held/closed mail keeps the sender's conversation id for the notice.
      const decoded = { id, from: raw.from, fromSession, fromSessionUuid, role, text, inReplyTo, toSession, ts: raw.timestamp ?? new Date().toISOString() };
      const { target } = enqueueRouted(AGENT, decoded); // route to the session inbox(es)
      // Non-auto messages need a reply (loop guard: an auto-tagged reply is never
      // itself answered).
      if (auto || autorespondOff) continue;
      if (target.kind === "session") {
        for (const label of target.labels) {
          if (!pendingByLabel.has(label)) pendingByLabel.set(label, []);
          pendingByLabel.get(label).push(decoded);
        }
      } else if (!decoded.toSession && !(decoded.fromSessionUuid && sessionUuidForConversation(decoded.fromSessionUuid))) {
        // Truly untargeted (no toSession label, and the shared id — if any — is one we
        // never minted, i.e. a brand-new thread) + no live session → isolated
        // responder (headless agent still auto-replies).
        enqueueForAutoResponse(decoded);
        headlessPending = true;
      }
      // else: addressed to a SPECIFIC session that isn't live → held (unrouted).
      // Don't isolated-respond — a stranger context must not answer a thread bound
      // to a now-closed session. It's either redelivered if that session returns
      // within the grace window, or reaped into a "session closed" notice.
    }
    // Foreground-preferred: inject a trigger into EACH routed session's own tmux
    // pane so the real agent drains its inbox and replies IN-CONTEXT. A routed
    // session with no pane (headless surface) falls back to the isolated responder
    // — so for any given message exactly one path fires (no double-reply).
    for (const [label, msgs] of pendingByLabel) {
      if (!foregroundInject(AGENT, msgs, { label }).injected) {
        for (const d of msgs) enqueueForAutoResponse(d);
        headlessPending = true;
      }
    }
    if (headlessPending) maybeSpawnResponder();
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
        conversationUuid: job.conversationUuid,
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
      // delivers as soon as the peer accepts. The contacts API is keyed by the
      // base58 cryptoId, so resolve @handle/base64-key first (a raw job.to would
      // silently fail). Other failures also re-queue.
      if (e?.status === 403 && !contactRequested.has(job.to)) {
        contactRequested.add(job.to);
        try { await client.contacts.request(await toCryptoId(client, job.to)); } catch { /* best-effort */ }
      }
      fail();
    }
  }
}

// ── session_info emit (contact-gated intro) ──────────────────────────────────
// Announce each live session to the agent's owner (the OpenHuman "Master") the
// moment it inits, so the owner registers + renders the session before it acts.
// A single relationship (contacts are per-identity) covers ALL sessions, so this
// sends ONE contact request per identity, then flushes one session_info per
// pending session on accept. See mcp/session-info.mjs + spec §3. Feature is OFF
// (pure no-op) unless TINYPLACE_OWNER_ADDRESS names the owner.
const OWNER_RAW = ownerAddress();
// Read once: plugin version (harness_version) + the agent's @handle (best-effort).
let pluginVersion = "";
try {
  pluginVersion = JSON.parse(readFileSync(join(PLUGIN_ROOT, "package.json"), "utf8"))?.version ?? "";
} catch { /* omit harness_version */ }
let agentHandle = null; // "@name" or null; resolved lazily on first service tick
let ownerCryptoId; // undefined = unresolved, null = unresolvable, else the cryptoId
let ownerContactRequested = false; // one contact_add per identity (never per session)
let prekeyBackoffUntil = 0; // contact-accepted ≠ messageable: back off until prekeys land
let prekeyBackoffMs = 0;
const sessionInfoSent = new Set(); // sessionUuids announced THIS daemon run
const priorEmitted = loadEmitted(AGENT); // announced in a PRIOR run → re-emit resumed:true
let sessionInfoBusy = false;

// The owner has a usable prekey bundle (so a first DM can run X3DH). getBundle
// 404s when none is provisioned yet — the resolve-then-404 gap — so a throw here
// means "not messageable yet, back off". A resolved bundle means go.
async function ownerMessageable(owner) {
  try {
    const bundle = await client.keys.getBundle(owner);
    return !!(bundle && bundle.identityKey && bundle.signedPreKey);
  } catch {
    return false;
  }
}

async function serviceSessionInfo() {
  if (!OWNER_RAW || sessionInfoBusy) return;
  const live = liveSessions(AGENT).filter((s) => s.sessionUuid);
  if (live.length === 0) return; // nothing to announce yet
  // Compute the pending set BEFORE any network call so steady-state (every live
  // session already announced this run) is a pure no-op — no per-tick relay chatter.
  const plans = planSessionInfoEmit({
    liveSessionUuids: live.map((s) => s.sessionUuid),
    priorEmitted,
    sentThisRun: sessionInfoSent,
  });
  if (plans.length === 0) return;
  sessionInfoBusy = true;
  try {
    if (ownerCryptoId === undefined) {
      // toCryptoId returns the original @handle unchanged when a directory lookup
      // fails (owner not registered yet / transient), so only CACHE a real base58
      // id; otherwise leave it unresolved and retry next tick.
      let resolved;
      try { resolved = await toCryptoId(client, OWNER_RAW); } catch { return; }
      if (!isCryptoId(resolved)) return; // not resolvable yet — retry next tick
      ownerCryptoId = resolved;
    }
    const owner = ownerCryptoId;

    // Contact gate: request once, then wait for the owner to accept.
    let status;
    try { status = (await client.contacts.status(owner))?.status; } catch { return; }
    if (status !== "accepted") {
      if (!ownerContactRequested) {
        ownerContactRequested = true;
        try { await client.contacts.request(owner); } catch { ownerContactRequested = false; }
      }
      return; // REQUESTED — flush deferred until accept
    }

    // Prekey presence (accepted ≠ messageable) with exponential backoff.
    if (Date.now() < prekeyBackoffUntil) return;
    if (!(await ownerMessageable(owner))) {
      prekeyBackoffMs = Math.min(prekeyBackoffMs ? prekeyBackoffMs * 2 : POLL_INTERVAL_MS, 60_000);
      prekeyBackoffUntil = Date.now() + prekeyBackoffMs;
      return;
    }
    prekeyBackoffMs = 0;
    prekeyBackoffUntil = 0;

    // Resolve the agent's own @handle once (UI metadata; best-effort).
    if (agentHandle === null) {
      try {
        const card = await client.directory.getAgent(AGENT);
        if (card?.username) agentHandle = `@${card.username}`;
      } catch { /* omit handle */ }
    }

    // FLUSH: one session_info per pending session (resumed:false fresh /
    // resumed:true on reconnect). Mark sent only on a successful send so a
    // transient failure retries next tick.
    let sentAny = false;
    for (const plan of plans) {
      const session = live.find((s) => s.sessionUuid === plan.sessionUuid);
      if (!session) continue;
      const convUuid = resolveConversationUuid(plan.sessionUuid, owner);
      const { repo, branch } = await gitInfo(session.cwd);
      const body = buildSessionInfoEnvelope({
        agentAddress: AGENT,
        wrapperSessionId: convUuid,
        harnessSessionId: session.harnessSessionId,
        cwd: session.cwd,
        label: session.label,
        handle: agentHandle ?? undefined,
        title: sessionTitle({ cwd: session.cwd, branch, repo, label: session.label }),
        repo: repo ?? undefined,
        branch: branch ?? undefined,
        harnessVersion: pluginVersion || undefined,
        capabilities: DEFAULT_CAPABILITIES,
        resumed: plan.resumed,
        seq: plan.seq,
        startedAt: session.startedAt,
      });
      try {
        await sendMessage(client, signer, owner, body);
        sessionInfoSent.add(plan.sessionUuid);
        priorEmitted.add(plan.sessionUuid);
        sentAny = true;
      } catch {
        // 403 (contact race) / transient / resolve-then-404 — retry next tick.
      }
    }
    // Persist once per flush (not per send). Prune to currently-live sessions so
    // the record stays bounded — a dead session never needs a resumed re-emit
    // (a resumed harness keeps its sessionUuid and is live again on restart).
    if (sentAny) {
      const liveSet = new Set(live.map((s) => s.sessionUuid));
      for (const uuid of priorEmitted) if (!liveSet.has(uuid)) priorEmitted.delete(uuid);
      persistEmitted(AGENT, priorEmitted);
    }
  } finally {
    sessionInfoBusy = false;
  }
}

// ── closed-session notices ───────────────────────────────────────────────────
// A message addressed to a specific session (to_session) that never came (back)
// live within the grace window is abandoned. Send the sender ONE auto-tagged
// "session closed" notice, correlated by in_reply_to so a synchronous await/
// check_reply resolves instead of hanging, then terminate (reap already dropped the
// held copy). auto:true is the loop guard — the peer never answers this notice.
function notifyClosedTargets() {
  for (const p of reapClosedTargets(AGENT)) {
    writeOutboxJob(AGENT, {
      id: `sysclosed-${p.id}`,
      to: p.from,
      toSession: p.fromSession ?? null, // back to the sender's originating session
      // Reuse the sender's thread id as OUR wrapper_session_id (single shared id), so
      // the notice threads into the conversation they opened.
      conversationUuid: p.fromSessionUuid ?? null,
      role: "system",
      text: `The session${p.toSession ? ` "${p.toSession}"` : ""} you addressed is no longer active; your message was not delivered. Start a new message to reach this agent.`,
      inReplyTo: p.id,
      auto: true,
      fromSession: "system",
    });
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
    redeliverUnrouted(AGENT); // deliver held mail to sessions that just came live
    await drainInbound();
    notifyClosedTargets(); // reap+notify mail bound to a session that stayed gone
    await drainOutbound(); // sends the notices just enqueued
    await serviceSessionInfo(); // announce new/reconnected sessions to the owner
    if (checkIdle()) shutdown(0);
  })();
}, POLL_INTERVAL_MS);

const heartbeatTimer = setInterval(() => {
  if (!heartbeatLock(AGENT, lockInfo)) shutdown(0); // lost ownership — stand down
}, HEARTBEAT_MS);

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => shutdown(0));

// Kick an immediate cycle so a just-started session sees prompt service.
void (async () => { await drainOutbound(); await drainInbound(); await serviceSessionInfo(); })();
