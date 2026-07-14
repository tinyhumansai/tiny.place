// Pure Claude Code hook-payload -> typed HarnessEvent mapper for the v2 stream.
//
// Complements `harness-events.ts` (which tails the transcript JSONL). Claude
// Code fires a hook command in real time and pipes a single JSON object to its
// stdin; `PreToolUse` fires BEFORE the tool runs, so this is a lower-latency
// capture path than tailing the transcript file. This module maps one such hook
// payload into the SAME intermediate `HarnessSemanticEvent[]` shape the JSONL
// mapper emits, so hook-sourced events flow through `buildEventEnvelopeV2` +
// `reduceStatus` identically. It reuses `normalizeToolKind` / `toolDisplay` from
// the JSONL mapper and carries its own small JSON accessors to stay decoupled.
//
// Payload shapes verified against Claude Code 2.1.202 (the JSON object each hook
// receives on stdin):
//   common          — session_id, transcript_path, cwd, hook_event_name,
//                     permission_mode (+ optional prompt_id, agent_id,
//                     agent_type). scope-level; not needed for the typed event.
//   PreToolUse      — tool_name, tool_input, tool_use_id
//   PostToolUse     — tool_name, tool_input, tool_response, tool_use_id,
//                     duration_ms
//   UserPromptSubmit— prompt, session_title
//   Stop            — stop_hook_active, last_assistant_message
//   SubagentStop    — stop_hook_active, agent_id, agent_transcript_path,
//                     agent_type, last_assistant_message
//   SessionStart    — source ("startup"|"resume"|"clear"|"compact"), model,
//                     session_title
//   SessionEnd      — reason ("clear"|"logout"|"prompt_input_exit"|…)
//   Notification    — message, title, notification_type ("permission_prompt"|
//                     "idle_prompt"|…)
//
// Correlation: `tool_use_id` is a stable id carried on BOTH PreToolUse and
// PostToolUse for the same tool invocation, so a tool_call and its tool_result
// share `call_id` exactly as the JSONL path already does. No heuristic
// (tool_name+input) matching is required on this version.

import { stdin } from "node:process";
import type { HarnessEvent } from "../types/harness.js";
import type { HarnessSemanticEvent } from "./harness-events.js";
import { normalizeToolKind, toolDisplay } from "./harness-events.js";

/** Truncate cap for tool_result output text (bytes are reported separately). */
const OUTPUT_CAP = 4096;
/** Bounded serialization cap for `unknown` raw payloads. */
const RAW_CAP = 4096;
const ELISION = "\n…[truncated]";

/**
 * Maps one Claude Code hook payload (the JSON object Claude pipes to a hook
 * command's stdin) into typed semantic events. Pure: pass `receivedAt` for
 * deterministic timestamps (hook payloads carry no timestamp of their own).
 *
 * Unrecognized or malformed payloads map to a single bounded `unknown` event so
 * the real-time path never silently drops a hook.
 */
export function claudeHookEventToSemantic(
  payload: unknown,
  receivedAt: Date = new Date(),
): Array<HarnessSemanticEvent> {
  const record = asObject(payload);
  if (!record) {
    return [unknownEvent("hook:unknown", receivedAt, payload)];
  }
  const eventName = asString(record.hook_event_name) ?? "";
  switch (eventName) {
    case "PreToolUse":
      return preToolUse(record, receivedAt);
    case "PostToolUse":
      return postToolUse(record, receivedAt);
    case "UserPromptSubmit":
      return userPromptSubmit(record, receivedAt);
    case "Stop":
      return turnEnd("hook:Stop", receivedAt);
    case "SubagentStop":
      return turnEnd("hook:SubagentStop", receivedAt);
    case "SessionStart":
      return sessionStart(record, receivedAt);
    case "SessionEnd":
      return sessionEnd(receivedAt);
    case "Notification":
      return notification(record, receivedAt);
    default:
      return [
        unknownEvent(`hook:${eventName || "unknown"}`, receivedAt, payload),
      ];
  }
}

/**
 * Parses a raw hook JSON string then maps it. A parse failure yields a single
 * bounded `unknown` event rather than dropping the hook.
 */
export function claudeHookStringToSemantic(
  raw: string,
  receivedAt: Date = new Date(),
): Array<HarnessSemanticEvent> {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return [unknownEvent("hook:unparseable", receivedAt, raw)];
  }
  return claudeHookEventToSemantic(payload, receivedAt);
}

/**
 * Thin stdin entrypoint so the module is usable directly as a hook command:
 * read the whole JSON payload from `stream`, then map it. The core mapper stays
 * pure — this only handles I/O.
 */
export async function claudeHookEventsFromStdin(
  stream: NodeJS.ReadableStream = stdin,
  receivedAt: Date = new Date(),
): Promise<Array<HarnessSemanticEvent>> {
  const raw = await readStream(stream);
  return claudeHookStringToSemantic(raw, receivedAt);
}

// ── per-event mappers ────────────────────────────────────────────────────────

function preToolUse(
  record: Record<string, unknown>,
  receivedAt: Date,
): Array<HarnessSemanticEvent> {
  const toolName = asString(record.tool_name) ?? "unknown";
  const input = record.tool_input;
  return [
    {
      line: 0,
      timestamp: receivedAt,
      recordType: "hook:PreToolUse",
      event: {
        kind: "tool_call",
        role: "agent",
        payload: {
          call_id: asString(record.tool_use_id) ?? "",
          tool_name: toolName,
          tool_kind: normalizeToolKind(toolName),
          display: toolDisplay(toolName, input),
          input: boundRaw(input),
        },
      },
    },
  ];
}

function postToolUse(
  record: Record<string, unknown>,
  receivedAt: Date,
): Array<HarnessSemanticEvent> {
  const response = record.tool_response;
  const output = toolResponseText(response);
  const isError = toolResponseIsError(response);
  return [
    {
      line: 0,
      timestamp: receivedAt,
      recordType: "hook:PostToolUse",
      event: {
        kind: "tool_result",
        role: "agent",
        payload: {
          call_id: asString(record.tool_use_id) ?? "",
          ok: !isError,
          is_error: isError,
          output: truncate(output),
          output_bytes: byteLength(output),
        },
      },
    },
  ];
}

function userPromptSubmit(
  record: Record<string, unknown>,
  receivedAt: Date,
): Array<HarnessSemanticEvent> {
  const text = asString(record.prompt) ?? "";
  if (!text) {
    return [];
  }
  return [
    {
      line: 0,
      timestamp: receivedAt,
      recordType: "hook:UserPromptSubmit",
      event: {
        kind: "user_prompt",
        role: "owner",
        payload: { text, source: "human" },
      },
    },
  ];
}

function sessionStart(
  record: Record<string, unknown>,
  receivedAt: Date,
): Array<HarnessSemanticEvent> {
  // A "compact" start is a context compaction, not a fresh turn — surface it as
  // its own lifecycle phase; every other source opens the session.
  const phase = asString(record.source) === "compact" ? "compact" : "session_start";
  return [
    {
      line: 0,
      timestamp: receivedAt,
      recordType: "hook:SessionStart",
      event: {
        kind: "lifecycle",
        role: "agent",
        payload: { phase },
      },
    },
  ];
}

function sessionEnd(receivedAt: Date): Array<HarnessSemanticEvent> {
  return [
    {
      line: 0,
      timestamp: receivedAt,
      recordType: "hook:SessionEnd",
      event: {
        kind: "lifecycle",
        role: "agent",
        payload: { phase: "session_end" },
      },
    },
  ];
}

function turnEnd(
  recordType: string,
  receivedAt: Date,
): Array<HarnessSemanticEvent> {
  // Stop / SubagentStop fire when the agent finishes responding — a turn end.
  // `reduceStatus` maps this lifecycle phase to `idle`.
  return [
    {
      line: 0,
      timestamp: receivedAt,
      recordType,
      event: {
        kind: "lifecycle",
        role: "agent",
        payload: { phase: "turn_end" },
      },
    },
  ];
}

function notification(
  record: Record<string, unknown>,
  receivedAt: Date,
): Array<HarnessSemanticEvent> {
  const message = asString(record.message) ?? "";
  const notificationType = asString(record.notification_type) ?? "";
  const isPermission =
    notificationType === "permission_prompt" ||
    /permission|approv/i.test(message);
  if (!isPermission) {
    // idle prompts and other notifications carry no approval decision.
    return [unknownEvent("hook:Notification", receivedAt, record)];
  }
  return [
    {
      line: 0,
      timestamp: receivedAt,
      recordType: "hook:Notification",
      event: {
        kind: "approval_request",
        role: "agent",
        payload: {
          // the notification does not name the tool; leave it empty and carry
          // the human-readable prompt in `display`.
          tool_name: "",
          display: firstLine(message) || "permission requested",
          ...(notificationType ? { reason: notificationType } : {}),
        },
      },
    },
  ];
}

// ── tool_response shaping ────────────────────────────────────────────────────

/** Flattens a hook `tool_response` (string | content-blocks | object) to text. */
function toolResponseText(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }
  if (Array.isArray(response)) {
    return flattenContentBlocks(response);
  }
  const object = asObject(response);
  if (!object) {
    return safeStringify(response);
  }
  if (object.content !== undefined) {
    return toolResponseText(object.content);
  }
  const parts = ["stdout", "stderr", "output", "text", "result", "message"]
    .map((key) => asString(object[key]))
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join("\n") : safeStringify(object);
}

function flattenContentBlocks(blocks: Array<unknown>): string {
  return blocks
    .flatMap((block) => {
      if (typeof block === "string") {
        return block ? [block] : [];
      }
      const object = asObject(block);
      if (!object || object.type !== "text") {
        return [];
      }
      const text = asString(object.text);
      return text ? [text] : [];
    })
    .join("\n");
}

/** Best-effort error detection on a hook `tool_response`. */
function toolResponseIsError(response: unknown): boolean {
  const object = asObject(response);
  if (!object) {
    return false;
  }
  return (
    object.is_error === true ||
    object.isError === true ||
    object.success === false ||
    object.interrupted === true ||
    isNonEmpty(object.error)
  );
}

function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string") {
    return value.length > 0;
  }
  return true;
}

// ── shared helpers ───────────────────────────────────────────────────────────

function unknownEvent(
  recordType: string,
  receivedAt: Date,
  raw: unknown,
): HarnessSemanticEvent {
  const event: HarnessEvent = {
    kind: "unknown",
    role: "agent",
    payload: { raw: boundRaw(raw) },
  };
  return { line: 0, timestamp: receivedAt, recordType, event };
}

/** Keeps small raw payloads structured; truncates large ones to a bounded string. */
function boundRaw(value: unknown): unknown {
  const serialized = safeStringify(value);
  const buffer = Buffer.from(serialized, "utf8");
  if (buffer.length <= RAW_CAP) {
    return value;
  }
  // Byte-indexed slice (see truncate): keep the bounded string within RAW_CAP
  // bytes even for multi-byte serialized payloads.
  return `${buffer.subarray(0, RAW_CAP).toString("utf8")}${ELISION}`;
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function firstLine(value: string): string {
  const line = value.split("\n", 1)[0] ?? value;
  return line.length > 200 ? `${line.slice(0, 197)}...` : line;
}

function truncate(value: string): string {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.length <= OUTPUT_CAP) {
    return value;
  }
  // Byte-indexed slice (see harness-events.ts truncate): `String.slice` counts
  // code units, so multi-byte content could still exceed the byte cap.
  // `Buffer.toString("utf8")` trims a trailing partial code point safely.
  return `${buffer.subarray(0, OUTPUT_CAP).toString("utf8")}${ELISION}`;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Array<Buffer> = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
