#!/usr/bin/env node
// Offline P4 tests: Stop-hook dispatcher (claim) + pull-only inbound surfacing.
// No network, no `codex`/`claude` spawn — dispatch runs in DRYRUN, surface reads
// files and writes markers. Uses an isolated TINYPLACE_CODEX_HOME temp dir.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = mkdtempSync(join(tmpdir(), "tp-codex-hooks-"));
const ADDR = "AgentAddr1111111111111111111111111111111111";

let failed = false;
const check = (n, c, x) => { console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); if (!c) failed = true; };

const enc = (s) => encodeURIComponent(String(s));

function writeQueueMsg(id, text) {
  const dir = join(HOME, "queue", enc(ADDR));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${enc(id)}.json`), JSON.stringify({ id, from: "PeerXYZ", text, ts: new Date().toISOString() }) + "\n");
}

function writeInboxMsg(label, id, text, fromSession) {
  const dir = label === "_unrouted"
    ? join(HOME, "sessions", enc(ADDR), "_unrouted")
    : join(HOME, "sessions", enc(ADDR), enc(label), "inbox");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${enc(id)}.json`), JSON.stringify({ id, from: "PeerXYZ", fromSession: fromSession ?? null, text, ts: new Date().toISOString() }) + "\n");
}

function writeActiveLatest() {
  const dir = join(HOME, "autorespond");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "active-latest.json"), JSON.stringify({ wallet: "cxbot", address: ADDR, updatedAt: new Date().toISOString() }) + "\n");
}

function runNode(script, { stdin = "", env = {} } = {}) {
  return spawnSync("node", [join(HERE, "hooks", script)], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, TINYPLACE_HARNESS: "codex", TINYPLACE_CODEX_HOME: HOME, ...env },
  });
}

try {
  // ── Dispatcher: no queue → no-op, no crash ────────────────────────────────
  {
    const r = runNode("dispatch.mjs", { env: { TINYPLACE_DISPATCH_DRYRUN: "1", TINYPLACE_DISPATCH_ADDRESS: ADDR, TINYPLACE_DISPATCH_WALLET: "cxbot" } });
    check("dispatch no-queue exits clean", r.status === 0, `status=${r.status}`);
  }

  // ── Dispatcher: claims queued messages into a batch dir ───────────────────
  {
    writeQueueMsg("m1", "hello one");
    writeQueueMsg("m2", "hello two");
    const r = runNode("dispatch.mjs", { env: { TINYPLACE_DISPATCH_DRYRUN: "1", TINYPLACE_DISPATCH_ADDRESS: ADDR, TINYPLACE_DISPATCH_WALLET: "cxbot" } });
    let out = {};
    try { out = JSON.parse(r.stdout.trim().split("\n").pop()); } catch { /* */ }
    check("dispatch claimed 2", out.claimed === 2, `claimed=${out.claimed}`);
    const qdir = join(HOME, "queue", enc(ADDR));
    const left = readdirSync(qdir).filter((f) => f.endsWith(".json"));
    check("queue root emptied after claim", left.length === 0, `left=${left.length}`);
    const batchFiles = existsSync(out.batchDir) ? readdirSync(out.batchDir).filter((f) => f.endsWith(".json")) : [];
    check("batch dir holds both messages", batchFiles.length === 2, `batch=${batchFiles.length}`);
  }

  // ── Dispatcher: recursion guard (responder session is a no-op) ────────────
  {
    writeQueueMsg("m3", "should not be claimed");
    const r = runNode("dispatch.mjs", { env: { TINYPLACE_NO_AUTORESPOND: "1", TINYPLACE_DISPATCH_DRYRUN: "1", TINYPLACE_DISPATCH_ADDRESS: ADDR } });
    check("dispatch no-ops under NO_AUTORESPOND", r.status === 0 && r.stdout.trim() === "", `stdout='${r.stdout.trim()}'`);
    const qdir = join(HOME, "queue", enc(ADDR));
    const still = readdirSync(qdir).filter((f) => f.endsWith(".json"));
    check("queued msg untouched by guarded dispatch", still.length === 1, `still=${still.length}`);
  }

  // ── Surfacing: announces unseen inbox DMs once, then dedups ───────────────
  {
    writeActiveLatest();
    writeInboxMsg("codex:1", "s1", "first routed message", "claude:1");
    writeInboxMsg("_unrouted", "s2", "held message no target", null);
    const hook = JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "sess-abc" });

    const r1 = runNode("surface-inbound.mjs", { stdin: hook });
    let ctx1 = null;
    try { ctx1 = JSON.parse(r1.stdout.trim()).hookSpecificOutput.additionalContext; } catch { /* */ }
    check("surface announces on first turn", typeof ctx1 === "string" && /2 new direct message/.test(ctx1), ctx1 ? ctx1.split("\n")[0] : "no output");
    check("surface includes fromSession label", !!ctx1 && ctx1.includes("session claude:1"));
    check("surface nudges inbox tool", !!ctx1 && ctx1.includes("`inbox`"));

    const r2 = runNode("surface-inbound.mjs", { stdin: hook });
    check("surface dedups on second turn (silent)", r2.status === 0 && r2.stdout.trim() === "", `stdout='${r2.stdout.trim()}'`);

    // A newly-arrived DM surfaces even after prior ones were marked.
    writeInboxMsg("codex:1", "s3", "a third message arrives later", "claude:1");
    const r3 = runNode("surface-inbound.mjs", { stdin: hook });
    let ctx3 = null;
    try { ctx3 = JSON.parse(r3.stdout.trim()).hookSpecificOutput.additionalContext; } catch { /* */ }
    check("surface announces only the new DM", typeof ctx3 === "string" && /1 new direct message/.test(ctx3), ctx3 ? ctx3.split("\n")[0] : "no output");
  }

  // ── Surfacing: no active agent → silent no-op ─────────────────────────────
  {
    const HOME2 = mkdtempSync(join(tmpdir(), "tp-codex-hooks2-"));
    const r = spawnSync("node", [join(HERE, "hooks", "surface-inbound.mjs")], {
      input: JSON.stringify({ hook_event_name: "SessionStart" }),
      encoding: "utf8",
      env: { ...process.env, TINYPLACE_HARNESS: "codex", TINYPLACE_CODEX_HOME: HOME2 },
    });
    check("surface no-active exits silent", r.status === 0 && r.stdout.trim() === "", `stdout='${r.stdout.trim()}'`);
    rmSync(HOME2, { recursive: true, force: true });
  }
} catch (e) {
  check(`no error (${e.message})`, false);
} finally {
  rmSync(HOME, { recursive: true, force: true });
  console.log(failed ? "\nHOOKS TEST FAILED ❌" : "\nHOOKS TEST PASSED ✅");
  process.exit(failed ? 1 : 0);
}
