// Outbound send jobs — a session (thin client) drops a job here; the daemon (the
// single ratchet writer) claims it, builds the SessionEnvelope, and sends. File
// queue at sessions/<agent>/_outbox/. Claims are atomic renames so the daemon
// never double-sends a job.
import { mkdirSync, writeFileSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { sessionsDir } from "./registry.mjs";

// A claim older than this is assumed abandoned (daemon crashed mid-send) and is
// requeued. Kept safely longer than any single send attempt.
const STALE_CLAIM_MS = Number(process.env.TINYPLACE_OUTBOX_CLAIM_MS) || 60_000;

export function outboxDir(agentAddress) {
  return join(sessionsDir(agentAddress), "_outbox");
}

// True if `pid` names a live process. `process.kill(pid, 0)` sends no signal but
// throws ESRCH if the process is gone; EPERM means it exists but isn't ours (still
// alive). Guards against a garbage/negative pid.
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

// Requeue jobs whose `.sending-*` claim was orphaned by a daemon that exited
// between claiming and done()/fail(). Without this they'd never be listed again.
//
// The claim name carries the OWNER daemon's pid (`.sending-<pid>-<job>.json`). A
// claim whose owner is still alive may have a send in flight — reclaiming it by
// age alone (the old behavior) double-sends the message. So only reclaim when the
// owner is dead (definitively orphaned). For an unparseable name (unknown owner)
// fall back to the age gate so a same-pid reuse race can't instantly reclaim.
function recoverStaleClaims(dir) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.startsWith(".sending-"));
  } catch {
    return;
  }
  const now = Date.now();
  for (const f of files) {
    const p = join(dir, f);
    const m = /^\.sending-(\d+)-(.+)$/.exec(f);
    // For a parseable name use the captured job; otherwise strip the generic
    // `.sending-` prefix so an unknown-owner claim requeues under its real name
    // (a `\d+-` strip would leave `.sending-job.json` unchanged → rename-to-self).
    const orig = m ? m[2] : f.replace(/^\.sending-/, "");
    if (!orig.endsWith(".json")) continue;
    try {
      if (m) {
        // Owner pid known: skip while it's alive (send may be in flight); a dead
        // owner's claim is orphaned and reclaimed immediately.
        if (pidAlive(Number(m[1]))) continue;
      } else if (now - statSync(p).mtimeMs < STALE_CLAIM_MS) {
        continue; // unknown owner — age gate only
      }
      renameSync(p, join(dir, orig)); // back to a pending job
    } catch {
      /* raced with a live daemon finishing the send — fine */
    }
  }
}

// Session side: enqueue a send job. `job` carries
// { id, to, toSession, role, text, inReplyTo, auto, fromSession, harnessSessionId, cwd }.
// `id` is the client-generated message id (also used as the envelope message.id),
// so the session can correlate the reply without knowing the relay id.
export function writeOutboxJob(agentAddress, job) {
  const dir = outboxDir(agentAddress);
  mkdirSync(dir, { recursive: true });
  const name = encodeURIComponent(String(job.id));
  const tmp = join(dir, `.${name}.tmp`);
  const dst = join(dir, `${name}.json`);
  writeFileSync(tmp, JSON.stringify(job) + "\n", { mode: 0o600 });
  renameSync(tmp, dst); // atomic publish
  return job.id;
}

// Daemon side: claim all pending jobs by renaming each into a private claim dir,
// then parse. Returns [{ job, done() }] where done() removes the claimed file.
export function claimOutboxJobs(agentAddress) {
  const dir = outboxDir(agentAddress);
  recoverStaleClaims(dir); // requeue anything a crashed daemon left mid-send
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith(".")).sort();
  } catch {
    return [];
  }
  const claimed = [];
  for (const f of files) {
    const src = join(dir, f);
    const claimPath = join(dir, `.sending-${process.pid}-${f}`);
    try {
      renameSync(src, claimPath); // atomic claim
    } catch {
      continue; // another daemon (mid-takeover) grabbed it
    }
    let job = null;
    try {
      job = JSON.parse(readFileSync(claimPath, "utf8"));
    } catch {
      try { rmSync(claimPath); } catch { /* best-effort */ }
      continue;
    }
    claimed.push({
      job,
      done() { try { rmSync(claimPath); } catch { /* best-effort */ } },
      fail() { try { renameSync(claimPath, src); } catch { /* best-effort */ } },
    });
  }
  return claimed;
}
