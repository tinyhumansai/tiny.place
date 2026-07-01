#!/usr/bin/env node
// Stop-hook dispatcher. When the session goes idle (end of a turn), atomically
// claim any queued inbound DMs and hand them to a detached, pooled runner that
// spawns one `claude -p` responder per message. Returns immediately so it never
// blocks the session.
//
// Recursion guard: responder sessions load this same plugin, so THEY fire this
// hook too — TINYPLACE_NO_AUTORESPOND (set on responders) makes it a no-op there.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.TINYPLACE_NO_AUTORESPOND) process.exit(0);

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.TINYPLACE_CLAUDE_HOME ?? join(homedir(), ".tinyplace-claude");
const AUTORESPOND_DIR = join(DATA_DIR, "autorespond");
const QUEUE_DIR = join(DATA_DIR, "queue");

// The Stop-hook payload (JSON on stdin) carries the session id; best-effort.
function readSessionId() {
  try {
    const parsed = JSON.parse(readFileSync(0, "utf8"));
    return parsed?.session_id ?? parsed?.sessionId ?? null;
  } catch {
    return null;
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

const active = readActive(readSessionId());
if (!active?.address) process.exit(0);

const queueDir = join(QUEUE_DIR, encodeURIComponent(active.address));
if (!existsSync(queueDir)) process.exit(0);

// Claim this batch into a unique dir so concurrent dispatches never collide.
const batchDir = join(queueDir, "processing", `${Date.now()}-${process.pid}`);
mkdirSync(batchDir, { recursive: true });

let claimed = 0;
let files = [];
try {
  files = readdirSync(queueDir).filter((f) => f.endsWith(".json"));
} catch {
  /* empty */
}
for (const file of files) {
  try {
    renameSync(join(queueDir, file), join(batchDir, file));
    claimed += 1;
  } catch {
    /* raced with another dispatch — fine */
  }
}

if (claimed === 0) {
  try { rmdirSync(batchDir); } catch { /* non-empty/raced */ }
  process.exit(0);
}

// Hand off to the detached pooled runner and return immediately.
const child = spawn(
  "node",
  [join(HERE, "respond-batch.mjs"), JSON.stringify({ wallet: active.wallet, address: active.address, batchDir })],
  { detached: true, stdio: "ignore", env: process.env },
);
child.unref();
process.exit(0);
