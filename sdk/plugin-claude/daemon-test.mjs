// Offline, deterministic test of the per-agent daemon lifecycle + thin-client
// session wiring. Two parts:
//   1. the daemon boots, takes the lock, and idle-exits (releasing it) when the
//      agent has no live sessions;
//   2. a session with a (faked) live daemon runs in thin-client mode: sends go to
//      the _outbox queue, and inbox/check_reply read the session's inbox/ queue.
// Dead backend → all network steps fail fast and are swallowed.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "mcp", "server.mjs");
const daemonPath = join(here, "hooks", "agent-daemon.mjs");
const DEAD_BACKEND = "http://127.0.0.1:1";

process.env.TINYPLACE_CLAUDE_HOME = mkdtempSync(join(tmpdir(), "tinyplace-daemon-"));
const dataDir = process.env.TINYPLACE_CLAUDE_HOME;
const lock = await import("./mcp/daemon-lock.mjs");
const routing = await import("./mcp/routing.mjs");
const outbox = await import("./mcp/outbox.mjs");

const checks = [];
const expect = (label, cond) => { checks.push({ label, ok: !!cond }); console.log((cond ? "PASS " : "FAIL ") + label); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function server(sessionId, extraEnv = {}) {
  const child = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, TINYPLACE_CLAUDE_HOME: dataDir, TINYPLACE_API_URL: DEAD_BACKEND, CLAUDE_CODE_SESSION_ID: sessionId, CLAUDE_PROJECT_DIR: "", ...extraEnv },
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

// ── setup: create a wallet, capture its address ──────────────────────────────
let s = server("setup", { TINYPLACE_SESSION_DAEMON: "off" });
await s.init();
await s.call("wallet_create", { name: "d1" });
const list = await s.call("wallet_list", {});
const AGENT = list.wallets.find((w) => w.name === "d1").address;
s.close();
await sleep(150);

// ── part 1: daemon boots, takes the lock, idle-exits ─────────────────────────
const daemon = spawn("node", [daemonPath], {
  stdio: "ignore",
  env: { ...process.env, TINYPLACE_DAEMON_WALLET: "d1", TINYPLACE_CLAUDE_HOME: dataDir, TINYPLACE_API_URL: DEAD_BACKEND, TINYPLACE_DAEMON_IDLE_MS: "500", TINYPLACE_DAEMON_POLL_MS: "120", TINYPLACE_DAEMON_HEARTBEAT_MS: "120" },
});
let exited = false;
daemon.on("exit", () => { exited = true; });

let becameLive = false;
for (let i = 0; i < 30; i++) { await sleep(100); if (lock.daemonLive(AGENT)) { becameLive = true; break; } }
expect("daemon acquires its lock on boot", becameLive);

// no live sessions → daemon idle-exits within a couple of IDLE windows
for (let i = 0; i < 30 && !exited; i++) await sleep(100);
expect("daemon idle-exits when no live sessions", exited);
expect("daemon releases its lock on exit", !lock.daemonLive(AGENT));

// ── part 2: thin-client mode against a FAKE live daemon ──────────────────────
// A sleeper stands in for the daemon so the session enters daemon mode without a
// real drainer consuming the outbox we want to assert on.
const sleeper = spawn(process.execPath, ["-e", "setInterval(()=>{},1e9)"]);
mkdirSync(dirname(lock.lockPath(AGENT)), { recursive: true });
writeFileSync(lock.lockPath(AGENT), JSON.stringify({ pid: sleeper.pid, wallet: "d1", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
expect("fake daemon lock reads as live", lock.daemonLive(AGENT));

const thin = server("thin-1"); // daemon default ON
await thin.init();
const used = await thin.call("use", { name: "d1" });
expect("session enters daemon (thin-client) mode", used.mode === "daemon" && used.daemon === "running");
expect("session label is claude:1", used.label === "claude:1");

// send → an outbox job (the daemon would send it); nothing hits the relay here.
const sent = await thin.call("send", { to: "@peer", body: "hello peer", to_session: "claude:2" });
expect("send returns via=daemon + an id", sent.sent?.via === "daemon" && typeof sent.sent?.id === "string");
const outFiles = existsSync(outbox.outboxDir(AGENT)) ? readdirSync(outbox.outboxDir(AGENT)).filter((f) => f.endsWith(".json")) : [];
expect("send wrote one outbox job", outFiles.length === 1);
const job = JSON.parse(readFileSync(join(outbox.outboxDir(AGENT), outFiles[0]), "utf8"));
expect("outbox job carries to/text/fromSession/toSession", job.to === "@peer" && job.text === "hello peer" && job.fromSession === "claude:1" && job.toSession === "claude:2");
expect("outbox job id matches the send id", job.id === sent.sent.id);

// inbox → reads the session's inbox/ queue (what the daemon routes to us).
const inboxDir = routing.sessionInboxDir(AGENT, "claude:1");
mkdirSync(inboxDir, { recursive: true });
writeFileSync(join(inboxDir, "in1.json"), JSON.stringify({ id: "in1", from: "peerK", fromSession: "claude:3", role: "agent", text: "incoming!", inReplyTo: null, ts: new Date().toISOString() }));
const inbox = await thin.call("inbox", {});
expect("inbox returns the daemon-routed message", inbox.count === 1 && inbox.messages[0].id === "in1" && inbox.messages[0].text === "incoming!");
expect("inbox surfaces fromSession/role", inbox.messages[0].fromSession === "claude:3" && inbox.messages[0].role === "agent");

// check_reply → correlates a routed reply to our sent id.
writeFileSync(join(inboxDir, "rep1.json"), JSON.stringify({ id: "rep1", from: "peerP", fromSession: "claude:2", role: "agent", text: "the answer", inReplyTo: sent.sent.id, ts: new Date().toISOString() }));
const rep = await thin.call("check_reply", { in_reply_to: sent.sent.id, wait_seconds: 3 });
expect("check_reply correlates the routed reply by id", rep.reply?.id === "rep1" && rep.reply?.inReplyTo === sent.sent.id && rep.reply?.text === "the answer");

thin.close();
sleeper.kill("SIGKILL");

const failed = checks.filter((c) => !c.ok);
console.log("\n" + (failed.length === 0 ? `ALL ${checks.length} CHECKS PASSED ✅` : `${failed.length} FAILED ❌`));
process.exit(failed.length === 0 ? 0 : 1);
