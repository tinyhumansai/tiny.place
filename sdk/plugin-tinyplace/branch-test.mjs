// Proves the wrapper's core promise: ONE set of core modules, re-wired at runtime
// by the active adapter. The same registry.allocateLabel / format.encodeEnvelope /
// daemon-lock.lockPath produce codex-shaped OR claude-shaped results purely from
// the detected harness — no separate code path. Offline, no node_modules needed.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _resetAdapterCache } from "./mcp/harness.mjs";
import { canForegroundInject, foregroundInject } from "./mcp/foreground-inject.mjs";

const checks = [];
const expect = (label, cond) => { checks.push({ label, ok: !!cond }); console.log((cond ? "PASS " : "FAIL ") + label); };

// Point each harness's data dir at a throwaway tmp dir so nothing touches ~.
process.env.TINYPLACE_CODEX_HOME = mkdtempSync(join(tmpdir(), "tp-branch-codex-"));
process.env.TINYPLACE_CLAUDE_HOME = mkdtempSync(join(tmpdir(), "tp-branch-claude-"));

const reg = await import("./mcp/registry.mjs");
const fmt = await import("./mcp/format.mjs");
const lock = await import("./mcp/daemon-lock.mjs");

const AGENT = "AgentBranchXXXXXXXXXXXXXXXXXXXXXX";

// Flip the process into a harness, drop the memo, return the fresh adapter's view.
function underHarness(name) {
  process.env.TINYPLACE_HARNESS = name;
  _resetAdapterCache();
}

// ── codex harness ────────────────────────────────────────────────────────────
underHarness("codex");
expect("codex: allocateLabel → codex:1", reg.allocateLabel(AGENT) === "codex:1");
expect("codex: sessionsDir under TINYPLACE_CODEX_HOME", reg.sessionsDir(AGENT).startsWith(process.env.TINYPLACE_CODEX_HOME));
expect("codex: lockPath under TINYPLACE_CODEX_HOME", lock.lockPath(AGENT).startsWith(process.env.TINYPLACE_CODEX_HOME));
const codexEnv = JSON.parse(fmt.encodeEnvelope({ text: "hi" }));
expect("codex: envelope harness.provider = codex", codexEnv.harness.provider === "codex");
expect("codex: default sessionLabel = codex:1", fmt.sessionLabel() === "codex:1");

// ── claude harness — SAME modules, different wiring ───────────────────────────
underHarness("claude");
expect("claude: allocateLabel → claude:1", reg.allocateLabel(AGENT) === "claude:1");
expect("claude: sessionsDir under TINYPLACE_CLAUDE_HOME", reg.sessionsDir(AGENT).startsWith(process.env.TINYPLACE_CLAUDE_HOME));
expect("claude: lockPath under TINYPLACE_CLAUDE_HOME", lock.lockPath(AGENT).startsWith(process.env.TINYPLACE_CLAUDE_HOME));
const claudeEnv = JSON.parse(fmt.encodeEnvelope({ text: "hi" }));
expect("claude: envelope harness.provider = claude", claudeEnv.harness.provider === "claude");
expect("claude: envelope harness.command = tinyplace-plugin", claudeEnv.harness.command === "tinyplace-plugin");
expect("claude: default sessionLabel = claude:1", fmt.sessionLabel() === "claude:1");

// The two harnesses must NOT share a data dir (isolation is the whole point).
expect("codex + claude data dirs are distinct", process.env.TINYPLACE_CODEX_HOME !== process.env.TINYPLACE_CLAUDE_HOME);

// ── foreground-inject (the #212 abstraction, now live for both harnesses) ─────
// Both adapters advertise the capability; with no live pane for the agent the call
// fails open (injected:false) so the caller uses the isolated responder.
underHarness("codex");
expect("codex: foreground-inject capability advertised", canForegroundInject() === true);
const fiCodex = foregroundInject("addr", [{ id: "x" }]);
expect("codex: foregroundInject fails open with no pane", fiCodex.injected === false && fiCodex.reason === "no-pane");
underHarness("claude");
expect("claude: foreground-inject capability advertised", canForegroundInject() === true);
expect("claude: foregroundInject fails open with no pane", foregroundInject("addr", []).reason === "no-pane");

const failed = checks.filter((c) => !c.ok);
console.log("\n" + (failed.length === 0 ? `ALL ${checks.length} CHECKS PASSED ✅` : `${failed.length} FAILED ❌`));
process.exit(failed.length === 0 ? 0 : 1);
