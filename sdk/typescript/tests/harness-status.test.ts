import { describe, expect, it } from "vitest";
import {
  initialStatus,
  reduceStatus,
  tickStatus,
} from "../src/cli/harness-status.js";
import {
  codexEventsFromLine,
  type HarnessSemanticEvent,
} from "../src/cli/harness-events.js";
import type { HarnessEvent } from "../src/types/harness.js";

function ev(inner: HarnessEvent, atMs = 1_000): HarnessSemanticEvent {
  return {
    line: 1,
    timestamp: new Date(atMs),
    recordType: "test",
    event: inner,
  };
}

describe("reduceStatus", () => {
  it("starts idle", () => {
    expect(initialStatus().state).toBe("idle");
  });

  it("moves to running on a user prompt", () => {
    const step = reduceStatus(
      initialStatus(),
      ev({ kind: "user_prompt", role: "owner", payload: { text: "go", source: "human" } }),
    );
    expect(step.next.state).toBe("running");
    expect(step.emit).toMatchObject({ state: "running", detail: "working" });
  });

  it("enters running_tool with the active call id and a descriptive detail", () => {
    const step = reduceStatus(
      initialStatus(),
      ev({
        kind: "tool_call",
        role: "agent",
        payload: {
          call_id: "toolu_1",
          tool_name: "Bash",
          tool_kind: "shell",
          display: "npm test",
          input: {},
        },
      }),
    );
    expect(step.next).toMatchObject({ state: "running_tool", activeCallId: "toolu_1" });
    expect(step.emit).toMatchObject({
      state: "running_tool",
      detail: "running Bash: npm test",
      active_call_id: "toolu_1",
    });
  });

  it("clears the active call id and returns to running on tool_result", () => {
    const running = reduceStatus(
      initialStatus(),
      ev({
        kind: "tool_call",
        role: "agent",
        payload: { call_id: "toolu_1", tool_name: "Bash", tool_kind: "shell", display: "ls", input: {} },
      }),
    ).next;
    const step = reduceStatus(
      running,
      ev({
        kind: "tool_result",
        role: "agent",
        payload: { call_id: "toolu_1", ok: true, is_error: false, output: "x", output_bytes: 1 },
      }),
    );
    expect(step.next.state).toBe("running");
    expect(step.next.activeCallId).toBeUndefined();
    expect(step.emit?.active_call_id).toBeUndefined();
  });

  it("is change-gated: no emit when state and detail repeat", () => {
    const first = reduceStatus(
      initialStatus(),
      ev({ kind: "agent_thinking", role: "agent", payload: { text: "a" } }),
    );
    const second = reduceStatus(
      first.next,
      ev({ kind: "agent_thinking", role: "agent", payload: { text: "b" } }, 2_000),
    );
    expect(first.emit).toBeDefined();
    expect(second.emit).toBeUndefined();
  });

  it("blocks on approval requests", () => {
    const step = reduceStatus(
      initialStatus(),
      ev({
        kind: "approval_request",
        role: "agent",
        payload: { call_id: "toolu_2", tool_name: "Bash", display: "rm -rf build" },
      }),
    );
    expect(step.emit).toMatchObject({
      state: "waiting_approval",
      active_call_id: "toolu_2",
    });
  });

  it("goes to errored on a fatal error and stays running on a soft one", () => {
    const fatal = reduceStatus(
      initialStatus(),
      ev({ kind: "error", role: "agent", payload: { message: "oom", fatal: true } }),
    );
    expect(fatal.next.state).toBe("errored");
    const soft = reduceStatus(
      initialStatus(),
      ev({ kind: "error", role: "agent", payload: { message: "retrying", fatal: false } }),
    );
    expect(soft.next.state).toBe("running");
  });

  it("surfaces a compact lifecycle phase as active compaction", () => {
    const step = reduceStatus(
      initialStatus(),
      ev({ kind: "lifecycle", role: "agent", payload: { phase: "compact" } }),
    );
    expect(step.next.state).toBe("running");
    expect(step.emit).toMatchObject({ state: "running", detail: "compacting" });
  });

  it("stops on a session_end lifecycle event", () => {
    const step = reduceStatus(
      initialStatus(),
      ev({ kind: "lifecycle", role: "agent", payload: { phase: "session_end" } }),
    );
    expect(step.next.state).toBe("stopped");
  });

  it("keeps a timestamp-less Codex tool_call active instead of idling it", () => {
    // A Codex record with no timestamp used to stamp the Unix epoch, so the
    // activity clock never advanced and the very next tick idled a live session.
    const [event] = codexEventsFromLine(
      JSON.stringify({
        type: "response_item",
        payload: { type: "function_call", name: "shell", call_id: "c1", arguments: "{}" },
      }),
      1,
    );
    const step = reduceStatus(initialStatus(0), event);
    expect(step.next.state).toBe("running_tool");
    expect(step.next.lastEventAtMs).toBeGreaterThan(0);
    const tick = tickStatus(step.next, step.next.lastEventAtMs + 1_000, {
      idleAfterMs: 30_000,
    });
    expect(tick.emit).toBeUndefined();
    expect(tick.next.state).toBe("running_tool");
  });

  it("ignores unknown events but advances the activity clock", () => {
    const start = { ...initialStatus(), state: "running" as const, lastEventAtMs: 1_000 };
    const step = reduceStatus(
      start,
      ev({ kind: "unknown", role: "agent", payload: { raw: {} } }, 5_000),
    );
    expect(step.emit).toBeUndefined();
    expect(step.next.state).toBe("running");
    expect(step.next.lastEventAtMs).toBe(5_000);
  });
});

describe("tickStatus", () => {
  const running = { state: "running" as const, detail: "working", lastEventAtMs: 1_000 };

  it("ages a silent active session into idle past the threshold", () => {
    const step = tickStatus(running, 40_000, { idleAfterMs: 30_000 });
    expect(step.next.state).toBe("idle");
    expect(step.emit).toMatchObject({ state: "idle" });
  });

  it("re-emits current status as a heartbeat when not yet stale", () => {
    const step = tickStatus(running, 10_000, { idleAfterMs: 30_000, heartbeat: true });
    expect(step.emit).toMatchObject({ state: "running", detail: "working" });
    expect(step.next).toBe(running);
  });

  it("emits nothing when not stale and heartbeat is off", () => {
    const step = tickStatus(running, 10_000, { idleAfterMs: 30_000 });
    expect(step.emit).toBeUndefined();
  });

  it("does not re-idle an already idle session", () => {
    const idle = { state: "idle" as const, detail: "idle", lastEventAtMs: 1_000 };
    const step = tickStatus(idle, 999_999, { idleAfterMs: 30_000 });
    expect(step.emit).toBeUndefined();
  });
});
