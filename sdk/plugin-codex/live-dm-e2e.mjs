// LIVE two-agent DM E2E against staging. Drives the plugin's OWN MCP tools over
// raw JSON-RPC (two server instances = two identities) to prove real Signal-E2E
// messaging + the contact handshake end-to-end. No Codex model in the loop —
// this exercises the plugin code path a Codex session would trigger.
//
//   node live-dm-e2e.mjs        (needs network + staging relay)
//
// Flow: A & B publish keys → A requests contact → B accepts → A sends a DM →
// B drains its inbox and must receive the exact plaintext.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const API = process.env.TINYPLACE_API_URL ?? "https://staging-api.tiny.place";

function makeAgent(tag) {
  const child = spawn("node", [join(HERE, "mcp", "server.mjs")], {
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      TINYPLACE_CODEX_HOME: mkdtempSync(join(tmpdir(), `tp-codex-${tag}-`)),
      TINYPLACE_SESSION_DAEMON: "off",
      TINYPLACE_AUTORESPOND: "off",
      TINYPLACE_API_URL: API,
    },
  });
  const pending = new Map();
  let buf = "";
  child.stdout.on("data", (c) => {
    buf += c.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    }
  });
  let idc = 0;
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++idc; pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error(`timeout ${method}`)), 30000);
  });
  const notify = (method, params) =>
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  const tool = async (name, args) => {
    const r = await rpc("tools/call", { name, arguments: args ?? {} });
    const text = r.result?.content?.[0]?.text ?? "{}";
    return JSON.parse(text);
  };
  return { child, rpc, notify, tool };
}

let failed = false;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failed = true;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const A = makeAgent("A");
const B = makeAgent("B");

try {
  for (const [ag, who] of [[A, "A"], [B, "B"]]) {
    await ag.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: who, version: "0" } });
    ag.notify("notifications/initialized", {});
  }

  // 1. create + activate both identities (publishes Signal keys to the relay)
  await A.tool("wallet_create", { name: "alice" });
  await B.tool("wallet_create", { name: "bob" });
  const useA = await A.tool("use", { name: "alice" });
  const useB = await B.tool("use", { name: "bob" });
  const addrA = useA.active?.address;
  const addrB = useB.active?.address;
  check("alice activated + address", !!addrA, addrA);
  check("bob activated + address", !!addrB, addrB);
  check("alice label codex:1", useA.label === "codex:1");
  check("bob label codex:1", useB.label === "codex:1");

  // 2. contact handshake: alice requests, bob accepts
  await A.tool("contact_add", { to: addrB });
  await sleep(1500);
  const acc = await B.tool("contact_accept", { from: addrA });
  check("bob accepted alice's contact request", !acc.error, JSON.stringify(acc).slice(0, 120));
  await sleep(1500);

  // 3. alice sends a DM to bob
  const marker = `hello-bob-${Date.now().toString(36)}`;
  const sent = await A.tool("send", { to: addrB, body: marker });
  const sentId = sent.id ?? sent.sent?.id;
  check("alice send returned an id", !!sentId, JSON.stringify(sent).slice(0, 120));

  // 4. bob drains inbox (poll — relay + decrypt may lag a beat)
  let got = null;
  for (let i = 0; i < 15 && !got; i++) {
    await sleep(2000);
    const inbox = await B.tool("inbox", {});
    const msgs = inbox.messages ?? inbox.inbox ?? (Array.isArray(inbox) ? inbox : []);
    got = msgs.find((m) => (m.text ?? m.body ?? "").includes(marker));
    if (!got) process.stdout.write(`  …poll ${i + 1}/15 (buffered=${msgs.length})\n`);
  }
  check("bob received alice's DM (Signal-E2E decrypted)", !!got, got ? `text="${got.text}" from=${got.from}` : "not received");
  check("received plaintext matches exactly", got?.text === marker);
  // Inbound `from` is the sender's message key (base64), not the base58 cryptoId;
  // both identify alice, and address.mjs.toCryptoId() converts the key form back
  // for replies. Assert only that a sender identity is carried.
  check("received message carries a sender identity", !!got?.from);
} catch (e) {
  check(`no error (${e.message})`, false);
} finally {
  A.child.kill(); B.child.kill();
  console.log(failed ? "\nLIVE DM E2E FAILED ❌" : "\nLIVE DM E2E PASSED ✅");
  process.exit(failed ? 1 : 0);
}
