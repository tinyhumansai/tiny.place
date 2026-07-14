// tiny.place session registry — presence files that record which sessions of an
// agent are live, so a peer (and the per-agent daemon) can address and route to a
// specific session by label.
//
// Layout: <data-dir>/sessions/<agent-address>/<label>.json
//   { label, harnessSessionId, cwd, pid, startedAt, updatedAt }
// where <data-dir> is the active harness's data dir (~/.tinyplace-codex,
// ~/.tinyplace-claude, …) resolved at call time via the adapter.
//
// Liveness: a session is live if `now - updatedAt < LIVE_WINDOW` AND its pid is
// alive. Sessions heartbeat (rewrite updatedAt) on the poll tick. Stale files
// are ignored for routing and garbage-collected.
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, openSync, writeSync, closeSync } from "node:fs";
import { join } from "node:path";

import { activeAdapter, harnessDataDir } from "./harness.mjs";

// A session is considered live within this window of its last heartbeat.
const LIVE_WINDOW_MS = Number(process.env.TINYPLACE_SESSION_LIVE_MS) || 30_000;

// Durable per-session UUID — the reuse-proof binding key for conversations. A label
// (`claude:1`) is positional and can be inherited by a DIFFERENT session once its slot
// frees, which would misroute a bound thread to a stranger; a UUID is never reused.
// Keyed by the harness session id (stable across `claude --resume`) so a resumed
// session keeps its identity; when the harness exposes no session id we fall back to a
// process-stable random (still unique + non-reusable, just not stable across restart).
// One file per harness session id (not a shared blob), so concurrent first-writes
// for different sessions can't clobber each other's mapping. Exclusive-create CAS:
// on a race, the loser reads the winner's uuid.
function sessionUuidDir() {
  return join(harnessDataDir(), "session-uuids");
}
let processUuid = null;
export function resolveSessionUuid(harnessSessionId) {
  const hsid = (harnessSessionId ?? "").trim();
  if (!hsid) return (processUuid ??= randomUUID());
  const dir = sessionUuidDir();
  const path = join(dir, encodeURIComponent(hsid) + ".json");
  const existing = readEntryFile(path);
  if (existing?.uuid) return existing.uuid;
  const uuid = randomUUID();
  try {
    mkdirSync(dir, { recursive: true });
    const fd = openSync(path, "wx", 0o600); // CAS: first writer wins this hsid
    try {
      writeSync(fd, JSON.stringify({ uuid, harnessSessionId: hsid }) + "\n");
    } finally {
      closeSync(fd);
    }
  } catch (e) {
    if (e?.code === "EEXIST") return readEntryFile(path)?.uuid ?? uuid; // racer won — use theirs
    /* other write error → fall back to the freshly minted value for this process */
  }
  return uuid;
}

// Synchronous sleep (no async yield) so claimLabel's CAS retry is indivisible.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readEntryFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function sessionsDir(agentAddress) {
  return join(harnessDataDir(), "sessions", encodeURIComponent(String(agentAddress)));
}

function presenceFile(label) {
  return encodeURIComponent(String(label)) + ".json";
}

// process.kill(pid, 0) probes existence without signalling. EPERM means the
// process exists but is owned by another user (still alive).
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}

// A presence entry is live if its heartbeat is fresh AND its pid is alive.
export function isLive(entry, now = Date.now()) {
  if (!entry) return false;
  const updated = Date.parse(entry.updatedAt ?? "");
  if (!Number.isFinite(updated)) return false;
  if (now - updated >= LIVE_WINDOW_MS) return false;
  return pidAlive(entry.pid);
}

// Read every presence entry for an agent, each tagged with a computed `live`
// flag. Does not mutate the directory (use gcStale to prune).
export function readSessions(agentAddress) {
  const dir = sessionsDir(agentAddress);
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const now = Date.now();
  const out = [];
  for (const f of files) {
    let entry = null;
    try {
      entry = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch {
      entry = null;
    }
    if (entry && typeof entry.label === "string") out.push({ ...entry, live: isLive(entry, now) });
  }
  return out;
}

// Only the live sessions, sorted by label for stable presentation.
export function liveSessions(agentAddress) {
  return readSessions(agentAddress)
    .filter((e) => e.live)
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

// The primary (default routing target): the lowest-labelled live session.
export function primarySession(agentAddress) {
  return liveSessions(agentAddress)[0] ?? null;
}

// The label of the live session owning `uuid`, or null if that session isn't live —
// the reuse-proof "is the addressed session still up?" check. Because a UUID is never
// reused, a match is guaranteed to be the SAME session the peer was talking to.
export function labelForUuid(agentAddress, uuid) {
  if (!uuid) return null;
  return liveSessions(agentAddress).find((s) => s.sessionUuid === uuid)?.label ?? null;
}

// ── Conversation UUIDs (the wire-visible `wrapper_session_id`) ────────────────
// wrapper_session_id is a per-CONVERSATION id between two agents: a fresh uuid per
// (this session, peer) so peers can't correlate our sessions across conversations and
// each relationship is its own thread. It maps to the session's durable sessionUuid
// via a reverse index (option b), so an inbound reply addressed to the conversation
// uuid resolves to the live local session — reuse-proof end to end.
function convFwdDir() {
  return join(harnessDataDir(), "conversations", "fwd");
}
function convIdxDir() {
  return join(harnessDataDir(), "conversations", "idx");
}

// Mint (once) or fetch this session's conversation uuid for a peer. Idempotent per
// (sessionUuid, peer) via an exclusive-create CAS so concurrent first-sends agree on
// one uuid. On win, publishes the reverse index convUuid → sessionUuid for routing.
export function resolveConversationUuid(sessionUuid, peer) {
  if (!sessionUuid || !peer) return null;
  const fwd = convFwdDir();
  mkdirSync(fwd, { recursive: true });
  const fwdPath = join(fwd, encodeURIComponent(`${sessionUuid}|${peer}`) + ".json");
  const existing = readEntryFile(fwdPath);
  if (existing?.convUuid) return existing.convUuid;
  const convUuid = randomUUID();
  try {
    const fd = openSync(fwdPath, "wx", 0o600); // CAS: first writer wins the pairing
    try {
      writeSync(fd, JSON.stringify({ convUuid, sessionUuid, peer }) + "\n");
    } finally {
      closeSync(fd);
    }
  } catch (e) {
    if (e?.code === "EEXIST") return readEntryFile(fwdPath)?.convUuid ?? null; // a racer won — use theirs
    throw e;
  }
  try {
    mkdirSync(convIdxDir(), { recursive: true });
    writeFileSync(join(convIdxDir(), encodeURIComponent(convUuid) + ".json"), JSON.stringify({ sessionUuid, peer }) + "\n", { mode: 0o600 });
  } catch {
    /* best-effort — inbound routing falls back to label if the index is missing */
  }
  return convUuid;
}

// Adopt a conversation id we did NOT mint — one the PEER opened (their
// wrapper_session_id) — binding it to the local session now handling the thread.
// Writes only the reverse index (convUuid → {sessionUuid, peer}); it deliberately
// does NOT touch the forward `sessionUuid|peer → convUuid` map, so a session can own
// multiple thread ids for the same peer (each id is one thread) and the forward map
// keeps naming the id WE'd mint for a fresh thread. Idempotent: never clobbers an
// existing binding (the minter/first adopter wins), so re-adoption on every reply is a
// cheap no-op. Best-effort — inbound routing falls back to policy if the write fails.
export function bindConversationUuid(convUuid, sessionUuid, peer) {
  if (!convUuid || !sessionUuid || !peer) return;
  const path = join(convIdxDir(), encodeURIComponent(convUuid) + ".json");
  try {
    mkdirSync(convIdxDir(), { recursive: true });
    const fd = openSync(path, "wx", 0o600); // CAS: create only if absent — first owner wins
    try {
      writeSync(fd, JSON.stringify({ sessionUuid, peer }) + "\n");
    } finally {
      closeSync(fd);
    }
  } catch (e) {
    if (e?.code === "EEXIST") return; // already bound — keep the first owner (idempotent)
    /* best-effort otherwise — inbound routing falls back to policy if the write fails */
  }
}

// Reverse: the sessionUuid that owns a conversation uuid (or null for an unknown one).
export function sessionUuidForConversation(convUuid) {
  if (!convUuid) return null;
  return readEntryFile(join(convIdxDir(), encodeURIComponent(convUuid) + ".json"))?.sessionUuid ?? null;
}

// The label of the LIVE local session owning a conversation uuid, or null. Resolves
// convUuid → sessionUuid (index) → live session (presence). The conversation uuid IS
// the per-pair session id: a peer (including OpenHuman) that addresses a reply by the
// id we minted for the pair resolves straight back to the owning local session.
export function labelForConversationUuid(agentAddress, convUuid) {
  return labelForUuid(agentAddress, sessionUuidForConversation(convUuid));
}

// Remove stale (non-live) presence files. Best-effort.
export function gcStale(agentAddress) {
  const dir = sessionsDir(agentAddress);
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  const now = Date.now();
  for (const f of files) {
    try {
      const entry = JSON.parse(readFileSync(join(dir, f), "utf8"));
      if (!isLive(entry, now)) rmSync(join(dir, f));
    } catch {
      // Unreadable/garbage file — remove it.
      try {
        rmSync(join(dir, f));
      } catch {
        /* best-effort */
      }
    }
  }
}

// Choose a label for a session. Preference order:
//   1. an explicitly requested label, if not held by a live session,
//   2. the most-recent prior label for the SAME harnessSessionId (stable across
//      restarts), unless another live session now holds it,
//   3. the lowest-free `<harness>:<n>` among live sessions (codex:n / claude:n).
export function allocateLabel(agentAddress, { requested, harnessSessionId } = {}) {
  const all = readSessions(agentAddress);
  const liveLabels = new Set(all.filter((e) => e.live).map((e) => e.label));
  const req = requested?.trim();
  if (req && !liveLabels.has(req)) return req;
  if (harnessSessionId) {
    const mine = all
      .filter((e) => e.harnessSessionId && e.harnessSessionId === harnessSessionId)
      .sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0))[0];
    if (mine) {
      const takenByOther = all.some((e) => e.live && e.label === mine.label && e.harnessSessionId !== harnessSessionId);
      if (!takenByOther) return mine.label;
    }
  }
  const prefix = activeAdapter().sessionLabelPrefix;
  for (let n = 1; ; n++) {
    const cand = `${prefix}:${n}`;
    if (!liveLabels.has(cand)) return cand;
  }
}

// Atomically allocate a label AND create this session's presence file in one
// step. Allocating then writing separately races: two sessions starting at once
// could both pick the same free `<harness>:n` before either file exists, and the
// second write would orphan the first. Here the exclusive create (wx) is the
// CAS — on collision we either reclaim our own/stale file or allocate the next
// free label and retry. Returns the presence entry (label + metadata).
export function claimLabel(agentAddress, { requested, harnessSessionId, cwd, startedAt } = {}) {
  const dir = sessionsDir(agentAddress);
  mkdirSync(dir, { recursive: true });
  let req = requested;
  for (let attempt = 0; attempt < 128; attempt++) {
    const label = allocateLabel(agentAddress, { requested: req, harnessSessionId });
    const path = join(dir, presenceFile(label));
    const now = new Date().toISOString();
    const entry = {
      label,
      harnessSessionId: harnessSessionId ?? "",
      cwd: cwd ?? "",
      pid: process.pid,
      // Durable, reuse-proof binding key (see resolveSessionUuid). The label above is
      // the friendly display handle; this is what a bound conversation routes on.
      sessionUuid: resolveSessionUuid(harnessSessionId),
      // tmux pane + server socket hosting this session's TUI, so the daemon/listener
      // can inject a trigger keystroke into the live session (foreground-resolve).
      // tmuxPane "" = not in a tmux pane (headless) → callers fall back to the
      // isolated responder. tmuxSocket is the `-S` path from $TMUX (first field),
      // needed because the launcher wraps plain terminals in a DEDICATED tmux
      // socket, so `send-keys` must target that server, not the default one.
      // Harness-agnostic: any TUI harness launched inside tmux records these.
      tmuxPane: process.env.TMUX_PANE ?? "",
      tmuxSocket: (process.env.TMUX ?? "").split(",")[0],
      startedAt: startedAt ?? now,
      updatedAt: now,
    };
    try {
      const fd = openSync(path, "wx", 0o600); // exclusive create — the CAS
      try { writeSync(fd, JSON.stringify(entry) + "\n"); } finally { closeSync(fd); }
      return entry;
    } catch (e) {
      if (e?.code !== "EEXIST") throw e;
      // Tolerate a racer mid-create (empty/partial file): re-read briefly before
      // deciding it's reclaimable, so we never clobber a winner's in-flight file.
      let existing = readEntryFile(path);
      for (let i = 0; existing === null && i < 6; i++) { sleepSync(5); existing = readEntryFile(path); }
      if ((harnessSessionId && existing?.harnessSessionId === harnessSessionId) || !isLive(existing)) {
        // Our own prior file, or a dead/corrupt leftover → reclaim it. Pin the
        // request to THIS exact label so the retry re-targets it (not a sibling
        // stale file that shares our harnessSessionId).
        try { rmSync(path); } catch { /* raced */ }
        req = label;
        continue;
      }
      // A live foreigner won this label in the race — allocate the next one.
      // Drop an explicit request pinned to the taken label so we don't spin.
      if (req && req.trim() === label) req = undefined;
    }
  }
  // Retry budget exhausted (a pathological amount of contention). Fail fast
  // rather than a non-atomic write that could clobber a live session's file —
  // the caller can retry session start.
  throw new Error(`Unable to atomically claim a session label for ${agentAddress}; retry session start.`);
}

// Write (or refresh) this process's presence file. Called on adopt and on every
// heartbeat tick — the write itself refreshes updatedAt.
export function writePresence(agentAddress, { label, harnessSessionId, cwd, startedAt }) {
  const dir = sessionsDir(agentAddress);
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const entry = {
    label,
    harnessSessionId: harnessSessionId ?? "",
    cwd: cwd ?? "",
    pid: process.pid,
    sessionUuid: resolveSessionUuid(harnessSessionId), // durable binding key (see claimLabel)
    // See claimLabel: the pane/socket the daemon injects into for foreground-resolve.
    tmuxPane: process.env.TMUX_PANE ?? "",
    tmuxSocket: (process.env.TMUX ?? "").split(",")[0],
    startedAt: startedAt ?? now,
    updatedAt: now,
  };
  writeFileSync(join(dir, presenceFile(label)), JSON.stringify(entry) + "\n", { mode: 0o600 });
  return entry;
}

// Remove this session's presence file (on switch/teardown). Best-effort.
export function removePresence(agentAddress, label) {
  try {
    rmSync(join(sessionsDir(agentAddress), presenceFile(label)));
  } catch {
    /* already gone */
  }
}
