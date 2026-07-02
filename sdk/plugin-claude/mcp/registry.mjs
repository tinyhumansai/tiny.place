// tiny.place session registry — presence files that record which sessions of an
// agent are live, so a peer (and, in Phase C, the per-agent daemon) can address
// and route to a specific session by label.
//
// Layout: ~/.tinyplace-claude/sessions/<agent-address>/<label>.json
//   { label, harnessSessionId, cwd, pid, startedAt, updatedAt }
//
// Liveness: a session is live if `now - updatedAt < LIVE_WINDOW` AND its pid is
// alive. Sessions heartbeat (rewrite updatedAt) on the poll tick. Stale files
// are ignored for routing and garbage-collected.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DATA_DIR = process.env.TINYPLACE_CLAUDE_HOME ?? join(homedir(), ".tinyplace-claude");
// A session is considered live within this window of its last heartbeat.
const LIVE_WINDOW_MS = Number(process.env.TINYPLACE_SESSION_LIVE_MS) || 30_000;

export function sessionsDir(agentAddress) {
  return join(DATA_DIR, "sessions", encodeURIComponent(String(agentAddress)));
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
//   3. the lowest-free `claude:<n>` among live sessions.
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
  for (let n = 1; ; n++) {
    const cand = `claude:${n}`;
    if (!liveLabels.has(cand)) return cand;
  }
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
