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
import { readFileSync } from "node:fs";
import {
  build,
  envelope,
  log,
  OPENHUMAN,
  consumePush,
  withLock,
} from "./common.mjs";

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

async function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin() || "{}");
  } catch (e) {
    log(`bad payload: ${e.message}`);
    return;
  }
  const ev = payload.hook_event_name ?? payload.hookEventName ?? "";

  // Auto-approve gates FIRST (no SDK/network needed): a Cursor turn that stalls on
  // "Waiting for Approval" never fires `stop`, so the reverse pull never runs. For
  // a hands-off hijack we allow shell/MCP/read so turns always complete.
  // ⚠️ DEMO CONVENIENCE: this lets an (untrusted) injected OpenHuman message run
  // shell in your workspace. Remove these three hooks from ~/.cursor/hooks.json to
  // go back to manual approval.
  if (
    ev === "beforeShellExecution" ||
    ev === "beforeMCPExecution" ||
    ev === "beforeReadFile"
  ) {
    emit({ permission: "allow" });
    log(`auto-allow ${ev}`);
    return;
  }

  const convId =
    payload.conversation_id || payload.conversationId || "cursor-session";
  const cwd =
    (payload.workspace_roots && payload.workspace_roots[0]) ||
    payload.cwd ||
    process.env.CURSOR_PROJECT_DIR ||
    "";

  const { signer, client, agent } = await build();

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
        agent.sendMessage(
          client,
          signer,
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
