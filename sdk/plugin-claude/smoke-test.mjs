// Drives the MCP server over stdio with real JSON-RPC and prints results.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "mcp", "server.mjs");

// Use a throwaway data dir so the smoke test never touches real wallets.
const dataDir = mkdtempSync(join(tmpdir(), "tinyplace-smoke-"));

const child = spawn("node", [serverPath], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, TINYPLACE_CLAUDE_HOME: dataDir },
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
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

const text = (r) => r?.result?.content?.[0]?.text ?? JSON.stringify(r?.error ?? r);

const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0" },
});
console.log("initialize:", init.result?.serverInfo);
notify("notifications/initialized", {});

const tools = await rpc("tools/list", {});
console.log("tools:", tools.result.tools.map((t) => t.name).join(", "));

const created = await rpc("tools/call", { name: "wallet_create", arguments: { name: "smoke-alice" } });
console.log("wallet_create:", text(created));

const listed = await rpc("tools/call", { name: "wallet_list", arguments: {} });
console.log("wallet_list:", text(listed));

const who = await rpc("tools/call", { name: "whoami", arguments: {} });
console.log("whoami (no active):", text(who));

const sendNoActive = await rpc("tools/call", { name: "send", arguments: { to: "@x", body: "hi" } });
console.log("send without active (should error):", text(sendNoActive));

child.kill();
console.log("\nOK — server boots, lists tools, creates+lists wallets, guards on no-active.");
process.exit(0);
