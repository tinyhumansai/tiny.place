// Inbound routing for the per-agent daemon: decide which session's inbox an
// inbound message belongs to, and write it to the right file queue. Split out as
// pure-ish helpers so routing is unit-testable offline (§14).
import { mkdirSync, writeFileSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

import { sessionsDir, liveSessions, primarySession } from "./registry.mjs";

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

// When a session becomes live, deliver any held messages addressed to it. Moves
// matching _unrouted files into the session's inbox. Returns count delivered.
export function redeliverUnrouted(agentAddress) {
  const dir = unroutedDir(agentAddress);
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return 0;
  }
  const live = new Set(liveSessions(agentAddress).map((s) => s.label));
  let delivered = 0;
  for (const f of files) {
    let payload;
    try {
      payload = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch {
      continue;
    }
    const target = payload.toSession;
    if (target && live.has(target)) {
      try {
        mkdirSync(inboxDir(agentAddress, target), { recursive: true });
        renameSync(join(dir, f), join(inboxDir(agentAddress, target), f));
        delivered += 1;
      } catch {
        /* raced/gone */
      }
    }
  }
  return delivered;
}

// Read (and by default claim) the queued inbox files for a session. Each file is
// atomically renamed into a per-read claim dir so concurrent readers never
// double-deliver, then parsed. Returns an array of payloads.
export function drainInbox(agentAddress, label, { peek = false } = {}) {
  const dir = inboxDir(agentAddress, label);
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
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
