// Drives the ONE unified MCP server over stdio with real JSON-RPC — once per
// harness (codex, claude) — and asserts the harness-agnostic surface plus the
// per-harness deltas that the adapter threads: the full 20-tool set, the
// push-capability gate (claude advertises a channel, codex does not), and the
// no-active-agent guard. Needs node_modules (MCP SDK). Offline: no tool here
// touches the relay.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "mcp", "server.mjs");

const EXPECTED_TOOLS = [
  "wallet_create", "wallet_list", "use", "whoami", "assign", "unassign",
  "assignments", "sessions", "send", "send_and_wait", "await_reply",
  "check_reply", "auto_reply", "inbox", "contact_add", "contact_accept",
  "contact_requests", "contacts", "autorespond", "reset_session",
];

const checks = [];
const expect = (label, cond, extra) => { checks.push({ label, ok: !!cond }); console.log((cond ? "PASS " : "FAIL ") + label + (extra && !cond ? ` — ${extra}` : "")); };

// Boot the server pinned to one harness, run the JSON-RPC handshake + a few
// tool calls, return the observations. Kills the child before resolving.
function driveServer(harness, dataDirEnv) {
  const dataDir = mkdtempSync(join(tmpdir(), `tp-smoke-${harness}-`));
  const child = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, TINYPLACE_HARNESS: harness, [dataDirEnv]: dataDir },
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
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });

  let nextId = 1;
  const rpc = (method, params) => {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  };
  const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  const text = (r) => r?.result?.content?.[0]?.text ?? JSON.stringify(r?.error ?? r);

  return (async () => {
    const init = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } });
    notify("notifications/initialized", {});
    const tools = await rpc("tools/list", {});
    const created = await rpc("tools/call", { name: "wallet_create", arguments: { name: "smoke-alice" } });
    const who = await rpc("tools/call", { name: "whoami", arguments: {} });
    const sendNoActive = await rpc("tools/call", { name: "send", arguments: { to: "@x", body: "hi" } });
    child.kill();
    return {
      serverInfo: init.result?.serverInfo,
      capabilities: init.result?.capabilities ?? {},
      instructions: init.result?.instructions ?? "",
      toolNames: (tools.result?.tools ?? []).map((t) => t.name),
      walletCreateText: text(created),
      whoamiText: text(who),
      sendNoActiveText: text(sendNoActive),
    };
  })();
}

// ── codex harness (pull-only: NO channel capability) ─────────────────────────
const cx = await driveServer("codex", "TINYPLACE_CODEX_HOME");
expect("codex: server boots (serverInfo.name=tinyplace)", cx.serverInfo?.name === "tinyplace");
expect("codex: all 20 tools present", EXPECTED_TOOLS.every((t) => cx.toolNames.includes(t)), `got ${cx.toolNames.length}: ${cx.toolNames.join(",")}`);
expect("codex: exactly 20 tools (no extras)", cx.toolNames.length === 20, `got ${cx.toolNames.length}`);
expect("codex: NO push channel capability (pull-only)", !cx.capabilities?.experimental?.["claude/channel"]);
expect("codex: instructions say NOT pushed in real time", /NOT pushed in real time/i.test(cx.instructions));
expect("codex: wallet_create works", /smoke-alice/.test(cx.walletCreateText));
expect("codex: send without active agent is guarded", /no active|active agent|use .* first/i.test(cx.sendNoActiveText));

// ── claude harness (push-capable: advertises claude/channel) ─────────────────
const cl = await driveServer("claude", "TINYPLACE_CLAUDE_HOME");
expect("claude: server boots (serverInfo.name=tinyplace)", cl.serverInfo?.name === "tinyplace");
expect("claude: all 20 tools present", EXPECTED_TOOLS.every((t) => cl.toolNames.includes(t)), `got ${cl.toolNames.length}`);
expect("claude: exactly 20 tools (no extras)", cl.toolNames.length === 20, `got ${cl.toolNames.length}`);
expect("claude: advertises claude/channel push capability", !!cl.capabilities?.experimental?.["claude/channel"]);
expect("claude: instructions mention channel push", /channel source="tinyplace"|pushed as/i.test(cl.instructions));
expect("claude: wallet_create works", /smoke-alice/.test(cl.walletCreateText));

// ── the deltas are ONLY inbound-push + instructions; the tool SET is identical ─
expect("same 20-tool set across both harnesses", cx.toolNames.slice().sort().join(",") === cl.toolNames.slice().sort().join(","));
expect("push capability differs by harness (the gate works)", !cx.capabilities?.experimental?.["claude/channel"] && !!cl.capabilities?.experimental?.["claude/channel"]);

const failed = checks.filter((c) => !c.ok);
console.log("\n" + (failed.length === 0 ? `ALL ${checks.length} CHECKS PASSED ✅` : `${failed.length} FAILED ❌`));
process.exit(failed.length === 0 ? 0 : 1);
