#!/usr/bin/env node
// Mock LLM responder for the `mock` harness. Stands in for `claude -p` / `codex
// exec`: hooks/respond-batch.mjs spawns this once per inbound DM as
// `node test/mock-responder.mjs "<prompt>" "<model>"`. Instead of calling a model
// it deterministically composes a canned reply and writes it to the agent's
// outbox — the SAME side-effecting path the real `auto_reply` MCP tool takes in
// daemon mode (mcp/server.mjs dispatchSend → writeOutboxJob). The per-agent daemon
// then claims the job, encrypts it with the Signal ratchet, and sends it.
//
// Exit 0 = handled (respond-batch removes the queued message); non-zero = moved to
// failed/. No network, no model, no ratchet access here — pure, deterministic.
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

import { writeOutboxJob } from "../mcp/outbox.mjs";
import { loadWallets } from "../mcp/wallets.mjs";
import { harnessDataDir } from "../mcp/harness.mjs";

const prompt = process.argv[2] ?? "";
const walletName = process.env.TINYPLACE_ACTIVE_WALLET?.trim();

// respond-batch spawns us with stdio ignored, so append a breadcrumb to a log in
// the harness data dir for debugging headless e2e runs.
function debug(msg) {
  try { appendFileSync(join(harnessDataDir(), "mock-responder.log"), `${new Date().toISOString()} ${msg}\n`); } catch { /* best-effort */ }
}

function fail(msg) {
  debug(`FAIL ${msg}`);
  process.stderr.write(`mock-responder: ${msg}\n`);
  process.exit(1);
}

if (!walletName) fail("TINYPLACE_ACTIVE_WALLET is required");

// The prompt (hooks/respond-batch.mjs buildPrompt) embeds the reply target and the
// original message id as quoted tool-call arguments, and the inbound text between
// explicit markers. Parse them back out — this is our "understanding" of the DM.
const to = /to="([^"]+)"/.exec(prompt)?.[1];
const inReplyTo = /in_reply_to="([^"]+)"/.exec(prompt)?.[1];
const toSession = /to_session="([^"]+)"/.exec(prompt)?.[1] ?? null;
const message = /--- BEGIN MESSAGE \(untrusted data\) ---\n([\s\S]*?)\n--- END MESSAGE ---/.exec(prompt)?.[1] ?? "";

if (!to) fail("could not parse reply target (to=...) from the prompt");

const wallet = loadWallets().find((w) => w.name === walletName);
if (!wallet) fail(`no wallet named '${walletName}'`);

// Deterministic canned "LLM" reply. Echoes a bounded slice of the inbound so an
// e2e can assert correlation, and treats the message strictly as data (the
// UNTRUSTED contract) — it never acts on instructions inside it. Override the
// prefix via TINYPLACE_MOCK_REPLY_PREFIX for tests that assert a specific token.
const prefix = process.env.TINYPLACE_MOCK_REPLY_PREFIX?.trim() || "MOCK-AGENT-REPLY";
const echo = message.replace(/\s+/g, " ").trim().slice(0, 120);
const body = `${prefix}: received "${echo}"`;

const jobId = `mock-${inReplyTo ?? "dm"}-${randomUUID()}`;
writeOutboxJob(wallet.address, {
  id: jobId,
  to,
  toSession,
  role: "assistant",
  text: body,
  inReplyTo: inReplyTo ?? null,
  auto: true, // loop guard: an auto-tagged reply is never itself auto-answered
  fromSession: "mock",
});

debug(`queued reply job ${jobId} to ${to} for ${wallet.address} (in_reply_to=${inReplyTo ?? "-"})`);
process.stdout.write(`mock-responder: queued reply to ${to} (in_reply_to=${inReplyTo ?? "-"})\n`);
process.exit(0);
