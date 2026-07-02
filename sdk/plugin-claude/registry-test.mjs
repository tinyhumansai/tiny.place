// Offline, deterministic test of the session registry: presence liveness
// (fresh / stale / pid-dead), label allocation (default / collision / reuse by
// harnessSessionId), liveSessions/primary, and stale GC. No network.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// registry.mjs reads TINYPLACE_CLAUDE_HOME at import time — set it first.
process.env.TINYPLACE_CLAUDE_HOME = mkdtempSync(join(tmpdir(), "tinyplace-reg-"));
delete process.env.TINYPLACE_SESSION_LIVE_MS; // use the default 30s window
const reg = await import("./mcp/registry.mjs");

const checks = [];
const expect = (label, cond) => {
  checks.push({ label, ok: !!cond });
  console.log((cond ? "PASS " : "FAIL ") + label);
};

const now = () => new Date().toISOString();
const ago = (ms) => new Date(Date.now() - ms).toISOString();

// Write a presence file directly (bypasses writePresence's own-pid/now) so we
// can craft fresh/stale/dead-pid scenarios.
function writeRaw(agent, label, { pid, updatedAt, harnessSessionId = "" }) {
  const dir = reg.sessionsDir(agent);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, encodeURIComponent(label) + ".json"),
    JSON.stringify({ label, pid, harnessSessionId, cwd: "/w", startedAt: updatedAt, updatedAt }) + "\n",
  );
}

// A definitely-dead pid: spawn a child, kill it, wait for exit.
const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1e9)"]);
const deadPid = child.pid;
child.kill("SIGKILL");
await new Promise((r) => child.on("exit", r));

// ── liveness ────────────────────────────────────────────────────────────────
expect("fresh heartbeat + own pid → live", reg.isLive({ updatedAt: now(), pid: process.pid }));
expect("stale heartbeat (60s old) → not live", !reg.isLive({ updatedAt: ago(60_000), pid: process.pid }));
expect("fresh heartbeat + dead pid → not live", !reg.isLive({ updatedAt: now(), pid: deadPid }));
expect("missing updatedAt → not live", !reg.isLive({ pid: process.pid }));
expect("null entry → not live", !reg.isLive(null));

// ── readSessions / liveSessions / primary ────────────────────────────────────
const A = "AgentAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
writeRaw(A, "claude:1", { pid: process.pid, updatedAt: now() });
writeRaw(A, "claude:2", { pid: process.pid, updatedAt: now() });
writeRaw(A, "claude:9", { pid: deadPid, updatedAt: now() }); // dead → not live
writeRaw(A, "claude:8", { pid: process.pid, updatedAt: ago(60_000) }); // stale → not live

const all = reg.readSessions(A);
expect("readSessions returns all 4 entries with live flags", all.length === 4);
const live = reg.liveSessions(A);
expect("liveSessions returns only the 2 live ones", live.length === 2 && live.every((e) => e.live));
expect("liveSessions sorted by label", live[0].label === "claude:1" && live[1].label === "claude:2");
expect("primarySession is lowest live label", reg.primarySession(A)?.label === "claude:1");

// ── label allocation ─────────────────────────────────────────────────────────
const B = "AgentBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
expect("fresh agent → claude:1", reg.allocateLabel(B) === "claude:1");
writeRaw(B, "claude:1", { pid: process.pid, updatedAt: now() });
expect("claude:1 live → allocate claude:2", reg.allocateLabel(B) === "claude:2");
writeRaw(B, "claude:2", { pid: process.pid, updatedAt: now() });
expect("claude:1&2 live → allocate claude:3", reg.allocateLabel(B) === "claude:3");

// requested label: free → honored; colliding with live → next free index
expect("requested free label honored", reg.allocateLabel(B, { requested: "worker" }) === "worker");
expect("requested colliding with live → next claude index", reg.allocateLabel(B, { requested: "claude:1" }) === "claude:3");

// reuse by harnessSessionId even when the prior entry is stale (restart case)
const C = "AgentCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
writeRaw(C, "claude:5", { pid: deadPid, updatedAt: ago(120_000), harnessSessionId: "HSID-RESTART" });
expect("stale entry with same harnessSessionId → reuse its label", reg.allocateLabel(C, { harnessSessionId: "HSID-RESTART" }) === "claude:5");
expect("different harnessSessionId ignores stale label → claude:1", reg.allocateLabel(C, { harnessSessionId: "OTHER" }) === "claude:1");

// ── writePresence / removePresence round-trip (own pid, live) ─────────────────
const D = "AgentDDDDDDDDDDDDDDDDDDDDDDDDDDDD";
reg.writePresence(D, { label: "claude:1", harnessSessionId: "H1", cwd: "/x", startedAt: now() });
const dLive = reg.liveSessions(D);
expect("writePresence → one live session for us", dLive.length === 1 && dLive[0].label === "claude:1" && dLive[0].pid === process.pid);
reg.removePresence(D, "claude:1");
expect("removePresence → no live sessions", reg.liveSessions(D).length === 0);

// ── gcStale removes non-live files, keeps live ────────────────────────────────
reg.gcStale(A);
const dirA = reg.sessionsDir(A);
const remaining = existsSync(dirA) ? readdirSync(dirA).filter((f) => f.endsWith(".json")) : [];
expect("gcStale keeps exactly the 2 live files", remaining.length === 2);
expect("gcStale did not remove live sessions", reg.liveSessions(A).length === 2);

// ── claimLabel: atomic allocate+write, no collision on concurrent start ───────
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const regPath = join(dirname(fileURLToPath(import.meta.url)), "mcp", "registry.mjs");
const E = "AgentClaimEEEEEEEEEEEEEEEEEEEEEE";
function runClaimer(hsid) {
  const src = `
    process.env.TINYPLACE_CLAUDE_HOME = ${JSON.stringify(process.env.TINYPLACE_CLAUDE_HOME)};
    const reg = await import(${JSON.stringify(regPath)});
    const entry = reg.claimLabel(${JSON.stringify(E)}, { harnessSessionId: ${JSON.stringify(hsid)} });
    await new Promise((r) => setTimeout(r, 250)); // hold presence live so peers see it
    process.stdout.write(entry.label);
  `;
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ["--input-type=module", "-e", src], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout.on("data", (d) => (out += d.toString()));
    c.on("exit", () => resolve(out.trim()));
  });
}
const claimLabels = await Promise.all([runClaimer("hA"), runClaimer("hB"), runClaimer("hC")]);
const uniqueLabels = new Set(claimLabels);
expect("3 concurrent claimLabel → 3 DISTINCT labels (no collision)", uniqueLabels.size === 3);
expect("concurrent claims are claude:1/2/3", [...uniqueLabels].sort().join(",") === "claude:1,claude:2,claude:3");

// claimLabel reuses the same label for the same harnessSessionId across restarts.
const F = "AgentClaimFFFFFFFFFFFFFFFFFFFFFF";
const first = reg.claimLabel(F, { harnessSessionId: "restart-me", requested: "worker" });
expect("claimLabel honors an explicit free request", first.label === "worker");
// Simulate restart: our pid is still alive so the file is 'live', but same hsid → reclaim same label.
const again = reg.claimLabel(F, { harnessSessionId: "restart-me" });
expect("claimLabel reuses same label for same harnessSessionId", again.label === "worker");
expect("no duplicate label files after reclaim", reg.readSessions(F).filter((e) => e.label === "worker").length === 1);

const failed = checks.filter((c) => !c.ok);
console.log("\n" + (failed.length === 0 ? `ALL ${checks.length} CHECKS PASSED ✅` : `${failed.length} FAILED ❌`));
process.exit(failed.length === 0 ? 0 : 1);
