// LIVE staging test of the id-correlated request→reply path (no interactive
// Claude — drives the MCP tools directly to simulate what an auto-responder does):
//   alice: send(to=bob) -> id
//   bob:   check_reply(from=alice) -> receives, then auto_reply(in_reply_to=id)
//   alice: check_reply(in_reply_to=id) -> gets the tagged reply, correlated
// Asserts: the reply is matched by id, carries inReplyTo, and text is stripped
// of the control header. Set BASE via TINYPLACE_API_URL (defaults to staging).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "mcp", "server.mjs");
const dataDir = mkdtempSync(join(tmpdir(), "tinyplace-ar-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeClient() {
  const child = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "inherit"], env: { ...process.env, TINYPLACE_CLAUDE_HOME: dataDir } });
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
  return { child, call, async init() { await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } }); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n"); } };
}
async function adoptWithKeys(c, name, tries = 5) { let r; for (let i = 0; i < tries; i++) { r = await c.call("use", { name }); if (r.keysPublished) return r; await sleep(1500); } return r; }
async function pollReply(c, matchArgs, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const r = await c.call("check_reply", { ...matchArgs, wait_seconds: 10 });
    if (r.reply) return r.reply;
  }
  return null;
}

const checks = [];
const expect = (label, cond) => { checks.push(!!cond); console.log((cond ? "PASS " : "FAIL ") + label); };

const A = makeClient(); const B = makeClient();
try {
  await A.init(); await B.init();
  await A.call("wallet_create", { name: "alice" });
  await A.call("wallet_create", { name: "bob" });
  const a = await adoptWithKeys(A, "alice");
  const b = await adoptWithKeys(B, "bob");
  await sleep(1500);
  await A.call("contact_add", { to: b.active.publicKey });
  await sleep(800);
  await B.call("contact_accept", { from: a.active.publicKey });
  await sleep(800);

  // alice asks; capture the message id.
  const sent = await A.call("send", { to: b.active.publicKey, body: "what is 17 + 25?" });
  const sentId = sent?.sent?.id;
  expect("send returned a message id", !!sentId);

  // bob receives (poll by sender), then auto-replies threaded to that id.
  const bobGot = await pollReply(B, { from: a.active.publicKey });
  expect("bob received alice's message", bobGot?.text === "what is 17 + 25?");
  expect("received id === sent id (correlation handle)", bobGot?.id === sentId);
  await B.call("auto_reply", { to: a.active.publicKey, body: "42", in_reply_to: bobGot?.id });

  // alice polls for the reply correlated by the id she sent.
  const aliceGot = await pollReply(A, { in_reply_to: sentId });
  expect("alice got the reply via check_reply(in_reply_to)", !!aliceGot);
  expect("reply text is clean (control header stripped)", aliceGot?.text === "42");
  expect("reply carries inReplyTo === sentId", aliceGot?.inReplyTo === sentId);

  const passed = checks.filter(Boolean).length;
  console.log(`\n${passed === checks.length ? "ALL " + checks.length + " CHECKS PASSED ✅" : (checks.length - passed) + " FAILED ❌"}`);
  A.child.kill(); B.child.kill();
  process.exit(passed === checks.length ? 0 : 1);
} catch (e) {
  console.error("ERROR:", e?.message ?? e);
  A.child.kill(); B.child.kill();
  process.exit(2);
}
