#!/usr/bin/env node
// Offline test of foreground-inject (mcp/foreground-inject.mjs): the capability
// predicate, the fail-open fallbacks (no pane / disabled), that the registry
// records the pane, and — when tmux is present — a REAL end-to-end send-keys into
// an idle pane resolved from a live presence entry (+ the per-pane cooldown).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Pin the claude adapter so harnessDataDir() resolves under TINYPLACE_CLAUDE_HOME.
process.env.TINYPLACE_HARNESS = "claude";
process.env.TINYPLACE_CLAUDE_HOME = mkdtempSync(join(tmpdir(), "tinyplace-inject-"));
delete process.env.TINYPLACE_FOREGROUND_RESOLVE;
delete process.env.TMUX;
delete process.env.TMUX_PANE;

const { canForegroundInject, foregroundInject } = await import("./mcp/foreground-inject.mjs");
const { writePresence, liveSessions } = await import("./mcp/registry.mjs");
const { claudeAdapter } = await import("./adapters/claude.mjs");
const { codexAdapter } = await import("./adapters/codex.mjs");

const checks = [];
const expect = (label, cond) => { checks.push({ label, ok: !!cond }); console.log((cond ? "PASS " : "FAIL ") + label); };

const AGENT = "AgentInject11111111111111111111";

// ── capability predicate ─────────────────────────────────────────────────────
expect("claude adapter opts into foreground inject", canForegroundInject(claudeAdapter) === true);
expect("codex adapter opts into foreground inject", canForegroundInject(codexAdapter) === true);
expect("adapter without the flag → false", canForegroundInject({ inbound: {} }) === false);
expect("missing adapter → false", canForegroundInject(null) === false);

// ── fail-open: no live pane anywhere → not injected, caller falls back ─────────
{
  const r = foregroundInject(AGENT, [], {});
  expect("no live pane → injected:false reason:no-pane", r.injected === false && r.reason === "no-pane");
}

// ── registry records the pane/socket from the environment ─────────────────────
{
  const B = "AgentInject22222222222222222222";
  process.env.TMUX_PANE = "%7";
  process.env.TMUX = "/tmp/some.sock,4242,0";
  writePresence(B, { label: "claude:1" });
  delete process.env.TMUX_PANE;
  delete process.env.TMUX;
  const s = liveSessions(B)[0];
  expect("writePresence records tmuxPane", s?.tmuxPane === "%7");
  expect("writePresence records tmuxSocket (first $TMUX field)", s?.tmuxSocket === "/tmp/some.sock");
}

// ── disabled via env → not injected even with a pane present ──────────────────
{
  const C = "AgentInject33333333333333333333";
  process.env.TMUX_PANE = "%1";
  process.env.TMUX = "/tmp/x.sock,1,0";
  writePresence(C, { label: "claude:1" });
  delete process.env.TMUX_PANE;
  delete process.env.TMUX;
  process.env.TINYPLACE_FOREGROUND_RESOLVE = "off";
  const r = foregroundInject(C, [], {});
  delete process.env.TINYPLACE_FOREGROUND_RESOLVE;
  expect("TINYPLACE_FOREGROUND_RESOLVE=off → injected:false reason:disabled", r.injected === false && r.reason === "disabled");
}

// ── real end-to-end via tmux (skipped if tmux is unavailable) ─────────────────
const tmuxOk = (() => { try { return spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0; } catch { return false; } })();
if (!tmuxOk) {
  console.log("SKIP end-to-end tmux inject — tmux not installed");
} else {
  const sock = join(process.env.TINYPLACE_CLAUDE_HOME, "inject.sock");
  const T = ["-S", sock];
  try {
    // An idle pane running `cat` echoes whatever is typed into it, so capture-pane
    // proves the trigger keystrokes actually landed.
    execFileSync("tmux", [...T, "new-session", "-d", "-s", "s0", "cat"], { stdio: "ignore" });
    const pane = execFileSync("tmux", [...T, "list-panes", "-t", "s0", "-F", "#{pane_id}"]).toString().trim();

    // Register a live session whose presence points at that real pane + socket.
    const D = "AgentInject44444444444444444444";
    process.env.TMUX_PANE = pane;
    process.env.TMUX = `${sock},0,0`;
    writePresence(D, { label: "claude:1" });
    delete process.env.TMUX_PANE;
    delete process.env.TMUX;
    expect("presence resolves the real pane", liveSessions(D)[0]?.tmuxPane === pane);

    const r1 = foregroundInject(D, [], {});
    expect("inject into a live idle pane → injected:true reason:sent", r1.injected === true && r1.reason === "sent");

    spawnSync("sleep", ["0.2"]); // let the pane render the echoed keystrokes
    const shown = execFileSync("tmux", [...T, "capture-pane", "-t", pane, "-p"]).toString();
    expect("the trigger keystrokes reached the pane", shown.includes("tiny.place"));

    // A second immediate call is cooldown-suppressed (batch already woken).
    const r2 = foregroundInject(D, [], {});
    expect("second immediate inject → injected:true reason:cooldown", r2.injected === true && r2.reason === "cooldown");
  } finally {
    spawnSync("tmux", [...T, "kill-server"], { stdio: "ignore" });
  }
}

const failed = checks.filter((c) => !c.ok);
console.log("\n" + (failed.length === 0 ? `ALL ${checks.length} CHECKS PASSED ✅` : `${failed.length} FAILED ❌`));
process.exit(failed.length === 0 ? 0 : 1);
