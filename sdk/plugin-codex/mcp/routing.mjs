// Inbound routing for the per-agent daemon: decide which session's inbox an
// inbound message belongs to, and write it to the right file queue. Split out as
// pure-ish helpers so routing is unit-testable offline (§14).
import { mkdirSync, writeFileSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { sessionsDir, liveSessions, primarySession } from "./registry.mjs";

// A claim older than this is assumed abandoned (reader crashed mid-drain) and is
// requeued so the message isn't stranded. Mirrors the outbox stale-claim policy.
const STALE_CLAIM_MS = Number(process.env.TINYPLACE_INBOX_CLAIM_MS) || 60_000;

// No-target delivery policy (TINYPLACE_UNROUTED_POLICY): primary (default),
// broadcast (fan out to all live), or drop.
export function unroutedPolicy() {
  const p = process.env.TINYPLACE_UNROUTED_POLICY?.trim();
  return p === "broadcast" || p === "drop" ? p : "primary";
}

function inboxDir(agentAddress, label) {
  return join(sessionsDir(agentAddress), encodeURIComponent(String(label)), "inbox");
}

export function sessionInboxDir(agentAddress, label) {
  return inboxDir(agentAddress, label);
}

function unroutedDir(agentAddress) {
  return join(sessionsDir(agentAddress), "_unrouted");
}

// Pure routing decision. `liveLabels` is a Set/array of live session labels;
// `primary` is the lowest-index live label (or null). Returns one of:
//   { kind: "session", labels: [label] }  — deliver to those inbox(es)
//   { kind: "unrouted" }                   — hold for a not-yet-live target
//   { kind: "drop" }                       — discard (policy=drop, no target)
export function routeTarget({ toSession, liveLabels, primary, policy = "primary" }) {
  const live = liveLabels instanceof Set ? liveLabels : new Set(liveLabels ?? []);
  if (toSession) {
    return live.has(toSession) ? { kind: "session", labels: [toSession] } : { kind: "unrouted" };
  }
  if (policy === "drop") return { kind: "drop" };
  if (policy === "broadcast") {
    const labels = [...live].sort();
    return labels.length ? { kind: "session", labels } : { kind: "unrouted" };
  }
  // primary
  return primary ? { kind: "session", labels: [primary] } : { kind: "unrouted" };
}

function writeQueueFile(dir, id, payload) {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${encodeURIComponent(String(id))}.tmp`);
  const dst = join(dir, `${encodeURIComponent(String(id))}.json`);
  writeFileSync(tmp, JSON.stringify(payload) + "\n", { mode: 0o600 });
  renameSync(tmp, dst); // atomic publish
  return dst;
}

// Route one decoded inbound message to the correct queue(s). `decoded` carries
// { id, from, fromSession, role, text, inReplyTo, toSession }. Returns the route
// decision plus the files written.
export function enqueueRouted(agentAddress, decoded, { policy = unroutedPolicy() } = {}) {
  const live = liveSessions(agentAddress).map((s) => s.label);
  const primary = primarySession(agentAddress)?.label ?? null;
  const target = routeTarget({ toSession: decoded.toSession, liveLabels: live, primary, policy });
  const payload = {
    id: decoded.id,
    from: decoded.from,
    fromSession: decoded.fromSession ?? null,
    role: decoded.role ?? null,
    text: decoded.text,
    inReplyTo: decoded.inReplyTo ?? null,
    toSession: decoded.toSession ?? null,
    ts: decoded.ts ?? new Date().toISOString(),
  };
  const written = [];
  if (target.kind === "session") {
    for (const label of target.labels) written.push(writeQueueFile(inboxDir(agentAddress, label), decoded.id, payload));
  } else if (target.kind === "unrouted") {
    written.push(writeQueueFile(unroutedDir(agentAddress), decoded.id, payload));
  } // drop → nothing
  return { target, written };
}

// When a session becomes live, deliver any held messages that can now be routed.
// Re-evaluates each held message against the CURRENT live set + policy — so both
// explicitly-targeted mail (whose target just came online) AND untargeted mail
// held because no session was live get delivered. Returns count delivered.
export function redeliverUnrouted(agentAddress, { policy = unroutedPolicy() } = {}) {
  const dir = unroutedDir(agentAddress);
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return 0;
  }
  const liveList = liveSessions(agentAddress).map((s) => s.label);
  const primary = primarySession(agentAddress)?.label ?? null;
  let delivered = 0;
  for (const f of files) {
    let payload;
    try {
      payload = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch {
      continue;
    }
    const target = routeTarget({ toSession: payload.toSession, liveLabels: liveList, primary, policy });
    if (target.kind === "session" && target.labels.length === 1) {
      // Single-session delivery is reversible from _unrouted via a plain rename.
      const label = target.labels[0];
      try {
        mkdirSync(inboxDir(agentAddress, label), { recursive: true });
        renameSync(join(dir, f), join(inboxDir(agentAddress, label), f));
        delivered += 1;
      } catch {
        /* raced/gone */
      }
    } else if (target.kind === "session" && target.labels.length > 1) {
      // Broadcast (policy=broadcast): fan a copy into every live inbox, then drop
      // the held original — otherwise it stays stuck in _unrouted forever.
      try {
        for (const label of target.labels) writeQueueFile(inboxDir(agentAddress, label), payload.id, payload);
        rmSync(join(dir, f));
        delivered += target.labels.length;
      } catch {
        /* keep the original for the next retry */
      }
    }
  }
  return delivered;
}

// Requeue inbox files whose `.claimed-*` rename was orphaned by a reader that
// crashed between claiming and removing them. Best-effort, stale-guarded.
function recoverStaleInboxClaims(dir) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.startsWith(".claimed-"));
  } catch {
    return;
  }
  const now = Date.now();
  for (const f of files) {
    const p = join(dir, f);
    try {
      if (now - statSync(p).mtimeMs < STALE_CLAIM_MS) continue;
      const orig = f.replace(/^\.claimed-\d+-/, "");
      if (!orig.endsWith(".json")) continue;
      renameSync(p, join(dir, orig)); // back to a pending message
    } catch {
      /* raced with a live reader finishing — fine */
    }
  }
}

// Read (and by default claim) the queued inbox files for a session. Each file is
// atomically renamed into a per-read claim dir so concurrent readers never
// double-deliver, then parsed. Returns an array of payloads.
export function drainInbox(agentAddress, label, { peek = false } = {}) {
  const dir = inboxDir(agentAddress, label);
  if (!peek) recoverStaleInboxClaims(dir); // requeue anything a crashed reader stranded
  let files = [];
  try {
    // Exclude dotfiles: a live `.claimed-*` file also ends in `.json`, and reading
    // it as a pending message would double-deliver on a racing drain.
    files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith(".")).sort();
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    const src = join(dir, f);
    if (peek) {
      try { out.push(JSON.parse(readFileSync(src, "utf8"))); } catch { /* skip */ }
      continue;
    }
    // Claim by rename so a racing reader can't also take it.
    const claimed = join(dir, `.claimed-${process.pid}-${f}`);
    try {
      renameSync(src, claimed);
    } catch {
      continue; // lost the race
    }
    try {
      out.push(JSON.parse(readFileSync(claimed, "utf8")));
    } catch {
      /* corrupt — drop */
    }
    try { rmSync(claimed); } catch { /* best-effort */ }
  }
  return out;
}
