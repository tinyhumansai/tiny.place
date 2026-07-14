// Cross-PLUGIN E2E: claude-plugin server (sender) → codex-plugin server (receiver).
// Fresh identities, fresh homes, single `use` each — proves the two plugins
// interoperate over Signal-E2E without any polluted-store confounder.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";

import { fileURLToPath } from "node:url"; import { dirname } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url));
const CLAUDE_SERVER = process.env.CLAUDE_PLUGIN_SERVER ?? join(HERE, "..", "plugin-claude", "mcp", "server.mjs");
const CODEX_SERVER = join(HERE, "mcp", "server.mjs");

function agent(server, homePrefix, homeEnvVar) {
  const child = spawn("node", [server], { stdio: ["pipe", "pipe", "inherit"], env: {
    ...process.env, [homeEnvVar]: mkdtempSync(join(tmpdir(), homePrefix)),
    TINYPLACE_SESSION_DAEMON: "off", TINYPLACE_AUTORESPOND: "off",
    TINYPLACE_API_URL: "https://staging-api.tiny.place" } });
  const pending = new Map(); let buf = "";
  child.stdout.on("data", (c) => { buf += c; let nl;
    while ((nl = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!l) continue; let m; try { m = JSON.parse(l); } catch { continue; }
      if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
  let idc = 0;
  const rpc = (me, pa) => new Promise((res, rej) => { const id = ++idc; pending.set(id, res);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: me, params: pa }) + "\n");
    setTimeout(() => rej(new Error("timeout " + me)), 30000); });
  const notify = (m, p) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: m, params: p }) + "\n");
  const tool = async (n, a) => { const r = await rpc("tools/call", { name: n, arguments: a ?? {} });
    return JSON.parse(r.result?.content?.[0]?.text ?? "{}"); };
  return { child, rpc, notify, tool };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false; const check = (n, c, x) => { console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); if (!c) failed = true; };

const A = agent(CLAUDE_SERVER, "xp-claude-", "TINYPLACE_CLAUDE_HOME"); // sender
const B = agent(CODEX_SERVER, "xp-codex-", "TINYPLACE_CODEX_HOME");   // receiver
try {
  for (const [ag, w] of [[A, "A"], [B, "B"]]) {
    await ag.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: w, version: "0" } });
    ag.notify("notifications/initialized", {});
  }
  await A.tool("wallet_create", { name: "clsend" });
  await B.tool("wallet_create", { name: "cxrecv" });
  const ua = await A.tool("use", { name: "clsend" });
  const ub = await B.tool("use", { name: "cxrecv" });
  const addrA = ua.active?.address, addrB = ub.active?.address;
  check("claude sender up", !!addrA, `${addrA} (${ua.mode})`);
  check("codex receiver up", !!addrB, `${addrB} (${ub.mode})`);
  await A.tool("contact_add", { to: addrB }); await sleep(1500);
  const acc = await B.tool("contact_accept", { from: addrA });
  check("codex accepted claude contact", !acc.error); await sleep(1500);
  const marker = `xplugin-${Date.now().toString(36)}`;
  const sent = await A.tool("send", { to: addrB, body: marker });
  check("claude send ok", !!(sent.id ?? sent.sent?.id));
  let got = null;
  for (let i = 0; i < 15 && !got; i++) { await sleep(2000);
    const inbox = await B.tool("inbox", {});
    const msgs = inbox.messages ?? inbox.inbox ?? (Array.isArray(inbox) ? inbox : []);
    got = msgs.find((m) => (m.text ?? m.body ?? "").includes(marker));
    if (!got) process.stdout.write(`  …poll ${i + 1}/15 (buffered=${msgs.length}, undecryptable=${inbox.undecryptable ?? "?"})\n`);
  }
  check("codex DECRYPTED the claude DM", !!got, got ? `"${got.text}"` : "still undecryptable/empty");
  check("plaintext exact", got?.text === marker);
} catch (e) { check(`no error (${e.message})`, false); }
finally { A.child.kill(); B.child.kill(); console.log(failed ? "\nXPLUGIN E2E FAILED ❌" : "\nXPLUGIN E2E PASSED ✅"); process.exit(failed ? 1 : 0); }
