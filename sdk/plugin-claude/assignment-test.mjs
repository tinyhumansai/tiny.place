// Offline, deterministic test of per-session wallet assignment.
// Points the backend at an unreachable URL so network steps fail fast and are
// swallowed; we assert only the assignment/isolation/auto-adopt behavior.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "mcp", "server.mjs");
const dataDir = mkdtempSync(join(tmpdir(), "tinyplace-assign-"));
const DEAD_BACKEND = "http://127.0.0.1:1"; // connection refused -> fast, swallowed

function session(sessionId) {
  const child = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, TINYPLACE_CLAUDE_HOME: dataDir, TINYPLACE_API_URL: DEAD_BACKEND, TINYPLACE_SESSION_DAEMON: "off", CLAUDE_CODE_SESSION_ID: sessionId, CLAUDE_PROJECT_DIR: "" },
  });
  let buf = "";
  const pending = new Map();
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    }
  });
  let id = 1;
  const rpc = (method, params) => new Promise((res) => { const i = id++; pending.set(i, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: i, method, params }) + "\n"); });
  const call = async (name, args) => { const r = await rpc("tools/call", { name, arguments: args ?? {} }); try { return JSON.parse(r.result.content[0].text); } catch { return r; } };
  return { child, rpc, call, async init() { await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } }); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n"); }, close() { child.kill(); } };
}

const checks = [];
const expect = (label, cond) => { checks.push({ label, ok: !!cond }); console.log((cond ? "PASS " : "FAIL ") + label); };

// s1: create + assign w1
let s = session("s1"); await s.init();
await s.call("wallet_create", { name: "w1" });
const assignW1 = await s.call("assign", { name: "w1" });
expect("assign w1 → scope is session:s1", assignW1.scope === "session:s1");
expect("assign w1 → assigned w1", assignW1.assigned === "w1");
let who = await s.call("whoami", {});
expect("s1 active is w1 after assign", who.active?.name === "w1");
s.close();

// s1 restart: should auto-adopt w1
s = session("s1"); await s.init();
who = await s.call("whoami", {});
expect("s1 RESTART auto-adopts w1", who.active?.name === "w1" && who.assigned === "w1");
s.close();

// s2 fresh: no assignment yet
s = session("s2"); await s.init();
who = await s.call("whoami", {});
expect("s2 starts with NO active wallet (isolation)", who.active === null && who.assigned === null);
await s.call("wallet_create", { name: "w2" });
await s.call("assign", { name: "w2" });
s.close();

// s2 restart: auto-adopt w2
s = session("s2"); await s.init();
who = await s.call("whoami", {});
expect("s2 RESTART auto-adopts w2", who.active?.name === "w2");
const all = await s.call("assignments", {});
expect("assignments map has both sessions", all.assignments["session:s1"] === "w1" && all.assignments["session:s2"] === "w2");
s.close();

// s1 restart again: still w1, not contaminated by s2
s = session("s1"); await s.init();
who = await s.call("whoami", {});
expect("s1 still w1 (not contaminated by s2)", who.active?.name === "w1");
s.close();

const failed = checks.filter((c) => !c.ok);
console.log("\n" + (failed.length === 0 ? `ALL ${checks.length} CHECKS PASSED ✅` : `${failed.length} FAILED ❌`));
process.exit(failed.length === 0 ? 0 : 1);
