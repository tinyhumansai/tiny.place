// Cursor hook handler — the bidirectional bridge.
//
//   FORWARD (Cursor → OpenHuman):
//     beforeSubmitPrompt  → send the user turn   as a cursor SessionEnvelopeV1 DM
//     afterAgentResponse  → send the assistant turn ditto
//   REVERSE (OpenHuman → Cursor GUI):
//     stop                → drain the bridge inbox; any DM from OpenHuman is
//                           returned as {"followup_message": ...}, which Cursor
//                           auto-submits into the LIVE chat (the agent then
//                           answers it, and afterAgentResponse mirrors that answer
//                           back to OpenHuman — a full loop).
//
// Cursor pipes the hook payload as JSON on stdin and reads our JSON from stdout.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import {
  build,
  envelope,
  approvalEnvelope,
  log,
  OPENHUMAN,
  consumePush,
  withLock,
  sendWithRetry,
  extractText,
  sleep,
  AWAITING,
} from "./common.mjs";

// How long the approval hook waits for an OpenHuman decision before falling back
// to Cursor's own GUI prompt. MUST be < the hook's timeout in ~/.cursor/hooks.json
// (300s there → 270s here leaves a buffer so we return before Cursor kills us).
const APPROVAL_WAIT_MS = Number(process.env.BRIDGE_APPROVAL_WAIT_MS) || 270_000;

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function emit(obj) {
  // Cursor consumes hook decisions as a single JSON object on stdout.
  if (obj) process.stdout.write(JSON.stringify(obj));
}

// Human-readable description of what Cursor wants to run.
function describeCall(payload, ev) {
  if (ev === "beforeShellExecution") {
    return payload.command || payload.commandLine || "(shell command)";
  }
  const tool = payload.tool_name || payload.name || "tool";
  const server = payload.server_name || payload.server || "";
  return `MCP tool: ${server ? `${server} / ` : ""}${tool}`;
}

function parseDecision(text) {
  const s = String(text).trim().toLowerCase();
  if (/^(allow|run|yes|y|approve|ok|go|1)\b/.test(s)) return "allow";
  if (/^(deny|skip|no|n|reject|stop|cancel|0)\b/.test(s)) return "deny";
  return null;
}

// Route a Cursor tool-execution gate to OpenHuman: post the request, then block
// (draining the inbox) until the user replies allow/deny there — so approvals
// happen in OpenHuman without switching to Cursor. Returns "allow" | "deny" |
// "ask" (fallback to Cursor's own prompt on timeout/error). While waiting we hold
// the AWAITING flag so the reverse daemon doesn't steal the decision DM.
async function routeApproval(payload, ev, convId, cwd) {
  const label = describeCall(payload, ev);
  const toolName = ev === "beforeShellExecution" ? "shell" : "mcp";
  const requestId = `appr-${Date.now()}`;
  const { signer, client, agent, store } = await build();
  writeFileSync(AWAITING, String(Date.now()));
  try {
    // V2 approval_request event → OpenHuman renders an Allow/Deny card; the user's
    // button reply comes back as a plain "allow"/"deny" DM we parse below.
    await withLock(() =>
      sendWithRetry(
        { client, signer, agent, store },
        OPENHUMAN,
        approvalEnvelope({ toolName, display: label, convId, cwd, requestId }),
      ),
    );
    log(`APPROVAL request -> OH (${requestId}): ${String(label).slice(0, 80)}`);
    const deadline = Date.now() + APPROVAL_WAIT_MS;
    while (Date.now() < deadline) {
      const msgs = await withLock(() =>
        agent.readMessages(client, signer, { limit: 10 }),
      );
      for (const m of msgs) {
        if (m.from !== OPENHUMAN) continue;
        const d = parseDecision(extractText(m.text));
        if (d) {
          log(`APPROVAL decision=${d} for ${String(label).slice(0, 50)}`);
          return d;
        }
      }
      await sleep(2000);
    }
    log(
      `APPROVAL timed out -> ask (Cursor GUI fallback): ${String(label).slice(0, 50)}`,
    );
    return "ask";
  } catch (e) {
    log(`APPROVAL error -> ask: ${e.message}`);
    return "ask";
  } finally {
    try {
      rmSync(AWAITING);
    } catch {}
  }
}

async function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin() || "{}");
  } catch (e) {
    log(`bad payload: ${e.message}`);
    return;
  }
  const ev = payload.hook_event_name ?? payload.hookEventName ?? "";
  const convId =
    payload.conversation_id || payload.conversationId || "cursor-session";
  const cwd =
    (payload.workspace_roots && payload.workspace_roots[0]) ||
    payload.cwd ||
    process.env.CURSOR_PROJECT_DIR ||
    "";

  // File reads are low-risk and high-frequency — auto-allow (routing them to
  // OpenHuman would be spam).
  if (ev === "beforeReadFile") {
    emit({ permission: "allow" });
    log(`auto-allow ${ev}`);
    return;
  }

  // Shell + MCP execution: route the approval to OpenHuman and wait for a decision
  // there, so you never switch to Cursor to click Run. Falls back to Cursor's own
  // prompt ("ask") if OpenHuman doesn't answer in time.
  if (ev === "beforeShellExecution" || ev === "beforeMCPExecution") {
    emit({ permission: await routeApproval(payload, ev, convId, cwd) });
    return;
  }

  const { signer, client, agent, store } = await build();

  if (ev === "beforeSubmitPrompt" || ev === "afterAgentResponse") {
    const role = ev === "beforeSubmitPrompt" ? "user" : "assistant";
    const text =
      (ev === "beforeSubmitPrompt" ? payload.prompt : payload.text) ?? "";
    if (!String(text).trim()) {
      log(`skip ${ev} (empty)`);
      return;
    }
    // Don't echo a daemon-pushed OpenHuman message back to OpenHuman (it already
    // has it). The daemon recorded this exact text just before pasting it.
    if (ev === "beforeSubmitPrompt" && consumePush(text)) {
      log(`skip echo of pushed message (conv=${convId})`);
      return;
    }
    try {
      await withLock(() =>
        sendWithRetry(
          { client, signer, agent, store },
          OPENHUMAN,
          envelope({ role, text, convId, cwd }),
        ),
      );
      log(`FWD ${role} (${String(text).length} chars) conv=${convId} -> OH`);
    } catch (e) {
      log(`FWD ${role} FAILED: ${e.message}`);
    }
    return;
  }

  if (ev === "stop" || ev === "subagentStop") {
    // Reverse delivery is now owned by the background auto-push daemon (daemon.mjs),
    // which polls the inbox and pastes OpenHuman messages into Cursor's GUI. The stop
    // hook must NOT also drain the inbox — two readers race on the same session store
    // and would double-ack/clobber. So this is a no-op.
    log(`stop: reverse handled by daemon (no-op)`);
    return;
  }

  log(`ignore event=${ev}`);
}

main()
  .catch((e) => log(`fatal: ${e.stack || e.message}`))
  .finally(() => process.exit(0));
