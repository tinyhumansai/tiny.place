import { describe, expect, it } from "vitest";
import {
  applySessionEnvelope,
  foldSessionEnvelopes,
  initialSessionView,
  isV2,
  parseSessionEnvelope,
} from "../src/cli/harness-consumer.js";
import { harnessEventsFromLine } from "../src/cli/harness-events.js";
import { buildEventEnvelopeV2 } from "../src/cli/harness-envelope.js";
import type { EnvelopeContext } from "../src/cli/harness-envelope.js";
import type {
  AnySessionEnvelope,
  SessionEnvelopeV2,
} from "../src/index.js";

const ctx: EnvelopeContext = {
  provider: "claude",
  command: "claude",
  argv: [],
  scopeType: "session",
  scopeKey: "k",
  cwd: "/work/proj",
  wrapperSessionId: "wrap-1",
  harnessSessionId: "sess-1",
  bucketUnit: "hour",
  sourcePath: "/s.jsonl",
};

// Build a realistic v2 stream from Claude JSONL lines via the real producer.
function streamFrom(lines: Array<string>): Array<SessionEnvelopeV2> {
  let seq = 0;
  const out: Array<SessionEnvelopeV2> = [];
  lines.forEach((raw, index) => {
    for (const semantic of harnessEventsFromLine("claude", raw, index)) {
      out.push(buildEventEnvelopeV2(ctx, semantic, seq));
      seq += 1;
    }
  });
  return out;
}

const LINES = [
  JSON.stringify({ type: "user", message: { role: "user", content: "run tests" } }),
  JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "on it" },
        { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "npm test" } },
      ],
    },
  }),
  JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1", is_error: false, content: "12 passed" }],
    },
  }),
];

describe("parseSessionEnvelope", () => {
  it("accepts a v2 JSON string and a v2 object", () => {
    const env = streamFrom(LINES)[0];
    const asString = parseSessionEnvelope(JSON.stringify(env));
    expect(asString && isV2(asString)).toBe(true);
    expect(parseSessionEnvelope(env)).toBeDefined();
  });

  it("rejects non-envelopes and garbage", () => {
    expect(parseSessionEnvelope("not json")).toBeUndefined();
    expect(parseSessionEnvelope({ hello: 1 })).toBeUndefined();
    expect(parseSessionEnvelope(null)).toBeUndefined();
    expect(parseSessionEnvelope(42)).toBeUndefined();
  });

  it("drops a version-tagged v2 body with a missing or malformed event", () => {
    // Untrusted inbound DM: correct version tag but no usable event. Must be
    // dropped, not cast through (else event.seq reads throw downstream).
    expect(
      parseSessionEnvelope({ envelope_version: "tinyplace.harness.session.v2" }),
    ).toBeUndefined();
    expect(
      parseSessionEnvelope({
        envelope_version: "tinyplace.harness.session.v2",
        event: { id: "x" }, // seq missing
      }),
    ).toBeUndefined();
    expect(
      parseSessionEnvelope({
        envelope_version: "tinyplace.harness.session.v2",
        event: { seq: 1, id: 5 }, // id not a string
      }),
    ).toBeUndefined();
  });

  it("folds a stream containing a malformed v2 body without throwing", () => {
    const good = streamFrom(LINES);
    const poisoned = [
      { envelope_version: "tinyplace.harness.session.v2" } as unknown as AnySessionEnvelope,
      ...good,
    ];
    expect(() => foldSessionEnvelopes(poisoned)).not.toThrow();
    const view = foldSessionEnvelopes(poisoned);
    expect(view.provider).toBe("claude");
  });

  it("recognises a v1 envelope but isV2 is false", () => {
    const v1 = { envelope_version: "tinyplace.harness.session.v1" } as unknown;
    const parsed = parseSessionEnvelope(v1);
    expect(parsed).toBeDefined();
    expect(parsed && isV2(parsed)).toBe(false);
  });
});

describe("applySessionEnvelope", () => {
  it("marks running_tool with a descriptive currentTask on tool_call", () => {
    const stream = streamFrom(LINES);
    const call = stream.find((env) => env.event.kind === "tool_call");
    if (!call) {
      throw new Error("expected a tool_call in the stream");
    }
    const view = applySessionEnvelope(initialSessionView(), call);
    expect(view.status).toBe("running_tool");
    expect(view.currentTask).toBe("Bash: npm test");
    expect(view.tools).toHaveLength(1);
    expect(view.tools[0]).toMatchObject({ callId: "toolu_1", done: false });
  });

  it("ignores v1 envelopes and returns the same reference", () => {
    const view = initialSessionView();
    const v1 = { envelope_version: "tinyplace.harness.session.v1" } as unknown as AnySessionEnvelope;
    expect(applySessionEnvelope(view, v1)).toBe(view);
  });

  it("returns the same view (no throw) for a malformed v2 envelope", () => {
    const view = initialSessionView();
    const malformed = {
      envelope_version: "tinyplace.harness.session.v2",
    } as unknown as AnySessionEnvelope;
    expect(() => applySessionEnvelope(view, malformed)).not.toThrow();
    expect(applySessionEnvelope(view, malformed)).toBe(view);
  });

  it("drops duplicate / out-of-order packets by seq", () => {
    const stream = streamFrom(LINES);
    const first = applySessionEnvelope(initialSessionView(), stream[1]);
    const replay = applySessionEnvelope(first, stream[1]);
    expect(replay).toBe(first); // same seq -> no change, same ref
  });
});

describe("foldSessionEnvelopes", () => {
  it("reduces a full stream into live session state", () => {
    const view = foldSessionEnvelopes(streamFrom(LINES));
    expect(view.provider).toBe("claude");
    expect(view.harnessSessionId).toBe("sess-1");
    // tool ran and completed successfully.
    const tool = view.tools.find((t) => t.callId === "toolu_1");
    expect(tool).toMatchObject({ done: true, ok: true, isError: false });
    // feed carries the human prompt, the agent line, and tool activity in order.
    const kinds = view.feed.map((entry) => entry.kind);
    expect(kinds).toContain("user_prompt");
    expect(kinds).toContain("agent_message");
    expect(kinds).toContain("tool_call");
    expect(view.feed).toStrictEqual([...view.feed].sort((a, b) => a.seq - b.seq));
  });

  it("applies a status envelope to drive the dot and currentTask", () => {
    const statusEnv = buildEventEnvelopeV2(
      ctx,
      {
        line: 0,
        timestamp: new Date("2026-07-07T10:00:00.000Z"),
        recordType: "derived:status",
        event: {
          kind: "status",
          role: "agent",
          payload: { state: "waiting_approval", detail: "awaiting approval: rm -rf" },
        },
      },
      0,
    );
    const view = applySessionEnvelope(initialSessionView(), statusEnv);
    expect(view.status).toBe("waiting_approval");
    expect(view.currentTask).toBe("awaiting approval: rm -rf");
  });

  it("caps the feed to the configured limit", () => {
    const many = Array.from({ length: 10 }, (_unused, index) =>
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: `line ${index}` }] },
      }),
    );
    const view = foldSessionEnvelopes(streamFrom(many), { tools: 50, feed: 3 });
    expect(view.feed).toHaveLength(3);
    expect(view.feed[view.feed.length - 1].text).toBe("line 9");
  });
});
