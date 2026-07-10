// Runtime harness detection — the one-plugin-any-harness pivot. The package is
// installed once; at load time it figures out WHICH harness it runs inside
// (Codex, Claude Code, …) and hands the shared core the matching adapter. No
// per-harness package, no user wiring.
import { homedir } from "node:os";
import { join } from "node:path";

import { claudeAdapter } from "../adapters/claude.mjs";
import { codexAdapter } from "../adapters/codex.mjs";
import { cursorAdapter } from "../adapters/cursor.mjs";
import { mockAdapter } from "../adapters/mock.mjs";
import { windsurfAdapter } from "../adapters/windsurf.mjs";

// `mock` is a deterministic test harness. It is NEVER auto-detected (no env
// signal in detectHarness) — only reachable via the explicit TINYPLACE_HARNESS
// override — so it adds no risk to the real Claude/Codex paths.
const ADAPTERS = { claude: claudeAdapter, codex: codexAdapter, cursor: cursorAdapter, windsurf: windsurfAdapter, mock: mockAdapter };

// Detect the harness from the environment. Order:
//   1. explicit override (TINYPLACE_HARNESS) — escape hatch / launcher-set,
//   2. harness-specific env signals,
//   3. safe default (claude).
// Pure over an env bag so it's unit-testable without mutating process.env.
export function detectHarness(env = process.env) {
  const explicit = env.TINYPLACE_HARNESS?.trim().toLowerCase();
  if (explicit && ADAPTERS[explicit]) return explicit;

  // Codex signals — CODEX_HOME is set for every Codex subprocess; the session/
  // thread ids appear in some contexts. Any one is conclusive.
  if (env.CODEX_HOME || env.CODEX_SESSION_ID || env.CODEX_THREAD_ID) return "codex";

  // Claude Code signals — plugin root is exported to plugin subprocesses; the
  // session id is present in hook/tool contexts.
  if (env.CLAUDE_PLUGIN_ROOT || env.CLAUDE_CODE_SESSION_ID) return "claude";

  // Cursor exposes NO ambient signal to an MCP subprocess (verified: only
  // HOME/PATH/SHELL/… reach the child). Detection is therefore self-provisioned:
  // the cursor install writes TINYPLACE_HARNESS=cursor (the override above) and
  // TINYPLACE_CURSOR_HOME into the mcp.json env block. Treat the dedicated home
  // var as the cursor signal so a manually-installed server still self-detects.
  if (env.TINYPLACE_CURSOR_HOME) return "cursor";

  // Windsurf (Devin Desktop) likewise exposes no confirmed MCP-subprocess signal;
  // detection is self-provisioned via TINYPLACE_HARNESS=windsurf (the override
  // above) + TINYPLACE_WINDSURF_HOME written into the mcp_config.json env block.
  if (env.TINYPLACE_WINDSURF_HOME) return "windsurf";

  return "claude";
}

// The adapter for the detected (or forced) harness.
export function resolveAdapter(env = process.env) {
  return ADAPTERS[detectHarness(env)];
}

let _cached = null;
// The active adapter for THIS process (memoized). The shared core calls this once.
export function activeAdapter() {
  if (!_cached) _cached = resolveAdapter();
  return _cached;
}

// Test seam: drop the memo so a test can re-detect under a different env.
export function _resetAdapterCache() {
  _cached = null;
}

// Convenience: the resolved data dir for the active harness (env override wins).
export function harnessDataDir(adapter = activeAdapter()) {
  return process.env[adapter.dataDirEnv]?.trim() || adapter.dataDirDefault || join(homedir(), ".tinyplace");
}

export { ADAPTERS };
