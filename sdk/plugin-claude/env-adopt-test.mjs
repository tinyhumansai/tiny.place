// Offline, deterministic test of TINYPLACE_ACTIVE_WALLET auto-adopt ("Door B":
// the `tinyplace` TUI launcher boots Claude already pointed at a wallet).
// Points the backend at an unreachable URL so network steps fail fast and are
// swallowed; we assert only the env-adopt / precedence behavior.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "mcp", "server.mjs");
const dataDir = mkdtempSync(join(tmpdir(), "tinyplace-envadopt-"));
const DEAD_BACKEND = "http://127.0.0.1:1"; // connection refused -> fast, swallowed

function session({ sessionId = "s", active } = {}) {
  const env = {
    ...process.env,
    TINYPLACE_CLAUDE_HOME: dataDir,
    TINYPLACE_API_URL: DEAD_BACKEND,
    TINYPLACE_SESSION_DAEMON: "off",
    CLAUDE_CODE_SESSION_ID: sessionId,
    CLAUDE_PROJECT_DIR: "",
  };
  if (active === undefined) delete env.TINYPLACE_ACTIVE_WALLET;
  else env.TINYPLACE_ACTIVE_WALLET = active;

  const child = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "ignore"], env });
  let buf = "";
  const pending = new Map();
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    }
  });
  let id = 1;
  const rpc = (method, params) => new Promise((res) => {
    const i = id++;
    pending.set(i, res);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: i, method, params }) + "\n");
  });
  const call = async (name, args) => {
    const r = await rpc("tools/call", { name, arguments: args ?? {} });
    try { return JSON.parse(r.result.content[0].text); } catch { return r; }
  };
  return {
    child, rpc, call,
    async init() {
      await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
    },
    close() { child.kill(); },
  };
}

const checks = [];
const expect = (label, cond) => { checks.push({ ok: !!cond }); console.log((cond ? "PASS " : "FAIL ") + label); };

// setup: create w1 + w2 in the shared store (no assignment).
let s = session({ sessionId: "setup" });
await s.init();
await s.call("wallet_create", { name: "w1" });
await s.call("wallet_create", { name: "w2" });
s.close();

// 1. env alone auto-adopts (fresh session id, no assignment for it)
s = session({ sessionId: "envonly", active: "w1" });
await s.init();
let who = await s.call("whoami", {});
expect("TINYPLACE_ACTIVE_WALLET=w1 auto-adopts w1", who.active?.name === "w1");
s.close();

// 2. precedence: assign w2 to session 'prec', then restart it WITH env=w1 -> env wins
s = session({ sessionId: "prec" });
await s.init();
await s.call("assign", { name: "w2" });
s.close();

s = session({ sessionId: "prec", active: "w1" });
await s.init();
who = await s.call("whoami", {});
expect("env=w1 overrides scope assignment=w2", who.active?.name === "w1" && who.assigned === "w2");
s.close();

// 3. without env, that same session falls back to its assignment (w2)
s = session({ sessionId: "prec" });
await s.init();
who = await s.call("whoami", {});
expect("no env -> scope assignment w2 still used", who.active?.name === "w2");
s.close();

// 4. unknown env wallet -> no active, no crash
s = session({ sessionId: "ghost", active: "does-not-exist" });
await s.init();
who = await s.call("whoami", {});
expect("unknown TINYPLACE_ACTIVE_WALLET -> no active, no crash", who.active === null);
s.close();

const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed === checks.length ? "ALL " + checks.length + " CHECKS PASSED ✅" : (checks.length - passed) + " FAILED ❌"}`);
process.exit(passed === checks.length ? 0 : 1);
