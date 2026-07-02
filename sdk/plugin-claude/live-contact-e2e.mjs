// LIVE staging end-to-end WITH the contact handshake the backend now requires
// before DMs flow. Two MCP servers (two sessions), two fresh wallets:
//   1. adopt each identity + publish keys (retried — staging publish is flaky)
//   2. alice contact_add bob  ->  bob contact_accept alice
//   3. real Signal-encrypted round-trip (send_and_wait / await_reply)
// No handle registration. Set BASE via TINYPLACE_API_URL (defaults to staging).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "mcp", "server.mjs");
const dataDir = mkdtempSync(join(tmpdir(), "tinyplace-ce2e-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  return { child, label, call, async init() {
    await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: label, version: "0" } });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
  }};
}

// staging `use` sometimes returns keysPublished:false; re-adopt until it sticks.
async function adoptWithKeys(client, name, tries = 5) {
  let res;
  for (let i = 0; i < tries; i++) {
    res = await client.call("use", { name });
    if (res.keysPublished) return res;
    await sleep(1500);
  }
  return res;
}

const A = makeClient("alice");
const B = makeClient("bob");

try {
  await A.init(); await B.init();
  await A.call("wallet_create", { name: "alice" });
  await A.call("wallet_create", { name: "bob" });

  const aliceActive = await adoptWithKeys(A, "alice");
  const bobActive = await adoptWithKeys(B, "bob");
  console.log("alice keysPublished:", aliceActive.keysPublished, "| bob keysPublished:", bobActive.keysPublished);
  const alicePub = aliceActive.active.publicKey;
  const bobPub = bobActive.active.publicKey;

  await sleep(2000); // let bundles propagate

  // ── contact handshake ──────────────────────────────────────────────────────
  const req = await A.call("contact_add", { to: bobPub });
  console.log("alice contact_add bob:", JSON.stringify(req.requested ?? req));
  await sleep(1000);
  const acc = await B.call("contact_accept", { from: alicePub });
  console.log("bob contact_accept alice:", JSON.stringify(acc.accepted ?? acc));
  await sleep(1000);
  const aContacts = await A.call("contacts");
  console.log("alice contacts:", JSON.stringify(aContacts.contacts ?? aContacts));

  // ── round-trip ─────────────────────────────────────────────────────────────
  const bobWaits = B.call("await_reply", { from: alicePub, timeout_seconds: 40 });
  await sleep(500);
  const aliceRoundTrip = A.call("send_and_wait", { to: bobPub, body: "ping from alice", timeout_seconds: 40 });

  const bobGot = await bobWaits;
  console.log("bob received:", JSON.stringify(bobGot.reply ?? bobGot));
  if (bobGot.reply) await B.call("send", { to: bobGot.reply.from, body: "pong from bob" });

  const aliceResult = await aliceRoundTrip;
  console.log("alice send_and_wait result:", JSON.stringify(aliceResult.reply ?? aliceResult));

  const pass = bobGot?.reply?.text === "ping from alice" && aliceResult?.reply?.text === "pong from bob";
  console.log("\n" + (pass ? "PASS ✅ contact handshake + full encrypted round-trip" : "FAIL ❌ round-trip incomplete"));
  A.child.kill(); B.child.kill();
  process.exit(pass ? 0 : 1);
} catch (e) {
  console.error("ERROR:", e?.message ?? e);
  A.child.kill(); B.child.kill();
  process.exit(2);
}
