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

// Requeue jobs whose `.sending-*` claim was orphaned by a daemon that exited
// between claiming and done()/fail(). Without this they'd never be listed again.
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
    try {
      if (now - statSync(p).mtimeMs < STALE_CLAIM_MS) continue;
      const orig = f.replace(/^\.sending-\d+-/, "");
      if (!orig.endsWith(".json")) continue;
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
