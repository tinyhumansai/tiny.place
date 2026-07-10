#!/usr/bin/env node
// Proves the "one plugin, any harness" pivot: from an env bag alone, the package
// detects the harness and hands back the correct adapter, fully wired.
import { detectHarness, resolveAdapter, harnessDataDir } from "./mcp/harness.mjs";

let failed = false;
const check = (n, c, x) => { console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); if (!c) failed = true; };

// ── detection from env signals ────────────────────────────────────────────────
check("codex via CODEX_HOME", detectHarness({ CODEX_HOME: "/x" }) === "codex");
check("codex via CODEX_SESSION_ID", detectHarness({ CODEX_SESSION_ID: "s" }) === "codex");
check("codex via CODEX_THREAD_ID", detectHarness({ CODEX_THREAD_ID: "t" }) === "codex");
check("claude via CLAUDE_PLUGIN_ROOT", detectHarness({ CLAUDE_PLUGIN_ROOT: "/p" }) === "claude");
check("claude via CLAUDE_CODE_SESSION_ID", detectHarness({ CLAUDE_CODE_SESSION_ID: "s" }) === "claude");
// Cursor exposes no ambient signal to the MCP subprocess (verified), so its
// detection rides the self-provisioned TINYPLACE_CURSOR_HOME the install sets.
check("cursor via TINYPLACE_CURSOR_HOME", detectHarness({ TINYPLACE_CURSOR_HOME: "/c" }) === "cursor");
// Windsurf (now Devin Desktop) likewise leaks no MCP-subprocess signal; detection
// rides the self-provisioned TINYPLACE_WINDSURF_HOME the install sets.
check("windsurf via TINYPLACE_WINDSURF_HOME", detectHarness({ TINYPLACE_WINDSURF_HOME: "/w" }) === "windsurf");
check("default = claude (no signals)", detectHarness({}) === "claude");

// ── explicit override wins over signals ───────────────────────────────────────
check("override forces codex", detectHarness({ TINYPLACE_HARNESS: "codex", CLAUDE_PLUGIN_ROOT: "/p" }) === "codex");
check("override forces claude", detectHarness({ TINYPLACE_HARNESS: "claude", CODEX_HOME: "/x" }) === "claude");
check("override forces cursor", detectHarness({ TINYPLACE_HARNESS: "cursor", CODEX_HOME: "/x" }) === "cursor");
check("override forces windsurf", detectHarness({ TINYPLACE_HARNESS: "windsurf", CODEX_HOME: "/x" }) === "windsurf");
check("bad override ignored → signal", detectHarness({ TINYPLACE_HARNESS: "nope", CODEX_HOME: "/x" }) === "codex");
check("override case-insensitive", detectHarness({ TINYPLACE_HARNESS: "CODEX" }) === "codex");

// ── adapter wiring: codex ─────────────────────────────────────────────────────
{
  const a = resolveAdapter({ CODEX_HOME: "/x" });
  check("codex adapter provider", a.provider === "codex");
  check("codex label prefix", a.sessionLabelPrefix === "codex");
  check("codex dataDirEnv", a.dataDirEnv === "TINYPLACE_CODEX_HOME");
  check("codex pull-only (no push)", a.inbound.push === false && a.inbound.pull === true);
  check("codex has foreground inject slot", a.inbound.foregroundInject === true);
  check("codex responder = codex exec", a.responder.command === "codex" && a.responder.buildArgs("P", "M").includes("exec"));
  check("codex install kind", a.install.kind === "codex-home");
}

// ── adapter wiring: claude ────────────────────────────────────────────────────
{
  const a = resolveAdapter({ CLAUDE_PLUGIN_ROOT: "/p" });
  check("claude adapter provider", a.provider === "claude");
  check("claude label prefix", a.sessionLabelPrefix === "claude");
  check("claude has push capability", a.inbound.push && a.inbound.push.capability === "claude/channel");
  check("claude not pull", a.inbound.pull === false);
  check("claude has foreground inject slot", a.inbound.foregroundInject === true);
  check("claude responder = claude -p", a.responder.command === "claude" && a.responder.buildArgs("P", "M", "/root").includes("-p"));
  check("claude install kind", a.install.kind === "plugin-dir");
}

// ── adapter wiring: cursor ────────────────────────────────────────────────────
{
  const a = resolveAdapter({ TINYPLACE_CURSOR_HOME: "/c" });
  check("cursor adapter provider", a.provider === "cursor");
  check("cursor label prefix", a.sessionLabelPrefix === "cursor");
  check("cursor dataDirEnv", a.dataDirEnv === "TINYPLACE_CURSOR_HOME");
  check("cursor pull-only (no push, no inject)", a.inbound.push === false && a.inbound.pull === true && a.inbound.foregroundInject === false);
  check("cursor responder = cursor-agent -p", a.responder.command === "cursor-agent" && a.responder.buildArgs("P", "M").includes("-p"));
  check("cursor install kind", a.install.kind === "mcp-json");
}

// ── adapter wiring: windsurf (Devin Desktop) ──────────────────────────────────
{
  const a = resolveAdapter({ TINYPLACE_WINDSURF_HOME: "/w" });
  check("windsurf adapter provider", a.provider === "windsurf");
  check("windsurf label prefix", a.sessionLabelPrefix === "windsurf");
  check("windsurf dataDirEnv", a.dataDirEnv === "TINYPLACE_WINDSURF_HOME");
  check("windsurf pull-only (no push, no inject)", a.inbound.push === false && a.inbound.pull === true && a.inbound.foregroundInject === false);
  check("windsurf responder = devin -p", a.responder.command === "devin" && a.responder.buildArgs("P", "M").includes("-p"));
  check("windsurf install kind", a.install.kind === "mcp-json");
}

// ── session-id resolution is per-harness ──────────────────────────────────────
{
  const codex = resolveAdapter({ CODEX_HOME: "/x" });
  const claude = resolveAdapter({ CLAUDE_PLUGIN_ROOT: "/p" });
  process.env.CODEX_SESSION_ID = "cx-123";
  process.env.CLAUDE_CODE_SESSION_ID = "cl-456";
  check("codex resolves CODEX_SESSION_ID", codex.resolveHarnessSessionId() === "cx-123");
  check("claude resolves CLAUDE_CODE_SESSION_ID", claude.resolveHarnessSessionId() === "cl-456");
  delete process.env.CODEX_SESSION_ID;
  delete process.env.CLAUDE_CODE_SESSION_ID;
}

// ── data dir: env override beats default ──────────────────────────────────────
{
  const a = resolveAdapter({ CODEX_HOME: "/x" });
  process.env.TINYPLACE_CODEX_HOME = "/tmp/custom-codex";
  check("dataDir honors env override", harnessDataDir(a) === "/tmp/custom-codex");
  delete process.env.TINYPLACE_CODEX_HOME;
  check("dataDir falls back to default", harnessDataDir(a) === a.dataDirDefault);
}

console.log(failed ? "\nHARNESS TEST FAILED ❌" : "\nHARNESS TEST PASSED ✅");
process.exit(failed ? 1 : 0);
