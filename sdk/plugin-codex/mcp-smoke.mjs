// Offline MCP boot smoke: spawn the server over stdio, run initialize +
// tools/list via raw newline-delimited JSON-RPC, assert the expected tool set
// registers. No Codex, no relay, no wallet required.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPECTED = [
  "wallet_create", "wallet_list", "use", "assign", "unassign", "assignments",
  "whoami", "sessions", "send", "auto_reply", "send_and_wait", "await_reply",
  "check_reply", "inbox", "contact_add", "contact_accept", "contact_requests",
  "contacts", "autorespond", "reset_session",
];

const child = spawn("node", [join(HERE, "mcp", "server.mjs")], {
  stdio: ["pipe", "pipe", "inherit"],
  env: {
    ...process.env,
    TINYPLACE_CODEX_HOME: mkdtempSync(join(tmpdir(), "tinyplace-codex-smoke-")),
    TINYPLACE_SESSION_DAEMON: "off",
    TINYPLACE_AUTORESPOND: "off",
    TINYPLACE_API_URL: "https://staging-api.tiny.place",
  },
});

let buf = "";
const pending = new Map();
child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let idc = 0;
function rpc(method, params) {
  const id = ++idc;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 8000);
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

let failed = false;
const check = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failed = true;
};

try {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0" },
  });
  check("initialize returns serverInfo.name=tinyplace", init.result?.serverInfo?.name === "tinyplace");
  check("server declares no channel capability (pull-only)", !init.result?.capabilities?.experimental?.["claude/channel"]);
  notify("notifications/initialized", {});

  const list = await rpc("tools/list", {});
  const names = (list.result?.tools ?? []).map((t) => t.name).sort();
  check(`tools/list returns ${EXPECTED.length} tools`, names.length === EXPECTED.length);
  for (const t of EXPECTED) check(`tool present: ${t}`, names.includes(t));
} catch (e) {
  check(`no error (${e.message})`, false);
} finally {
  child.kill();
  console.log(failed ? "\nSMOKE FAILED ❌" : "\nALL SMOKE CHECKS PASSED ✅");
  process.exit(failed ? 1 : 0);
}
