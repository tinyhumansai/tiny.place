// Inbound routing for the per-agent daemon: decide which session's inbox an
// inbound message belongs to, and write it to the right file queue. Split out as
// pure-ish helpers so routing is unit-testable offline (§14).
import { mkdirSync, writeFileSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { sessionsDir, liveSessions, primarySession, labelForConversationUuid, sessionUuidForConversation } from "./registry.mjs";

// No-target delivery policy (TINYPLACE_UNROUTED_POLICY): primary (default),
// broadcast (fan out to all live), or drop.
export function unroutedPolicy() {
  const p = process.env.TINYPLACE_UNROUTED_POLICY?.trim();
  return p === "broadcast" || p === "drop" ? p : "primary";
}

// Grace before a message addressed to a now-closed session is abandoned. The hold
// (see enqueueRouted → _unrouted) doubles as the grace window: a briefly-restarting
// session that comes back within it still gets its mail (redeliverUnrouted); only
// past it do we declare the target closed.
const CLOSED_GRACE_MS = Number(process.env.TINYPLACE_SESSION_CLOSED_GRACE_MS) || 5000;

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

// Where a message goes RIGHT NOW, preferring the durable UUID binding. If the sender
// addressed a session UUID, deliver ONLY to the live session that actually owns it —
// never to a reused label slot; no live owner → unrouted (held). Falls back to the
// label/policy routing when there's no UUID (older peers, untargeted mail).
function resolveBound(agentAddress, { toSession, fromSessionUuid }, { liveList, primary, policy }) {
  // Every message carries ONE shared session id: the thread's conversation uuid, in
  // wrapper_session_id (decoded as fromSessionUuid). Resolve it through our index.
  if (fromSessionUuid) {
    const label = labelForConversationUuid(agentAddress, fromSessionUuid);
    if (label) return { kind: "session", labels: [label] }; // owner live → deliver
    // A convUuid WE minted/adopted but whose owner is offline names a SPECIFIC,
    // now-closed session — hold it (reuse-proof), never misdeliver to another live
    // session via policy. Only a truly unknown id falls through to policy routing.
    if (sessionUuidForConversation(fromSessionUuid)) return { kind: "unrouted" };
  }
  return routeTarget({ toSession, liveLabels: liveList, primary, policy });
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
  const target = resolveBound(agentAddress, decoded, { liveList: live, primary, policy });
  const payload = {
    id: decoded.id,
    from: decoded.from,
    fromSession: decoded.fromSession ?? null,
    fromSessionUuid: decoded.fromSessionUuid ?? null,
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
    const target = resolveBound(agentAddress, payload, { liveList, primary, policy });
    // Only single-session delivery is reversible from _unrouted (broadcast would
    // need copies); a held untargeted message goes to the current primary.
    if (target.kind === "session" && target.labels.length === 1) {
      const label = target.labels[0];
      try {
        mkdirSync(inboxDir(agentAddress, label), { recursive: true });
        renameSync(join(dir, f), join(inboxDir(agentAddress, label), f));
        delivered += 1;
      } catch {
        /* raced/gone */
      }
    }
  }
  return delivered;
}

// Reap mail addressed to a session that is now CLOSED. A message with an explicit
// `toSession` that stayed unrouted past the grace window — its target never came
// (back) live — is abandoned: remove the held file and return its payload so the
// caller can notify the sender ("session closed") and terminate the thread.
//
// Untargeted held mail (no `toSession`) is NOT reaped here — that's "agent away, no
// live session", not "the specific session you addressed is gone"; it stays held and
// is delivered to a live session by redeliverUnrouted. Call this AFTER
// redeliverUnrouted so a target that just came live is delivered, not reaped.
export function reapClosedTargets(agentAddress, { graceMs = CLOSED_GRACE_MS } = {}) {
  const dir = unroutedDir(agentAddress);
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const live = new Set(liveSessions(agentAddress).map((s) => s.label));
  const now = Date.now();
  const reaped = [];
  for (const f of files) {
    const p = join(dir, f);
    let payload, mtimeMs;
    try {
      payload = JSON.parse(readFileSync(p, "utf8"));
      mtimeMs = statSync(p).mtimeMs;
    } catch {
      continue;
    }
    // Was this addressed to a SPECIFIC session (now gone), vs merely "no live
    // session right now"? A known shared id (a convUuid in our index) names a
    // specific thread; an explicit toSession names a specific label.
    const knownConv = payload.fromSessionUuid && Boolean(sessionUuidForConversation(payload.fromSessionUuid));
    if (!payload.toSession && !knownConv) continue; // untargeted → not a "closed session" case
    // Is the addressed session still reachable? Prefer the shared id (a match is the
    // SAME session, never a reused label); fall back to the explicit label.
    const stillLive = knownConv
      ? Boolean(labelForConversationUuid(agentAddress, payload.fromSessionUuid))
      : live.has(payload.toSession);
    if (stillLive) continue; // target is live → let redelivery handle it
    if (now - mtimeMs < graceMs) continue; // still within the grace window
    try {
      rmSync(p); // terminate: drop the held message
      reaped.push(payload);
    } catch {
      /* raced with redelivery — fine */
    }
  }
  return reaped;
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
