import { describe, expect, it } from "vitest";
import {
  claudeHookEventToSemantic,
  claudeHookEventsFromStdin,
  claudeHookStringToSemantic,
} from "../src/cli/harness-hooks.js";
import { Readable } from "node:stream";
import type { HarnessSemanticEvent } from "../src/cli/harness-events.js";

// Fixtures mirror the real hook payloads Claude Code pipes to a hook command's
// stdin, verified against Claude Code 2.1.202. Every payload carries the common
// scope fields (session_id / transcript_path / cwd / hook_event_name) plus its
// per-event fields.

const AT = new Date("2026-07-07T12:00:00.000Z");

const common = {
  session_id: "sess-abc123",
  transcript_path: "/Users/dev/.claude/projects/proj/sess-abc123.jsonl",
  cwd: "/Users/dev/work/project",
  permission_mode: "default",
};

const kinds = (events: Array<HarnessSemanticEvent>): Array<string> =>
  events.map((event) => event.event.kind);

describe("claudeHookEventToSemantic", () => {
  it("maps PreToolUse to a typed tool_call with kind + display + call_id", () => {
    const events = claudeHookEventToSemantic(
      {
        ...common,
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm test", description: "run tests" },
        tool_use_id: "toolu_01ABC",
      },
      AT,
    );
    expect(events).toHaveLength(1);
    expect(events[0].recordType).toBe("hook:PreToolUse");
    expect(events[0].timestamp).toBe(AT);
    expect(events[0].event).toMatchObject({
      kind: "tool_call",
      role: "agent",
      payload: {
        call_id: "toolu_01ABC",
        tool_name: "Bash",
        tool_kind: "shell",
        display: "npm test",
        input: { command: "npm test", description: "run tests" },
      },
    });
  });

  it("maps an MCP PreToolUse to tool_kind mcp", () => {
    const events = claudeHookEventToSemantic(
      {
        ...common,
        hook_event_name: "PreToolUse",
        tool_name: "mcp__tinyplace__send",
        tool_input: { to: "@peer", text: "hi" },
        tool_use_id: "toolu_mcp1",
      },
      AT,
    );
    expect(events[0].event).toMatchObject({
      kind: "tool_call",
      payload: { tool_kind: "mcp", tool_name: "mcp__tinyplace__send" },
    });
  });

  it("maps PostToolUse (string response) to a successful tool_result", () => {
    const events = claudeHookEventToSemantic(
      {
        ...common,
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "echo hi" },
        tool_response: "hi\n",
        tool_use_id: "toolu_01ABC",
        duration_ms: 42,
      },
      AT,
    );
    expect(events).toHaveLength(1);
    expect(events[0].recordType).toBe("hook:PostToolUse");
    expect(events[0].event).toMatchObject({
      kind: "tool_result",
      role: "agent",
      payload: {
        call_id: "toolu_01ABC",
        ok: true,
        is_error: false,
        output: "hi\n",
        output_bytes: 3,
      },
    });
  });

  it("correlates a PreToolUse tool_call with its PostToolUse tool_result via tool_use_id", () => {
    const pre = claudeHookEventToSemantic(
      {
        ...common,
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file_path: "/tmp/a.txt" },
        tool_use_id: "toolu_shared99",
      },
      AT,
    );
    const post = claudeHookEventToSemantic(
      {
        ...common,
        hook_event_name: "PostToolUse",
        tool_name: "Read",
        tool_input: { file_path: "/tmp/a.txt" },
        tool_response: { content: [{ type: "text", text: "file body" }] },
        tool_use_id: "toolu_shared99",
      },
      AT,
    );
    const call = pre[0].event;
    const result = post[0].event;
    if (call.kind !== "tool_call" || result.kind !== "tool_result") {
      throw new Error("unexpected event kinds");
    }
    expect(call.payload.call_id).toBe("toolu_shared99");
    expect(result.payload.call_id).toBe(call.payload.call_id);
    expect(result.payload.output).toBe("file body");
  });

  it("flags a PostToolUse error response via tool_result is_error", () => {
    const events = claudeHookEventToSemantic(
      {
        ...common,
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "false" },
        tool_response: { stderr: "boom", is_error: true },
        tool_use_id: "toolu_err",
      },
      AT,
    );
    expect(events[0].event).toMatchObject({
      kind: "tool_result",
      payload: { ok: false, is_error: true, output: "boom" },
    });
  });

  it("maps UserPromptSubmit to an owner user_prompt", () => {
    const events = claudeHookEventToSemantic(
      {
        ...common,
        hook_event_name: "UserPromptSubmit",
        prompt: "fix the failing test",
        session_title: "debug",
      },
      AT,
    );
    expect(events[0].recordType).toBe("hook:UserPromptSubmit");
    expect(events[0].event).toMatchObject({
      kind: "user_prompt",
      role: "owner",
      payload: { text: "fix the failing test", source: "human" },
    });
  });

  it("drops an empty UserPromptSubmit", () => {
    const events = claudeHookEventToSemantic(
      { ...common, hook_event_name: "UserPromptSubmit", prompt: "" },
      AT,
    );
    expect(events).toHaveLength(0);
  });

  it("maps Stop to a turn_end lifecycle", () => {
    const events = claudeHookEventToSemantic(
      {
        ...common,
        hook_event_name: "Stop",
        stop_hook_active: true,
        last_assistant_message: "done",
      },
      AT,
    );
    expect(events[0].recordType).toBe("hook:Stop");
    expect(events[0].event).toMatchObject({
      kind: "lifecycle",
      role: "agent",
      payload: { phase: "turn_end" },
    });
  });

  it("maps SubagentStop to a turn_end lifecycle", () => {
    const events = claudeHookEventToSemantic(
      {
        ...common,
        hook_event_name: "SubagentStop",
        stop_hook_active: false,
        agent_id: "agent-1",
        agent_type: "Explore",
      },
      AT,
    );
    expect(events[0].recordType).toBe("hook:SubagentStop");
    expect(events[0].event).toMatchObject({
      kind: "lifecycle",
      payload: { phase: "turn_end" },
    });
  });

  it("maps SessionStart to a session_start lifecycle", () => {
    const events = claudeHookEventToSemantic(
      {
        ...common,
        hook_event_name: "SessionStart",
        source: "startup",
        model: "claude-opus-4",
      },
      AT,
    );
    expect(events[0].recordType).toBe("hook:SessionStart");
    expect(events[0].event).toMatchObject({
      kind: "lifecycle",
      payload: { phase: "session_start" },
    });
  });

  it("maps a compact SessionStart to a compact lifecycle", () => {
    const events = claudeHookEventToSemantic(
      { ...common, hook_event_name: "SessionStart", source: "compact" },
      AT,
    );
    expect(events[0].event).toMatchObject({
      kind: "lifecycle",
      payload: { phase: "compact" },
    });
  });

  it("maps SessionEnd to a session_end lifecycle", () => {
    const events = claudeHookEventToSemantic(
      { ...common, hook_event_name: "SessionEnd", reason: "logout" },
      AT,
    );
    expect(events[0].recordType).toBe("hook:SessionEnd");
    expect(events[0].event).toMatchObject({
      kind: "lifecycle",
      payload: { phase: "session_end" },
    });
  });

  it("maps a permission-prompt Notification to an approval_request", () => {
    const events = claudeHookEventToSemantic(
      {
        ...common,
        hook_event_name: "Notification",
        message: "Claude needs your permission to use Bash",
        notification_type: "permission_prompt",
      },
      AT,
    );
    expect(events[0].recordType).toBe("hook:Notification");
    expect(events[0].event).toMatchObject({
      kind: "approval_request",
      role: "agent",
      payload: {
        display: "Claude needs your permission to use Bash",
        reason: "permission_prompt",
      },
    });
  });

  it("maps a non-permission Notification to a bounded unknown", () => {
    const events = claudeHookEventToSemantic(
      {
        ...common,
        hook_event_name: "Notification",
        message: "Claude is waiting for your input",
        notification_type: "idle_prompt",
      },
      AT,
    );
    expect(events[0].event.kind).toBe("unknown");
  });

  it("maps an unrecognized hook event to a bounded unknown", () => {
    const events = claudeHookEventToSemantic(
      { ...common, hook_event_name: "PreCompact", trigger: "auto" },
      AT,
    );
    expect(events[0].recordType).toBe("hook:PreCompact");
    expect(events[0].event).toMatchObject({
      kind: "unknown",
      role: "agent",
    });
    const event = events[0].event;
    if (event.kind !== "unknown") {
      throw new Error("expected unknown");
    }
    expect(event.payload.raw).toMatchObject({ hook_event_name: "PreCompact" });
  });

  it("maps a non-object payload to a bounded unknown", () => {
    const events = claudeHookEventToSemantic("not json object", AT);
    expect(events).toHaveLength(1);
    expect(events[0].event.kind).toBe("unknown");
    expect(kinds(events)).toEqual(["unknown"]);
  });

  it("bounds an oversized unknown raw payload to a truncated string", () => {
    const big = "x".repeat(20_000);
    const events = claudeHookEventToSemantic(
      { ...common, hook_event_name: "Mystery", blob: big },
      AT,
    );
    const event = events[0].event;
    if (event.kind !== "unknown") {
      throw new Error("expected unknown");
    }
    expect(typeof event.payload.raw).toBe("string");
    expect((event.payload.raw as string).endsWith("…[truncated]")).toBe(true);
  });
});

describe("claudeHookStringToSemantic", () => {
  it("parses a JSON string payload and maps it", () => {
    const raw = JSON.stringify({
      ...common,
      hook_event_name: "UserPromptSubmit",
      prompt: "hello from stdin",
    });
    const events = claudeHookStringToSemantic(raw, AT);
    expect(events[0].event).toMatchObject({
      kind: "user_prompt",
      payload: { text: "hello from stdin" },
    });
  });

  it("maps an unparseable string to a bounded unknown", () => {
    const events = claudeHookStringToSemantic("{ not json", AT);
    expect(events[0].recordType).toBe("hook:unparseable");
    expect(events[0].event.kind).toBe("unknown");
  });
});

describe("claudeHookEventsFromStdin", () => {
  it("reads a hook payload from a stream and maps it", async () => {
    const raw = JSON.stringify({
      ...common,
      hook_event_name: "PreToolUse",
      tool_name: "Grep",
      tool_input: { pattern: "TODO" },
      tool_use_id: "toolu_stdin",
    });
    const stream = Readable.from([Buffer.from(raw, "utf8")]);
    const events = await claudeHookEventsFromStdin(stream, AT);
    expect(events[0].event).toMatchObject({
      kind: "tool_call",
      payload: { tool_kind: "search", call_id: "toolu_stdin" },
    });
  });
});
