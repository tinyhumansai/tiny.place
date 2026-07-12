// Pure JSONL-line -> typed HarnessEvent mapper for the v2 session stream.
//
// This module is deliberately self-contained: it depends only on the v2 types
// and carries its own small JSON accessors. That keeps it free of any collision
// with the transport/tailer code in `harness-wrapper.ts` (which owns envelope
// framing: id/seq/bucket/scope). The tailer calls `harnessEventsFromLine` and
// wraps each result in a `SessionEnvelopeV2`.
//
// Verified against real interactive sessions on both providers:
//   Claude  ~/.claude/projects/*/*.jsonl   — record types user|assistant|system,
//           message.content[] blocks: text | thinking | tool_use | tool_result.
//   Codex   ~/.codex/sessions/**/rollout-*.jsonl — record types event_msg |
//           response_item, payload types: user_message | agent_message |
//           reasoning | function_call | function_call_output | mcp_tool_call_* |
//           tool_search_call | tool_search_output | task_started | task_complete.

import type {
  HarnessEvent,
  HarnessProvider,
  HarnessToolKind,
} from "../types/harness.js";

/** One typed event parsed from a single transcript line, pre-envelope. */
export interface HarnessSemanticEvent {
  line: number;
  timestamp: Date;
  /** origin record type, e.g. "assistant" / "response_item:function_call". */
  recordType: string;
  event: HarnessEvent;
}

/** Truncate cap for tool_result output text (bytes are reported separately). */
const OUTPUT_CAP = 4096;
/** Truncate cap for raw tool_input carried in tool_call envelopes. */
const INPUT_CAP = OUTPUT_CAP;
const ELISION = "\n…[truncated]";

/** Maps one raw transcript line from a given provider into typed events. */
export type HarnessLineMapper = (
  raw: string,
  line: number,
) => Array<HarnessSemanticEvent>;

// Provider registry. Typed as Record<HarnessProvider, …> so adding a new
// provider to the HarnessProvider union (e.g. "gemini") is a compile error
// until its mapper is registered here — no silent fall-through to a wrong
// branch. The envelope's `harness.provider` field is what lets OpenHuman tell
// claude / codex / (future) gemini packets apart at the receiver.
const LINE_MAPPERS: Record<HarnessProvider, HarnessLineMapper> = {
  claude: claudeEventsFromLine,
  codex: codexEventsFromLine,
  opencode: opencodeEventsFromLine,
};

export function harnessEventsFromLine(
  provider: HarnessProvider,
  raw: string,
  line: number,
): Array<HarnessSemanticEvent> {
  const mapper = LINE_MAPPERS[provider] as HarnessLineMapper | undefined;
  return mapper ? mapper(raw, line) : [];
}

// ── Claude ───────────────────────────────────────────────────────────────────

export function claudeEventsFromLine(
  raw: string,
  line: number,
): Array<HarnessSemanticEvent> {
  const record = parseJsonObject(raw);
  if (!record) {
    return [];
  }
  const timestamp = parseTimestamp(record.timestamp);
  const message = asObject(record.message);
  if (!message) {
    return [];
  }
  const sourceRole = asString(message.role);
  const blocks = asArray(message.content);

  // A Claude `user` record carries the human prompt AND tool_result blocks.
  if (record.type === "user" && sourceRole === "user") {
    if (typeof message.content === "string") {
      return message.content
        ? [userPromptEvent(line, timestamp, message.content)]
        : [];
    }
    return blocks.flatMap((block) =>
      claudeUserBlock(block, line, timestamp),
    );
  }

  // An `assistant` record carries text / thinking / tool_use blocks.
  if (record.type === "assistant" && sourceRole === "assistant") {
    return blocks.flatMap((block) =>
      claudeAssistantBlock(block, line, timestamp),
    );
  }

  return [];
}

function claudeUserBlock(
  block: unknown,
  line: number,
  timestamp: Date,
): Array<HarnessSemanticEvent> {
  const object = asObject(block);
  if (!object) {
    return [];
  }
  if (object.type === "text") {
    const text = asString(object.text) ?? "";
    return text ? [userPromptEvent(line, timestamp, text)] : [];
  }
  if (object.type === "tool_result") {
    const callId = asString(object.tool_use_id) ?? "";
    const isError = object.is_error === true;
    const output = flattenClaudeToolResult(object.content);
    return [
      {
        line,
        timestamp,
        recordType: "user:tool_result",
        event: {
          kind: "tool_result",
          role: "agent",
          payload: {
            call_id: callId,
            ok: !isError,
            is_error: isError,
            output: truncate(output),
            output_bytes: byteLength(output),
          },
        },
      },
    ];
  }
  return [];
}

function claudeAssistantBlock(
  block: unknown,
  line: number,
  timestamp: Date,
): Array<HarnessSemanticEvent> {
  const object = asObject(block);
  if (!object) {
    return [];
  }
  if (object.type === "text") {
    const text = asString(object.text) ?? "";
    return text
      ? [
          {
            line,
            timestamp,
            recordType: "assistant:text",
            event: { kind: "agent_message", role: "agent", payload: { text } },
          },
        ]
      : [];
  }
  if (object.type === "thinking") {
    const text = asString(object.thinking) ?? asString(object.text) ?? "";
    return text
      ? [
          {
            line,
            timestamp,
            recordType: "assistant:thinking",
            event: { kind: "agent_thinking", role: "agent", payload: { text } },
          },
        ]
      : [];
  }
  if (object.type === "tool_use") {
    const toolName = asString(object.name) ?? "unknown";
    const input = object.input;
    return [
      {
        line,
        timestamp,
        recordType: "assistant:tool_use",
        event: {
          kind: "tool_call",
          role: "agent",
          payload: {
            call_id: asString(object.id) ?? "",
            tool_name: toolName,
            tool_kind: normalizeToolKind(toolName),
            display: toolDisplay(toolName, input),
            input: boundToolInput(input),
          },
        },
      },
    ];
  }
  return [];
}

function flattenClaudeToolResult(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .flatMap((item) => {
      const object = asObject(item);
      if (!object || object.type !== "text") {
        return [];
      }
      const text = asString(object.text);
      return text ? [text] : [];
    })
    .join("\n");
}

// ── Codex ──────────────────────────────────────────────────────────────────

export function codexEventsFromLine(
  raw: string,
  line: number,
): Array<HarnessSemanticEvent> {
  const record = parseJsonObject(raw);
  if (!record) {
    return [];
  }
  const timestamp = parseTimestamp(record.timestamp);
  const payload = asObject(record.payload);
  if (!payload) {
    return [];
  }
  const type = asString(payload.type);

  if (record.type === "event_msg" && type === "user_message") {
    const text = asString(payload.message) ?? "";
    return text ? [userPromptEvent(line, timestamp, text)] : [];
  }

  if (
    (record.type === "event_msg" && type === "agent_message") ||
    (record.type === "response_item" &&
      type === "message" &&
      payload.role === "assistant")
  ) {
    const text =
      asString(payload.message) ??
      textFromContent(payload.content, new Set(["output_text", "text"]));
    return text
      ? [
          {
            line,
            timestamp,
            recordType: `${asString(record.type) ?? "record"}:agent_message`,
            event: { kind: "agent_message", role: "agent", payload: { text } },
          },
        ]
      : [];
  }

  if (type === "reasoning") {
    const text =
      textFromContent(payload.summary, new Set(["summary_text", "text"])) ||
      textFromContent(payload.content, new Set(["reasoning_text", "text"]));
    return text
      ? [
          {
            line,
            timestamp,
            recordType: "response_item:reasoning",
            event: { kind: "agent_thinking", role: "agent", payload: { text } },
          },
        ]
      : [];
  }

  if (type === "function_call" || type === "tool_search_call") {
    const toolName = asString(payload.name) ?? asString(payload.query) ?? "tool";
    const input = parseMaybeJson(payload.arguments) ?? payload.query ?? payload.input;
    return [
      {
        line,
        timestamp,
        recordType: `response_item:${type}`,
        event: {
          kind: "tool_call",
          role: "agent",
          payload: {
            call_id: asString(payload.call_id) ?? asString(payload.id) ?? "",
            tool_name: toolName,
            tool_kind: normalizeToolKind(toolName),
            display: toolDisplay(toolName, input),
            input: boundToolInput(input),
          },
        },
      },
    ];
  }

  if (
    type === "function_call_output" ||
    type === "tool_search_output" ||
    type === "mcp_tool_call_end"
  ) {
    const output = codexOutputText(payload.output ?? payload.result);
    const isError = codexIsError(payload);
    return [
      {
        line,
        timestamp,
        recordType: `response_item:${type}`,
        event: {
          kind: "tool_result",
          role: "agent",
          payload: {
            call_id: asString(payload.call_id) ?? asString(payload.id) ?? "",
            ok: !isError,
            is_error: isError,
            output: truncate(output),
            output_bytes: byteLength(output),
          },
        },
      },
    ];
  }

  if (type === "mcp_tool_call_begin") {
    const toolName = asString(payload.tool) ?? asString(payload.name) ?? "mcp";
    const input = parseMaybeJson(payload.arguments);
    return [
      {
        line,
        timestamp,
        recordType: "response_item:mcp_tool_call_begin",
        event: {
          kind: "tool_call",
          role: "agent",
          payload: {
            call_id: asString(payload.call_id) ?? asString(payload.id) ?? "",
            tool_name: toolName,
            tool_kind: "mcp",
            display: toolDisplay(toolName, input),
            input: boundToolInput(input),
          },
        },
      },
    ];
  }

  if (type === "task_started" || type === "task_complete") {
    const running = type === "task_started";
    return [
      {
        line,
        timestamp,
        recordType: `event_msg:${type}`,
        event: {
          kind: "status",
          role: "agent",
          payload: {
            state: running ? "running" : "idle",
            detail: running ? "working" : "idle",
          },
        },
      },
    ];
  }

  return [];
}

function codexOutputText(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }
  const object = asObject(output);
  if (object) {
    const content = object.content ?? object.output ?? object.text;
    if (typeof content === "string") {
      return content;
    }
    return textFromContent(content, new Set(["output_text", "text"]));
  }
  return textFromContent(output, new Set(["output_text", "text"]));
}

function codexIsError(payload: Record<string, unknown>): boolean {
  if (payload.success === false || payload.is_error === true) {
    return true;
  }
  const output = asObject(payload.output);
  if (output && (output.success === false || output.is_error === true)) {
    return true;
  }
  return false;
}

// ── OpenCode ─────────────────────────────────────────────────────────────────
//
// `opencode run --format json` streams one JSON object per line, each a snapshot
// of a "part": assistant text, a tool part (state.status pending→completed with
// input then output), a reasoning part, a step_finish with token usage, or a
// top-level `error`. Adapted from medulla's battle-tested `tui/opencodeParser.ts`
// into the shared semantic-event model. opencode events carry no timestamp, so
// receive time is stamped (see parseTimestamp).

interface OpenCodePart {
  type?: string;
  text?: string;
  tool?: string;
  callID?: string;
  state?: {
    status?: string;
    input?: unknown;
    output?: unknown;
  };
}

/** Terminal opencode tool states — the snapshot carries the tool's output. */
const OPENCODE_TERMINAL_STATES = new Set(["completed", "error", "done"]);

/** Maps one `opencode run --format json` stream line into typed events. */
export function opencodeEventsFromLine(
  raw: string,
  line: number,
): Array<HarnessSemanticEvent> {
  const record = parseJsonObject(raw);
  if (!record) {
    return [];
  }
  const timestamp = parseTimestamp(record.timestamp);
  const type = asString(record.type);

  if (type === "error") {
    const message =
      describeOpenCodeError(record.error) ??
      safeStringify(record.error ?? record);
    return [
      {
        line,
        timestamp,
        recordType: "opencode:error",
        event: {
          kind: "error",
          role: "agent",
          payload: { message: truncate(message), fatal: false },
        },
      },
    ];
  }

  const part = asObject(record.part) as OpenCodePart | undefined;
  if (!part) {
    return [];
  }

  if (type === "text" && typeof part.text === "string" && part.text.trim()) {
    return [
      {
        line,
        timestamp,
        recordType: "opencode:text",
        event: {
          kind: "agent_message",
          role: "agent",
          payload: { text: part.text.trim() },
        },
      },
    ];
  }

  if (type === "reasoning" && typeof part.text === "string" && part.text.trim()) {
    return [
      {
        line,
        timestamp,
        recordType: "opencode:reasoning",
        event: {
          kind: "agent_thinking",
          role: "agent",
          payload: { text: part.text.trim() },
        },
      },
    ];
  }

  if (typeof part.tool === "string" && part.tool) {
    const toolName = part.tool;
    const callId = asString(part.callID) ?? "";
    const status = (part.state?.status ?? "").toLowerCase();
    const output = part.state?.output;
    const terminal =
      OPENCODE_TERMINAL_STATES.has(status) ||
      (output !== undefined && output !== null && output !== "");
    if (terminal) {
      const outputText = openCodeOutputText(output);
      const isError = status === "error";
      return [
        {
          line,
          timestamp,
          recordType: "opencode:tool_result",
          event: {
            kind: "tool_result",
            role: "agent",
            payload: {
              call_id: callId,
              ok: !isError,
              is_error: isError,
              output: truncate(outputText),
              output_bytes: byteLength(outputText),
            },
          },
        },
      ];
    }
    return [
      {
        line,
        timestamp,
        recordType: "opencode:tool_call",
        event: {
          kind: "tool_call",
          role: "agent",
          payload: {
            call_id: callId,
            tool_name: toolName,
            tool_kind: normalizeToolKind(toolName),
            display: toolDisplay(toolName, part.state?.input),
            input: boundToolInput(part.state?.input),
          },
        },
      },
    ];
  }

  return [];
}

/** Pull a human message out of an opencode `error` payload. */
function describeOpenCodeError(error: unknown): string | undefined {
  const object = asObject(error);
  if (!object) {
    return undefined;
  }
  const data = asObject(object.data);
  const message = [data?.message, object.message].find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  if (!message) {
    return undefined;
  }
  const name =
    typeof object.name === "string" && object.name ? `${object.name}: ` : "";
  const ref = data && typeof data.ref === "string" && data.ref ? ` (${data.ref})` : "";
  return `${name}${message}${ref}`;
}

function openCodeOutputText(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }
  return safeStringify(output);
}

// ── shared helpers ───────────────────────────────────────────────────────────

function userPromptEvent(
  line: number,
  timestamp: Date,
  text: string,
): HarnessSemanticEvent {
  return {
    line,
    timestamp,
    recordType: "user:prompt",
    event: {
      kind: "user_prompt",
      role: "owner",
      payload: { text, source: "human" },
    },
  };
}

export function normalizeToolKind(name: string): HarnessToolKind {
  const lower = name.toLowerCase();
  if (lower.startsWith("mcp__") || lower.includes("mcp")) {
    return "mcp";
  }
  if (/(bash|shell|exec|command|terminal|run)/.test(lower)) {
    return "shell";
  }
  if (/(multiedit|edit|apply_patch|patch)/.test(lower)) {
    return "edit";
  }
  if (/(write|create_file)/.test(lower)) {
    return "file_write";
  }
  if (/(read|cat|open_file|view)/.test(lower)) {
    return "file_read";
  }
  if (/(grep|glob|search|find|ripgrep)/.test(lower)) {
    return "search";
  }
  if (/(web|fetch|http|browse|url)/.test(lower)) {
    return "web";
  }
  if (/(task|agent|subagent|spawn)/.test(lower)) {
    return "task";
  }
  return "other";
}

/** Best-effort one-line summary of what a tool call is doing. */
export function toolDisplay(name: string, input: unknown): string {
  const object = asObject(input);
  if (object) {
    const preferred = [
      "command",
      "cmd",
      "file_path",
      "path",
      "pattern",
      "query",
      "url",
      "prompt",
      "description",
    ];
    for (const key of preferred) {
      const value = asString(object[key]);
      if (value) {
        return firstLine(value);
      }
    }
  }
  if (typeof input === "string" && input) {
    return firstLine(input);
  }
  return name;
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
  // Slice by BYTES, not characters: `String.slice` is code-unit indexed, so a
  // multi-byte payload (emoji / CJK / non-ASCII file contents) would blow past
  // the byte cap this function exists to enforce for envelope transport.
  // `Buffer.toString("utf8")` drops a trailing partial code point safely.
  return `${buffer.subarray(0, OUTPUT_CAP).toString("utf8")}${ELISION}`;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/**
 * Bound the raw tool_input before it goes on the wire. Write/Edit/MCP inputs can
 * carry full file contents or very large request payloads, and the
 * ToolCallPayload contract promises input is bounded before publish. Small
 * inputs keep their structure; oversized ones collapse to a byte-capped
 * serialized string so one large edit can't exceed relay/message limits.
 */
function boundToolInput(input: unknown): unknown {
  const serialized = safeStringify(input);
  const buffer = Buffer.from(serialized, "utf8");
  if (buffer.length <= INPUT_CAP) {
    return input;
  }
  return `${buffer.subarray(0, INPUT_CAP).toString("utf8")}${ELISION}`;
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

function textFromContent(content: unknown, allowedTypes: Set<string>): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .flatMap((item) => {
      const object = asObject(item);
      if (!object || !allowedTypes.has(String(object.type))) {
        return [];
      }
      const text = asString(object.text);
      return text ? [text] : [];
    })
    .join("\n");
}

/**
 * Codex serializes `function_call` / MCP `arguments` as a JSON string. Parse it
 * back to structured data so `toolDisplay` can extract fields (command,
 * file_path, …) and the published `input` matches Claude's object shape.
 * Non-JSON or unparseable strings are returned untouched.
 */
function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return value;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return asObject(parsed);
  } catch {
    return undefined;
  }
}

function parseTimestamp(value: unknown): Date {
  // Default missing/invalid timestamps to receive time, not the Unix epoch.
  // reduceStatus consumes this semantic timestamp; an epoch value never advances
  // the activity clock, so the next tick sees the session as stale and flips a
  // live session to idle right after a tool call or response. new Date() mirrors
  // how the hook mappers stamp receivedAt for events with no source timestamp.
  if (typeof value !== "string") {
    return new Date();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
