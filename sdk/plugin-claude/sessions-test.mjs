// Offline, deterministic test that two MCP servers sharing one wallet register
// as two distinct sessions (claude:1 / claude:2) and see each other via the
// `sessions` tool + whoami. Dead backend → network steps fail fast + swallowed.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "mcp", "server.mjs");
const dataDir = mkdtempSync(join(tmpdir(), "tinyplace-sessions-"));
const DEAD_BACKEND = "http://127.0.0.1:1";

function session(sessionId, extraEnv = {}) {
  const child = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "ignore"],
    env: {
      ...process.env,
      TINYPLACE_CLAUDE_HOME: dataDir,
      TINYPLACE_API_URL: DEAD_BACKEND,
      CLAUDE_CODE_SESSION_ID: sessionId,
      CLAUDE_PROJECT_DIR: "",
      ...extraEnv,
    },
  });
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
  const rpc = (method, params) => new Promise((res) => { const i = id++; pending.set(i, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: i, method, params }) + "\n"); });
  const call = async (name, args) => { const r = await rpc("tools/call", { name, arguments: args ?? {} }); try { return JSON.parse(r.result.content[0].text); } catch { return r; } };
  return {
    child, call,
    async init() { await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } }); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n"); },
    close() { child.kill(); },
  };
}

const checks = [];
const expect = (label, cond) => { checks.push({ label, ok: !!cond }); console.log((cond ? "PASS " : "FAIL ") + label); };

// s1 creates the wallet + uses it → claude:1
const s1 = session("sess-1");
await s1.init();
await s1.call("wallet_create", { name: "shared" });
const use1 = await s1.call("use", { name: "shared" });
expect("s1 use → label claude:1", use1.label === "claude:1");
const who1 = await s1.call("whoami", {});
expect("s1 whoami reports label claude:1", who1.label === "claude:1");
expect("s1 whoami lists exactly itself (1 live)", who1.sessions?.length === 1 && who1.sessions[0].self === true);

// s2 uses the SAME wallet → claude:2 (claude:1 is live)
const s2 = session("sess-2");
await s2.init();
const use2 = await s2.call("use", { name: "shared" });
expect("s2 use SAME wallet → label claude:2", use2.label === "claude:2");

// both sessions now see 2 live sessions
const list1 = await s1.call("sessions", {});
expect("s1 sessions → 2 live", list1.count === 2 && list1.sessions.map((x) => x.label).sort().join(",") === "claude:1,claude:2");
const list2 = await s2.call("sessions", {});
expect("s2 sessions → 2 live, self=claude:2", list2.count === 2 && list2.thisLabel === "claude:2" && list2.sessions.find((x) => x.label === "claude:2")?.self === true);

// explicit label request: s3 asks for claude:1 (taken) → falls to claude:3
const s3 = session("sess-3");
await s3.init();
const use3 = await s3.call("use", { name: "shared", label: "claude:1" });
expect("s3 requests taken label claude:1 → falls back to claude:3", use3.label === "claude:3");

// s3 requests a free custom label on a fresh restart id → honored
s3.close();
const s3b = session("sess-3", { TINYPLACE_SESSION_LABEL: "" });
await s3b.init();
const use3b = await s3b.call("use", { name: "shared", label: "reviewer" });
expect("custom free label honored", use3b.label === "reviewer");

// stable label across restart: same CLAUDE_CODE_SESSION_ID reuses its label
const who3b = await s3b.call("whoami", {});
expect("s3b whoami harnessSessionId is its session id", who3b.harnessSessionId === "sess-3");
s3b.close();
const s3c = session("sess-3");
await s3c.init();
const use3c = await s3c.call("use", { name: "shared" });
expect("restart of same harness session reuses label 'reviewer'", use3c.label === "reviewer");

s1.close(); s2.close(); s3c.close();

const failed = checks.filter((c) => !c.ok);
console.log("\n" + (failed.length === 0 ? `ALL ${checks.length} CHECKS PASSED ✅` : `${failed.length} FAILED ❌`));
process.exit(failed.length === 0 ? 0 : 1);
