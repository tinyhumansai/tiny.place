import { describe, expect, it } from "vitest";
import {
  buildEventEnvelopeV2,
} from "../src/cli/harness-envelope.js";
import type { EnvelopeContext } from "../src/cli/harness-envelope.js";
import type { HarnessSemanticEvent } from "../src/cli/harness-events.js";
import type { SessionInfoPayload } from "../src/index.js";

const ctx: EnvelopeContext = {
  provider: "claude",
  command: "claude",
  argv: ["--resume"],
  scopeType: "session",
  scopeKey: "abc",
  cwd: "/work/proj",
  wrapperSessionId: "wrap-1",
  harnessSessionId: "sess-1",
  bucketUnit: "hour",
  sourcePath: "/home/u/.claude/projects/p/sess-1.jsonl",
};

const toolCall: HarnessSemanticEvent = {
  line: 7,
  timestamp: new Date("2026-07-07T10:34:12.000Z"),
  recordType: "assistant:tool_use",
  event: {
    kind: "tool_call",
    role: "agent",
    payload: {
      call_id: "toolu_1",
      tool_name: "Bash",
      tool_kind: "shell",
      display: "npm test",
      input: { command: "npm test" },
    },
  },
};

describe("buildEventEnvelopeV2", () => {
  it("stamps version, provider and the typed event through", () => {
    const env = buildEventEnvelopeV2(ctx, toolCall, 3);
    expect(env.envelope_version).toBe("tinyplace.harness.session.v2");
    expect(env.version).toBe(2);
    expect(env.harness.provider).toBe("claude");
    expect(env.event).toMatchObject({
      seq: 3,
      kind: "tool_call",
      role: "agent",
      ts: "2026-07-07T10:34:12.000Z",
      payload: { call_id: "toolu_1", tool_name: "Bash" },
    });
    expect(env.source).toMatchObject({
      path: ctx.sourcePath,
      record_type: "assistant:tool_use",
    });
  });

  it("floors the bucket to the configured unit", () => {
    const hour = buildEventEnvelopeV2(ctx, toolCall, 1);
    expect(hour.bucket).toMatchObject({
      unit: "hour",
      start: "2026-07-07T10:00:00.000Z",
      end: "2026-07-07T11:00:00.000Z",
    });
    const day = buildEventEnvelopeV2({ ...ctx, bucketUnit: "day" }, toolCall, 1);
    expect(day.bucket).toMatchObject({
      start: "2026-07-07T00:00:00.000Z",
      end: "2026-07-08T00:00:00.000Z",
    });
    const minute = buildEventEnvelopeV2({ ...ctx, bucketUnit: "minute" }, toolCall, 1);
    expect(minute.bucket).toMatchObject({
      start: "2026-07-07T10:34:00.000Z",
      end: "2026-07-07T10:35:00.000Z",
    });
  });

  it("produces a stable id for identical inputs and a different id per seq", () => {
    const a = buildEventEnvelopeV2(ctx, toolCall, 3).event.id;
    const b = buildEventEnvelopeV2(ctx, toolCall, 3).event.id;
    const c = buildEventEnvelopeV2(ctx, toolCall, 4).event.id;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("builds a session_info event through the generic v2 builder", () => {
    const payload: SessionInfoPayload = {
      agent_address: "ELQUJvq27tYx",
      handle: "@alice",
      title: "myrepo · feat/x",
      repo: "org/myrepo",
      branch: "feat/x",
      model: "claude-opus-4-8",
      harness_version: "1.4.2",
      capabilities: ["agent_message", "tool_call", "tool_result"],
      resumed: false,
      started_at: "2026-07-07T10:34:12.000Z",
    };
    const sessionInfo: HarnessSemanticEvent = {
      line: 0,
      timestamp: new Date("2026-07-07T10:34:12.000Z"),
      recordType: "hook:SessionStart",
      event: { kind: "session_info", role: "agent", payload },
    };
    const env = buildEventEnvelopeV2(ctx, sessionInfo, 0);
    expect(env.event).toMatchObject({
      seq: 0,
      kind: "session_info",
      role: "agent",
      payload: { agent_address: "ELQUJvq27tYx", resumed: false },
    });
    expect(env.source.record_type).toBe("hook:SessionStart");
    // Idempotent id: a resend of the same session_info (same seq) reuses the id.
    expect(buildEventEnvelopeV2(ctx, sessionInfo, 0).event.id).toBe(env.event.id);
    // A resumed re-emit (distinct seq) gets a distinct id so the receiver can
    // upsert rather than dedup it away.
    const resumed = buildEventEnvelopeV2(ctx, sessionInfo, 1).event.id;
    expect(resumed).not.toBe(env.event.id);
  });

  it("includes turn_id and model only when provided", () => {
    const bare = buildEventEnvelopeV2(ctx, toolCall, 1).event;
    expect("turn_id" in bare).toBe(false);
    expect("model" in bare).toBe(false);
    const rich = buildEventEnvelopeV2(
      { ...ctx, turnId: "turn-9", model: "claude-opus" },
      toolCall,
      1,
    ).event;
    expect(rich).toMatchObject({ turn_id: "turn-9", model: "claude-opus" });
  });
});
