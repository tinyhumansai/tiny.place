import { describe, expect, it } from "vitest";
import {
  claudeEventsFromLine,
  codexEventsFromLine,
  createHarnessLineMapper,
  createOpenCodeBusMapper,
  harnessEventsFromLine,
  normalizeToolKind,
  opencodeEventsFromBusEvent,
  toolDisplay,
} from "../src/cli/harness-events.js";
import type { HarnessSemanticEvent } from "../src/cli/harness-events.js";
import type { HarnessProvider } from "../src/types/harness.js";

// Fixture lines mirror the real on-disk shapes verified against live sessions:
//   Claude ~/.claude/projects/*/*.jsonl, Codex ~/.codex/sessions/**/rollout-*.jsonl

function claudeLine(record: unknown): string {
  return JSON.stringify(record);
}

const kinds = (events: Array<HarnessSemanticEvent>): Array<string> =>
  events.map((event) => event.event.kind);

describe("claudeEventsFromLine", () => {
  it("maps an assistant text block to agent_message", () => {
    const events = claudeEventsFromLine(
      claudeLine({
        type: "assistant",
        timestamp: "2026-07-07T10:00:00.000Z",
        message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
      }),
      1,
    );
    expect(events).toHaveLength(1);
    expect(events[0].event).toMatchObject({
      kind: "agent_message",
      role: "agent",
      payload: { text: "hello" },
    });
  });

  it("maps a thinking block to agent_thinking", () => {
    const events = claudeEventsFromLine(
      claudeLine({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "thinking", thinking: "let me reason" }],
        },
      }),
      2,
    );
    expect(events[0].event).toMatchObject({
      kind: "agent_thinking",
      payload: { text: "let me reason" },
    });
  });

  it("maps a tool_use block to a typed tool_call with kind + display", () => {
    const events = claudeEventsFromLine(
      claudeLine({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_abc",
              name: "Bash",
              input: { command: "npm test", description: "run tests" },
            },
          ],
        },
      }),
      3,
    );
    expect(events).toHaveLength(1);
    expect(events[0].event).toMatchObject({
      kind: "tool_call",
      role: "agent",
      payload: {
        call_id: "toolu_abc",
        tool_name: "Bash",
        tool_kind: "shell",
        display: "npm test",
      },
    });
  });

  it("maps a tool_result block on a user record to tool_result", () => {
    const events = claudeEventsFromLine(
      claudeLine({
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_abc",
              is_error: false,
              content: [{ type: "text", text: "ok, 12 passed" }],
            },
          ],
        },
      }),
      4,
    );
    expect(events[0].event).toMatchObject({
      kind: "tool_result",
      role: "agent",
      payload: { call_id: "toolu_abc", ok: true, is_error: false },
    });
    const payload = events[0].event.payload as { output: string };
    expect(payload.output).toContain("12 passed");
  });

  it("maps a plain user text record to an owner-role user_prompt", () => {
    const events = claudeEventsFromLine(
      claudeLine({
        type: "user",
        message: { role: "user", content: "please fix the bug" },
      }),
      5,
    );
    expect(events[0].event).toMatchObject({
      kind: "user_prompt",
      role: "owner",
      payload: { text: "please fix the bug", source: "human" },
    });
  });

  it("splits a mixed assistant record into per-block events, preserving order", () => {
    const events = claudeEventsFromLine(
      claudeLine({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "running now" },
            { type: "tool_use", id: "toolu_x", name: "Read", input: { file_path: "/a/b.ts" } },
          ],
        },
      }),
      6,
    );
    expect(kinds(events)).toStrictEqual(["agent_message", "tool_call"]);
    expect(events[1].event.payload).toMatchObject({
      tool_kind: "file_read",
      display: "/a/b.ts",
    });
  });

  it("correlates tool_call and tool_result via call_id", () => {
    const call = claudeEventsFromLine(
      claudeLine({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "toolu_9", name: "Bash", input: { command: "ls" } }],
        },
      }),
      7,
    );
    const result = claudeEventsFromLine(
      claudeLine({
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_9", content: "a\nb" }],
        },
      }),
      8,
    );
    const callId = (call[0].event.payload as { call_id: string }).call_id;
    const resultId = (result[0].event.payload as { call_id: string }).call_id;
    expect(callId).toBe("toolu_9");
    expect(resultId).toBe(callId);
  });

  it("returns nothing for an unparseable line", () => {
    expect(claudeEventsFromLine("not json", 9)).toStrictEqual([]);
    expect(claudeEventsFromLine(claudeLine({ type: "system" }), 10)).toStrictEqual([]);
  });

  it("byte-caps multi-byte tool_result output within the byte budget", () => {
    // 3000 four-byte emoji = 12000 UTF-8 bytes. A code-unit `slice(0, 4096)`
    // would keep ~8192 bytes and defeat the cap, so this asserts a true byte
    // bound and that the boundary never leaves a split code point.
    const huge = "😀".repeat(3000);
    const events = claudeEventsFromLine(
      claudeLine({
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_big", content: huge }],
        },
      }),
      11,
    );
    const output = (events[0].event.payload as { output: string }).output;
    const elisionBytes = Buffer.byteLength("\n…[truncated]", "utf8");
    expect(Buffer.byteLength(output, "utf8")).toBeLessThanOrEqual(4096 + elisionBytes);
    expect(output.endsWith("…[truncated]")).toBe(true);
    expect(output).not.toContain("�");
  });

  it("bounds an oversized tool_input but keeps small inputs structured", () => {
    const big = claudeEventsFromLine(
      claudeLine({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_big",
              name: "Write",
              input: { file_path: "/a.ts", content: "x".repeat(20000) },
            },
          ],
        },
      }),
      12,
    );
    const input = (big[0].event.payload as { input: unknown }).input;
    const elisionBytes = Buffer.byteLength("\n…[truncated]", "utf8");
    expect(typeof input).toBe("string");
    expect(Buffer.byteLength(input as string, "utf8")).toBeLessThanOrEqual(4096 + elisionBytes);

    const small = claudeEventsFromLine(
      claudeLine({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "t2", name: "Read", input: { file_path: "/a.ts" } }],
        },
      }),
      13,
    );
    expect((small[0].event.payload as { input: unknown }).input).toEqual({ file_path: "/a.ts" });
  });
});

describe("codexEventsFromLine", () => {
  it("maps a user_message event to an owner user_prompt", () => {
    const events = codexEventsFromLine(
      claudeLine({
        type: "event_msg",
        payload: { type: "user_message", message: "hi codex" },
      }),
      1,
    );
    expect(events[0].event).toMatchObject({
      kind: "user_prompt",
      role: "owner",
      payload: { text: "hi codex" },
    });
  });

  it("maps a function_call to a tool_call", () => {
    const events = codexEventsFromLine(
      claudeLine({
        type: "response_item",
        payload: {
          type: "function_call",
          name: "shell",
          call_id: "call_1",
          arguments: '{"command":"cargo test"}',
        },
      }),
      2,
    );
    expect(events[0].event).toMatchObject({
      kind: "tool_call",
      payload: { call_id: "call_1", tool_name: "shell", tool_kind: "shell" },
    });
  });

  it("parses JSON-string arguments into structured input and a field display", () => {
    const events = codexEventsFromLine(
      claudeLine({
        type: "response_item",
        payload: {
          type: "function_call",
          name: "shell",
          call_id: "call_args",
          arguments: '{"command":"cargo test","description":"run tests"}',
        },
      }),
      6,
    );
    expect(events[0].event.payload).toMatchObject({
      display: "cargo test",
      input: { command: "cargo test", description: "run tests" },
    });
  });

  it("maps a function_call_output to a tool_result with the same call_id", () => {
    const events = codexEventsFromLine(
      claudeLine({
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_1",
          output: { content: "done", success: true },
        },
      }),
      3,
    );
    expect(events[0].event).toMatchObject({
      kind: "tool_result",
      payload: { call_id: "call_1", ok: true, is_error: false },
    });
  });

  it("maps a reasoning payload to agent_thinking", () => {
    const events = codexEventsFromLine(
      claudeLine({
        type: "response_item",
        payload: {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "plan the change" }],
        },
      }),
      4,
    );
    expect(events[0].event).toMatchObject({
      kind: "agent_thinking",
      payload: { text: "plan the change" },
    });
  });

  it("flags a failed function_call_output as an error", () => {
    const events = codexEventsFromLine(
      claudeLine({
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_2",
          output: { content: "boom", success: false },
        },
      }),
      5,
    );
    expect(events[0].event.payload).toMatchObject({ ok: false, is_error: true });
  });
});

describe("createHarnessLineMapper (codex duplicate assistant records)", () => {
  // Codex v0.144 rollout JSONL records every assistant message twice, on
  // adjacent lines with the same timestamp — these mirror the real shapes.
  const eventMsgLine = (text: string, timestamp: string): string =>
    claudeLine({
      type: "event_msg",
      timestamp,
      payload: { type: "agent_message", message: text, phase: "final_answer" },
    });
  const responseItemLine = (text: string, timestamp: string): string =>
    claudeLine({
      type: "response_item",
      timestamp,
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    });

  it("emits a single agent_message for the event_msg + response_item pair", () => {
    const map = createHarnessLineMapper("codex");
    const at = "2026-07-12T10:00:00.000Z";
    const events = [
      ...map(eventMsgLine("all done", at), 1),
      ...map(responseItemLine("all done", at), 2),
    ];
    expect(kinds(events)).toStrictEqual(["agent_message"]);
    expect(events[0].event.payload).toMatchObject({ text: "all done" });
  });

  it("keeps distinct messages and a genuine later repeat", () => {
    const map = createHarnessLineMapper("codex");
    const events = [
      ...map(eventMsgLine("first", "2026-07-12T10:00:00.000Z"), 1),
      ...map(responseItemLine("first", "2026-07-12T10:00:00.000Z"), 2),
      ...map(eventMsgLine("second", "2026-07-12T10:00:01.000Z"), 3),
      ...map(responseItemLine("second", "2026-07-12T10:00:01.000Z"), 4),
      // Same text again much later — a real new turn, not the double record.
      ...map(eventMsgLine("first", "2026-07-12T10:05:00.000Z"), 5),
    ];
    const texts = events.map(
      (event) => (event.event.payload as { text: string }).text,
    );
    expect(kinds(events)).toStrictEqual([
      "agent_message",
      "agent_message",
      "agent_message",
    ]);
    expect(texts).toStrictEqual(["first", "second", "first"]);
  });

  it("still emits when only one record shape is present", () => {
    // Neither shape is guaranteed across codex versions/modes, so a stream
    // carrying only response_item (or only event_msg) must not lose messages.
    const map = createHarnessLineMapper("codex");
    const events = map(
      responseItemLine("lone reply", "2026-07-12T10:00:00.000Z"),
      1,
    );
    expect(kinds(events)).toStrictEqual(["agent_message"]);
  });

  it("does not dedupe across separate mapper instances (per-stream state)", () => {
    const at = "2026-07-12T10:00:00.000Z";
    const first = createHarnessLineMapper("codex")(eventMsgLine("hi", at), 1);
    const second = createHarnessLineMapper("codex")(eventMsgLine("hi", at), 1);
    expect(kinds(first)).toStrictEqual(["agent_message"]);
    expect(kinds(second)).toStrictEqual(["agent_message"]);
  });
});

describe("harnessEventsFromLine dispatch", () => {
  it("routes by provider", () => {
    const claude = harnessEventsFromLine(
      "claude",
      claudeLine({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "x" }] } }),
      1,
    );
    expect(claude[0].event.kind).toBe("agent_message");
    const codex = harnessEventsFromLine(
      "codex",
      claudeLine({ type: "event_msg", payload: { type: "user_message", message: "y" } }),
      1,
    );
    expect(codex[0].event.kind).toBe("user_prompt");
  });

  it("returns [] for an unregistered provider instead of guessing a branch", () => {
    const events = harnessEventsFromLine(
      "gemini" as HarnessProvider,
      claudeLine({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "x" }] } }),
      1,
    );
    expect(events).toStrictEqual([]);
  });
});

describe("normalizeToolKind", () => {
  it.each([
    ["Bash", "shell"],
    ["Read", "file_read"],
    ["Write", "file_write"],
    ["Edit", "edit"],
    ["MultiEdit", "edit"],
    ["Grep", "search"],
    ["Glob", "search"],
    ["WebFetch", "web"],
    ["Task", "task"],
    ["mcp__sentry__update_issue", "mcp"],
    ["apply_patch", "edit"],
    ["SomethingNew", "other"],
  ])("classifies %s as %s", (name, expected) => {
    expect(normalizeToolKind(name)).toBe(expected);
  });
});

describe("toolDisplay", () => {
  it("prefers the command field", () => {
    expect(toolDisplay("Bash", { command: "ls -la" })).toBe("ls -la");
  });
  it("falls back to file_path then pattern then name", () => {
    expect(toolDisplay("Read", { file_path: "/x.ts" })).toBe("/x.ts");
    expect(toolDisplay("Grep", { pattern: "TODO" })).toBe("TODO");
    expect(toolDisplay("Mystery", {})).toBe("Mystery");
  });
  it("takes only the first line and bounds length", () => {
    expect(toolDisplay("Bash", { command: "line1\nline2" })).toBe("line1");
  });
});

// ── opencode SSE bus mapper ───────────────────────────────────────────────────

function busFrame(record: unknown): string {
  return JSON.stringify(record);
}

function partUpdated(part: unknown, sessionID = "ses_1"): string {
  return busFrame({
    type: "message.part.updated",
    properties: { sessionID, part, time: 1_700_000_000_000 },
  });
}

describe("opencodeEventsFromBusEvent (stateless routing)", () => {
  it("returns routing keys for a session.created frame with no events", () => {
    const mapping = opencodeEventsFromBusEvent(
      busFrame({
        type: "session.created",
        properties: { info: { id: "ses_9", directory: "/work/proj" } },
      }),
      1,
    );
    expect(mapping.sessionID).toBe("ses_9");
    expect(mapping.directory).toBe("/work/proj");
    expect(mapping.events).toHaveLength(0);
  });

  it("maps a session.error frame to an error event", () => {
    const mapping = opencodeEventsFromBusEvent(
      busFrame({
        type: "session.error",
        properties: {
          sessionID: "ses_1",
          error: { name: "ProviderError", data: { message: "no credentials" } },
        },
      }),
      1,
    );
    expect(kinds(mapping.events)).toEqual(["error"]);
    expect(mapping.events[0].event).toMatchObject({
      kind: "error",
      role: "agent",
      payload: { fatal: false },
    });
  });

  it("tags a message.part.updated with its sessionID (source filters)", () => {
    const mapping = opencodeEventsFromBusEvent(
      partUpdated(
        {
          type: "text",
          id: "prt_1",
          messageID: "msg_1",
          text: "hi",
          time: { start: 1, end: 2 },
        },
        "ses_other",
      ),
      1,
    );
    expect(mapping.sessionID).toBe("ses_other");
    expect(kinds(mapping.events)).toEqual(["agent_message"]);
  });

  it("ignores unknown/next.* frames", () => {
    const mapping = opencodeEventsFromBusEvent(
      busFrame({ type: "session.next.tool.progress", properties: {} }),
      1,
    );
    expect(mapping.events).toHaveLength(0);
  });
});

describe("createOpenCodeBusMapper (stateful dedup)", () => {
  it("emits exactly one tool_call and one tool_result across snapshots", () => {
    const map = createOpenCodeBusMapper();
    const pending = map.next(
      partUpdated({
        type: "tool",
        id: "p1",
        callID: "c1",
        tool: "bash",
        state: { status: "pending" },
      }),
      1,
    );
    const running = map.next(
      partUpdated({
        type: "tool",
        id: "p1",
        callID: "c1",
        tool: "bash",
        state: { status: "running", input: { command: "ls" } },
      }),
      2,
    );
    const completed = map.next(
      partUpdated({
        type: "tool",
        id: "p1",
        callID: "c1",
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "ls" },
          output: "a\nb",
        },
      }),
      3,
    );
    const extra = map.next(
      partUpdated({
        type: "tool",
        id: "p1",
        callID: "c1",
        tool: "bash",
        state: { status: "completed", output: "a\nb" },
      }),
      4,
    );
    expect(kinds(pending.events)).toEqual(["tool_call"]);
    expect(kinds(running.events)).toEqual([]);
    expect(kinds(completed.events)).toEqual(["tool_result"]);
    expect(kinds(extra.events)).toEqual([]);
    expect(completed.events[0].event).toMatchObject({
      kind: "tool_result",
      payload: { call_id: "c1", ok: true, is_error: false },
    });
  });

  it("synthesizes a tool_call when the first snapshot is already terminal", () => {
    const map = createOpenCodeBusMapper();
    const done = map.next(
      partUpdated({
        type: "tool",
        id: "p2",
        callID: "c2",
        tool: "read",
        state: { status: "error", output: "boom" },
      }),
      1,
    );
    expect(kinds(done.events)).toEqual(["tool_call", "tool_result"]);
    expect(done.events[1].event).toMatchObject({
      kind: "tool_result",
      payload: { ok: false, is_error: true },
    });
  });

  it("emits a text part once, on its terminal (time.end) snapshot", () => {
    const map = createOpenCodeBusMapper();
    const partial = map.next(
      partUpdated({
        type: "text",
        id: "t1",
        messageID: "m1",
        text: "hel",
        time: { start: 1 },
      }),
      1,
    );
    const done = map.next(
      partUpdated({
        type: "text",
        id: "t1",
        messageID: "m1",
        text: "hello",
        time: { start: 1, end: 2 },
      }),
      2,
    );
    expect(kinds(partial.events)).toEqual([]);
    expect(kinds(done.events)).toEqual(["agent_message"]);
    expect(done.events[0].event).toMatchObject({
      kind: "agent_message",
      payload: { text: "hello" },
    });
  });

  it("surfaces a user-role text part as an owner prompt", () => {
    const map = createOpenCodeBusMapper();
    map.next(
      busFrame({
        type: "message.updated",
        properties: { sessionID: "ses_1", info: { id: "mu", role: "user" } },
      }),
      1,
    );
    const done = map.next(
      partUpdated({
        type: "text",
        id: "tu",
        messageID: "mu",
        text: "do the thing",
        time: { start: 1, end: 2 },
      }),
      2,
    );
    expect(done.events[0].event).toMatchObject({
      kind: "user_prompt",
      role: "owner",
      payload: { text: "do the thing", source: "human" },
    });
  });

  it("flushes a still-buffered text part via message.updated then flush()", () => {
    const viaMessage = createOpenCodeBusMapper();
    viaMessage.next(
      partUpdated({
        type: "text",
        id: "t2",
        messageID: "m2",
        text: "buffered",
        time: { start: 1 },
      }),
      1,
    );
    const flushed = viaMessage.next(
      busFrame({
        type: "message.updated",
        properties: {
          sessionID: "ses_1",
          info: { id: "m2", role: "assistant" },
        },
      }),
      2,
    );
    expect(kinds(flushed.events)).toEqual(["agent_message"]);

    const viaFlush = createOpenCodeBusMapper();
    viaFlush.next(
      partUpdated({
        type: "text",
        id: "t3",
        messageID: "m3",
        text: "tail",
        time: { start: 1 },
      }),
      1,
    );
    const drained = viaFlush.flush(9);
    expect(kinds(drained)).toEqual(["agent_message"]);
    expect(drained[0].event).toMatchObject({ payload: { text: "tail" } });
  });
});
