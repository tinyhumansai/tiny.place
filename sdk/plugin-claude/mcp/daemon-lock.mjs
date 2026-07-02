// Per-agent daemon lock — ensures exactly one process owns the relay drain +
// Signal ratchet for an agent. Lock file: ~/.tinyplace-claude/daemon/<agent>.lock
// = { pid, wallet, startedAt, updatedAt }. Acquire is a compare-and-set on an
// atomic O_EXCL create; a stale lock (dead pid or expired heartbeat) is stolen.
import { mkdirSync, writeFileSync, readFileSync, rmSync, openSync, closeSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Synchronous sleep (no async yield) so acquireLock's CAS retry stays a single
// indivisible operation from the caller's perspective.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const DATA_DIR = process.env.TINYPLACE_CLAUDE_HOME ?? join(homedir(), ".tinyplace-claude");
const DAEMON_DIR = join(DATA_DIR, "daemon");
// A daemon is considered alive within this window of its last lock heartbeat.
const LOCK_WINDOW_MS = Number(process.env.TINYPLACE_DAEMON_LOCK_MS) || 30_000;

export function lockPath(agentAddress) {
  return join(DAEMON_DIR, encodeURIComponent(String(agentAddress)) + ".lock");
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}

export function readLock(agentAddress) {
  try {
    return JSON.parse(readFileSync(lockPath(agentAddress), "utf8"));
  } catch {
    return null;
  }
}

// A lock is live if its heartbeat is fresh AND its pid is alive.
export function isDaemonLive(lock, now = Date.now()) {
  if (!lock) return false;
  const updated = Date.parse(lock.updatedAt ?? "");
  if (!Number.isFinite(updated)) return false;
  if (now - updated >= LOCK_WINDOW_MS) return false;
  return pidAlive(lock.pid);
}

export function daemonLive(agentAddress) {
  return isDaemonLive(readLock(agentAddress));
}

function lockBody(info) {
  const now = new Date().toISOString();
  return JSON.stringify({
    pid: process.pid,
    wallet: info?.wallet ?? "",
    startedAt: info?.startedAt ?? now,
    updatedAt: now,
  });
}

function writeLock(agentAddress, info) {
  writeFileSync(lockPath(agentAddress), lockBody(info), { mode: 0o600 });
}

// Try to become the agent's daemon. Returns true if this process now owns the
// lock, false if a LIVE daemon already holds it. The O_EXCL create is the CAS —
// content is written into the exclusive fd so the file is never empty-then-
// readable; a loser that sees a mid-create (empty) file re-reads briefly rather
// than deleting it, so it can't clobber the winner. A genuinely stale lock (dead
// pid / expired heartbeat / corrupt leftover) is stolen and the create retried.
export function acquireLock(agentAddress, info) {
  mkdirSync(DAEMON_DIR, { recursive: true });
  const path = lockPath(agentAddress);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(path, "wx", 0o600); // atomic create-exclusive
      try { writeSync(fd, lockBody(info)); } finally { closeSync(fd); }
      return true;
    } catch (e) {
      if (e?.code !== "EEXIST") throw e;
      let cur = readLock(agentAddress);
      // Tolerate a racer mid-create (empty/partial file): re-read briefly before
      // deciding it's stealable, so we never delete a winner's in-flight lock.
      for (let i = 0; cur === null && i < 6; i++) { sleepSync(5); cur = readLock(agentAddress); }
      if (cur && cur.pid === process.pid) { writeLock(agentAddress, info); return true; }
      if (isDaemonLive(cur)) return false; // a live daemon owns it
      // Stale or corrupt leftover — steal and retry the exclusive create.
      try { rmSync(path); } catch { /* raced with another stealer */ }
    }
  }
  // Someone else won the steal race; treat them as the owner.
  return false;
}

// Refresh our heartbeat. Returns false if we lost ownership (another daemon took
// over) — the caller should then stand down.
export function heartbeatLock(agentAddress, info) {
  const cur = readLock(agentAddress);
  if (cur && cur.pid !== process.pid && isDaemonLive(cur)) return false;
  try {
    writeLock(agentAddress, info);
    return true;
  } catch {
    return false;
  }
}

export function releaseLock(agentAddress) {
  const cur = readLock(agentAddress);
  if (cur && cur.pid !== process.pid) return; // not ours
  try { rmSync(lockPath(agentAddress)); } catch { /* already gone */ }
}
