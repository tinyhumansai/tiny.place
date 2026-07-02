// LIVE end-to-end test against staging: two MCP server instances (two sessions),
// two wallets, a real Signal-encrypted round-trip including send_and_wait.
// No funds, no handle. Set BASE via TINYPLACE_API_URL (defaults to staging).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "mcp", "server.mjs");
const dataDir = mkdtempSync(join(tmpdir(), "tinyplace-e2e-"));

function makeClient(label) {
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
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });
  let nextId = 1;
  const rpc = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  const call = async (name, args) => {
    const r = await rpc("tools/call", { name, arguments: args ?? {} });
    const t = r?.result?.content?.[0]?.text;
    try { return JSON.parse(t); } catch { return r?.error ?? r; }
  };
  return { child, label, rpc, call, async init() {
    await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: label, version: "0" } });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
  }};
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = makeClient("alice");
const B = makeClient("bob");

try {
  await A.init(); await B.init();

  // Create both wallets (shared store) from session A.
  await A.call("wallet_create", { name: "alice" });
  await A.call("wallet_create", { name: "bob" });

  // Each session adopts a different identity + publishes keys + starts listening.
  const aliceActive = await A.call("use", { name: "alice" });
  const bobActive = await B.call("use", { name: "bob" });
  console.log("alice active:", aliceActive.active?.address, "keysPublished:", aliceActive.keysPublished);
  console.log("bob   active:", bobActive.active?.address, "keysPublished:", bobActive.keysPublished);

  const alicePub = aliceActive.active.publicKey;
  const bobPub = bobActive.active.publicKey;

  await sleep(2000); // let key bundles propagate

  // Bob starts waiting for a message from alice (concurrently).
  const bobWaits = B.call("await_reply", { from: alicePub, timeout_seconds: 40 });

  await sleep(500);
  // Alice sends "ping" and synchronously waits for bob's reply.
  const aliceRoundTrip = A.call("send_and_wait", { to: bobPub, body: "ping from alice", timeout_seconds: 40 });

  // Bob receives ping, replies "pong".
  const bobGot = await bobWaits;
  console.log("bob received:", JSON.stringify(bobGot.reply ?? bobGot));
  if (bobGot.reply) {
    await B.call("send", { to: bobGot.reply.from, body: "pong from bob" });
  }

  const aliceResult = await aliceRoundTrip;
  console.log("alice send_and_wait result:", JSON.stringify(aliceResult.reply ?? aliceResult));

  const pass =
    bobGot?.reply?.text === "ping from alice" &&
    aliceResult?.reply?.text === "pong from bob";
  console.log("\n" + (pass ? "PASS ✅ full encrypted round-trip + synchronous send_and_wait" : "FAIL ❌ round-trip incomplete"));
  A.child.kill(); B.child.kill();
  process.exit(pass ? 0 : 1);
} catch (e) {
  console.error("ERROR:", e?.message ?? e);
  A.child.kill(); B.child.kill();
  process.exit(2);
}
