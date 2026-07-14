#!/usr/bin/env node
// Pull-only inbound surfacing (the Codex workaround for no server→client push).
// Codex MCP is pull-only: the tinyplace server can't push a new DM into a live
// session the way the Claude channel does. So on SessionStart / UserPromptSubmit
// we PEEK the active agent's routed inboxes and, for any DM not yet surfaced this
// way, inject a one-line notice as `additionalContext` — nudging the agent to
// call the `inbox` tool. We only PEEK (never claim), so the `inbox` tool still
// delivers the full message; a per-id marker prevents re-announcing every turn.
//
// Only meaningful in DAEMON mode (inbound lands in inbox files). In self-mode the
// MCP server buffers inbound in RAM, invisible to this separate process — there
// the agent just calls `inbox` directly. Fails open: any error → silent exit 0.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DATA_DIR = process.env.TINYPLACE_CODEX_HOME ?? join(homedir(), ".tinyplace-codex");
const AUTORESPOND_DIR = join(DATA_DIR, "autorespond");
const SESSIONS_ROOT = join(DATA_DIR, "sessions");
const SURFACED_ROOT = join(DATA_DIR, "surfaced");
const MAX_ANNOUNCE = 5;

function readHook() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function readActive(sessionId) {
  const candidates = [];
  if (sessionId) candidates.push(join(AUTORESPOND_DIR, `active-session-${sessionId}.json`));
  candidates.push(join(AUTORESPOND_DIR, "active-latest.json"));
  for (const file of candidates) {
    try {
      if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      /* try next */
    }
  }
  return null;
}

// Peek the inbox(es) that THIS session can actually drain, oldest first. When we
// know the active session label, restrict to that label's inbox (+ the shared
// _unrouted hold) — otherwise a sibling session of the same wallet would surface
// (and mark as seen) DMs routed to a different label that it can never read.
function peekInboxes(address, label) {
  const agentDir = join(SESSIONS_ROOT, encodeURIComponent(String(address)));
  const inboxDirs = [];
  if (label) {
    inboxDirs.push(join(agentDir, encodeURIComponent(String(label)), "inbox"));
    inboxDirs.push(join(agentDir, "_unrouted"));
  } else {
    // No known active label — fall back to scanning every routed inbox.
    let entries = [];
    try {
      entries = readdirSync(agentDir, { withFileTypes: true });
    } catch {
      return [];
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === "_unrouted") inboxDirs.push(join(agentDir, e.name));
      else inboxDirs.push(join(agentDir, e.name, "inbox"));
    }
  }
  const msgs = [];
  for (const dir of inboxDirs) {
    let files = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("."));
    } catch {
      continue;
    }
    for (const f of files) {
      const path = join(dir, f);
      try {
        const payload = JSON.parse(readFileSync(path, "utf8"));
        const mtime = statSync(path).mtimeMs;
        if (payload && payload.id != null) msgs.push({ ...payload, _mtime: mtime });
      } catch {
        /* skip corrupt */
      }
    }
  }
  msgs.sort((a, b) => a._mtime - b._mtime);
  return msgs;
}

// Per-id surfaced marker so we announce each DM once, not every turn.
function markerFile(address, id) {
  return join(SURFACED_ROOT, encodeURIComponent(String(address)), encodeURIComponent(String(id)));
}
function alreadySurfaced(address, id) {
  return existsSync(markerFile(address, id));
}
function markSurfaced(address, id) {
  try {
    const dir = join(SURFACED_ROOT, encodeURIComponent(String(address)));
    mkdirSync(dir, { recursive: true });
    writeFileSync(markerFile(address, id), "", { mode: 0o600 });
  } catch {
    /* non-fatal */
  }
}

function emit(hookEventName, context) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: context } }) + "\n");
}

const hook = readHook();
const hookEventName = hook?.hook_event_name ?? hook?.hookEventName ?? "UserPromptSubmit";
const sessionId = hook?.session_id ?? hook?.sessionId ?? null;

const active = readActive(sessionId);
if (!active?.address) process.exit(0);

const fresh = peekInboxes(active.address, active.label ?? null).filter((m) => !alreadySurfaced(active.address, m.id));
if (fresh.length === 0) process.exit(0);

for (const m of fresh) markSurfaced(active.address, m.id);

const shown = fresh.slice(0, MAX_ANNOUNCE);
// Announce only sender/count metadata — never the message text. A preview would
// smuggle peer-controlled (untrusted) content into trusted model context outside
// the `inbox` tool's trust boundary; the agent reads the full body via `inbox`.
const lines = shown.map((m) => {
  const who = m.fromSession ? `${m.from} (session ${m.fromSession})` : m.from;
  return `  • from ${who}`;
});
const more = fresh.length > shown.length ? `\n  …and ${fresh.length - shown.length} more.` : "";
const context =
  `tiny.place: ${fresh.length} new direct message(s) received:\n` +
  lines.join("\n") +
  more +
  `\nCall the tinyplace \`inbox\` tool to read and act on them.`;

emit(hookEventName, context);
process.exit(0);
