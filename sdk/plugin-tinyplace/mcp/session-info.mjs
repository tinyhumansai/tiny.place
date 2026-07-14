// session_info emit — the contact-gated session intro/announce.
//
// The moment a wrapped session is initialized, the daemon announces it to the
// agent's owner (the OpenHuman "Master") over a Signal DM, so the owner can
// register + render the session before it does anything. Delivery is gated on a
// contact relationship: the relay drops a DM to a peer that hasn't accepted a
// contact request, so the intro can't be sent until the owner is a contact.
//
// This module is the pure, SDK-free core (envelope builder + emit planner +
// per-agent emitted store) so it runs in the offline test suite; the daemon
// (hooks/agent-daemon.mjs) owns the network side (contacts / prekeys / send) and
// the state-machine wiring. It emits a `SessionEnvelopeV2` (schema
// `tinyplace.harness.session.v2`, see sdk/typescript/src/types/harness.ts) whose
// `event.kind` is `session_info` — byte-compatible with the SDK's v2 emitter.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import { activeAdapter, harnessDataDir } from "./harness.mjs";

// v2 schema id (kept as a literal, mirrors SESSION_ENVELOPE_VERSION_V2 in the SDK).
export const SESSION_ENVELOPE_VERSION_V2 = "tinyplace.harness.session.v2";

// The record_type stamped on a session_info envelope's source frame — it is
// emitted from the daemon on session init (the SessionStart moment), not tailed
// from a transcript line. Part of the stable event id (see stableEventId).
export const SESSION_INFO_RECORD_TYPE = "hook:SessionStart";

// Event kinds a wrapped session advertises it will emit (feature-gate the owner's
// UI). Mirrors the wire example in the spec; excludes `session_info` itself and
// `unknown`. Kept as plain strings so the module stays free of SDK type imports.
export const DEFAULT_CAPABILITIES = [
  "user_prompt",
  "agent_message",
  "agent_thinking",
  "approval_request",
  "tool_call",
  "tool_result",
  "status",
  "lifecycle",
  "error",
];

// Owner (OpenHuman Master) address this agent announces its sessions to. Contacts
// are per-identity, so this is a single relationship covering ALL of the agent's
// sessions. Unset => the feature is OFF (no session_info emitted, no contact
// request sent), which keeps the wire byte-compatible with the plain v2 emitter.
// The raw value may be a base58 cryptoId, a base64 messaging key, or an @handle;
// the daemon resolves it to the cryptoId the contacts/keys APIs expect.
export function ownerAddress(env = process.env) {
  return env.TINYPLACE_OWNER_ADDRESS?.trim() || null;
}

// The minute-window bucket a timestamp falls in (SessionEnvelope requires it).
// Matches mcp/format.mjs so v1 and v2 frames bucket identically.
function minuteBucket(date) {
  const start = new Date(date);
  start.setUTCSeconds(0, 0);
  const end = new Date(start.getTime() + 60_000);
  return { unit: "minute", start: start.toISOString(), end: end.toISOString() };
}

// Deterministic id scoped to (wrapperSessionId, recordType, seq, kind) — NOT a
// content hash. Identical to the SDK's stableEventId (harness-envelope.ts) so a
// session_info the daemon builds carries the same id the SDK would mint: a retry
// (same seq) reuses the id and the receiver dedups, while a resumed re-emit
// (distinct seq) gets a distinct id so the receiver upserts rather than drops it.
export function stableEventId(wrapperSessionId, recordType, seq, kind) {
  return createHash("sha256")
    .update(`${wrapperSessionId}\0${recordType}\0${seq}\0${kind}`)
    .digest("hex");
}

// Build a SessionEnvelopeV2 body (JSON string) carrying a `session_info` event.
// Thin payload by design: provider/cwd/session-ids ride on the frame (scope/
// harness), so the payload only confirms identity + adds UI metadata + advertises
// capabilities + carries resume/idempotency signals. Optional payload fields are
// omitted (not null) when empty, matching the SDK interface's `?:` optionals.
export function buildSessionInfoEnvelope(opts) {
  const adapter = activeAdapter();
  const now = new Date();
  const startedAt = opts.startedAt ? new Date(opts.startedAt) : now;
  const at = Number.isNaN(startedAt.getTime()) ? now : startedAt;
  const seq = Number.isInteger(opts.seq) ? opts.seq : 0;
  const wrapperSessionId =
    opts.wrapperSessionId || opts.harnessSessionId || `${opts.agentAddress ?? "agent"}`;

  const payload = { agent_address: String(opts.agentAddress ?? "") };
  if (opts.handle) payload.handle = opts.handle;
  if (opts.title) payload.title = opts.title;
  if (opts.repo) payload.repo = opts.repo;
  if (opts.branch) payload.branch = opts.branch;
  if (opts.model) payload.model = opts.model;
  if (opts.harnessVersion) payload.harness_version = opts.harnessVersion;
  payload.capabilities = Array.isArray(opts.capabilities)
    ? opts.capabilities
    : DEFAULT_CAPABILITIES;
  payload.resumed = opts.resumed === true;
  payload.started_at = at.toISOString();

  const envelope = {
    envelope_version: SESSION_ENVELOPE_VERSION_V2,
    version: 2,
    bucket: minuteBucket(now),
    scope: {
      type: "session",
      key: `${opts.agentAddress ?? "agent"}:${opts.label ?? wrapperSessionId}`,
      cwd: opts.cwd ?? process.cwd(),
      wrapper_session_id: wrapperSessionId,
      harness_session_id: opts.harnessSessionId ?? "",
    },
    harness: {
      provider: adapter.provider,
      command: adapter.harness.command,
      argv: adapter.harness.argv ?? [],
    },
    event: {
      id: stableEventId(wrapperSessionId, SESSION_INFO_RECORD_TYPE, seq, "session_info"),
      seq,
      ts: now.toISOString(),
      ...(opts.model ? { model: opts.model } : {}),
      kind: "session_info",
      role: "agent",
      payload,
    },
    source: { path: "plugin", record_type: SESSION_INFO_RECORD_TYPE },
  };
  return JSON.stringify(envelope);
}

// Pure planner for the flush step of the emit state machine. Given the live
// session ids, which ids were emitted in a PRIOR daemon run (loaded from the
// store) and which have already been sent THIS run, decide what to (re-)emit:
//   - a session never announced before  → { resumed:false, seq:0 } (fresh spawn)
//   - a session announced in a prior run → { resumed:true,  seq:1 } (reconnect)
//   - a session already sent this run    → skipped (idempotent)
// seq is 0 for fresh / 1 for resumed so a retry reuses its id (idempotent) while
// a fresh→resumed transition mints a distinct id (upsert, not dedup-drop).
export function planSessionInfoEmit({ liveSessionUuids, priorEmitted, sentThisRun }) {
  const prior = priorEmitted instanceof Set ? priorEmitted : new Set(priorEmitted ?? []);
  const sent = sentThisRun instanceof Set ? sentThisRun : new Set(sentThisRun ?? []);
  const emits = [];
  const seen = new Set();
  for (const uuid of liveSessionUuids ?? []) {
    if (!uuid || seen.has(uuid) || sent.has(uuid)) continue;
    seen.add(uuid);
    const resumed = prior.has(uuid);
    emits.push({ sessionUuid: uuid, resumed, seq: resumed ? 1 : 0 });
  }
  return emits;
}

// ── per-agent emitted store (survives daemon restart) ────────────────────────
// Records which sessions this agent has already announced, so a restart re-emits
// with resumed:true (reconnect) instead of resumed:false (fresh). Best-effort
// JSON file; a missing/corrupt file just means "nothing announced yet".
function emittedFile(agentAddress) {
  return join(harnessDataDir(), "session-info", encodeURIComponent(String(agentAddress)) + ".json");
}

export function loadEmitted(agentAddress) {
  try {
    const raw = JSON.parse(readFileSync(emittedFile(agentAddress), "utf8"));
    return new Set(Array.isArray(raw?.sessions) ? raw.sessions : []);
  } catch {
    return new Set();
  }
}

export function persistEmitted(agentAddress, sessionUuids) {
  const path = emittedFile(agentAddress);
  try {
    mkdirSync(join(harnessDataDir(), "session-info"), { recursive: true });
    const sessions = Array.from(sessionUuids instanceof Set ? sessionUuids : sessionUuids ?? []);
    writeFileSync(path, JSON.stringify({ sessions }) + "\n", { mode: 0o600 });
  } catch {
    /* best-effort — a lost record just re-announces a session as fresh next run */
  }
}

// Best-effort git repo slug + branch for a session's cwd. Both are privacy-
// sensitive (spec §5.7) and OPTIONAL — only sent to the owner, never broadcast —
// so any failure (not a repo, no git, detached HEAD) silently yields nulls. The
// repo slug is derived from the origin remote url (`org/repo`); the branch is the
// current symbolic ref. Async (non-blocking execFile) so it never stalls the
// daemon's poll loop; short-timeout, no throw. The two git calls run in parallel.
export async function gitInfo(cwd) {
  const run = async (args) => {
    try {
      const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { timeout: 2000 });
      return stdout.trim();
    } catch {
      return "";
    }
  };
  if (!cwd) return { repo: null, branch: null };
  const [branch, remote] = await Promise.all([
    run(["rev-parse", "--abbrev-ref", "HEAD"]),
    run(["remote", "get-url", "origin"]),
  ]);
  return {
    repo: remote ? repoSlugFromRemote(remote) : null,
    branch: branch && branch !== "HEAD" ? branch : null,
  };
}

// Reduce a git remote url (ssh or https) to an `org/repo` slug; null if it can't
// be parsed. `git@host:org/repo.git`, `https://host/org/repo.git`, and trailing
// `.git` are all handled.
export function repoSlugFromRemote(remote) {
  if (typeof remote !== "string" || !remote) return null;
  const stripped = remote.trim().replace(/\.git$/, "");
  const scp = /^[^/@]+@[^:]+:(.+)$/.exec(stripped); // git@host:org/repo
  const path = scp ? scp[1] : stripped.replace(/^[a-z]+:\/\/[^/]+\//i, ""); // strip scheme+host
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts.slice(-2).join("/");
}

// A human-friendly session title for the owner's UI header. Prefers
// `<repo-or-cwd-basename> · <branch>`, falling back to the routing label.
export function sessionTitle({ cwd, branch, repo, label }) {
  const base = repo ? repo.split("/").pop() : cwd ? basename(cwd) : null;
  const head = base || label || "session";
  return branch ? `${head} · ${branch}` : head;
}
