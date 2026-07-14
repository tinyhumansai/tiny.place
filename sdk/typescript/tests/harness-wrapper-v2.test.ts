import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  HarnessSessionTailer,
  SessionEnvelopePublisher,
  type HarnessWrapperConfig,
} from "../src/cli/harness-wrapper.js";
import type { SessionEnvelopeV2 } from "../src/index.js";
import type { TinyPlaceCliOptions } from "../src/cli/types.js";

// Drives the real tailer against a fixture Claude session file in dry-run mode.
// Dry-run routes envelopes to the provided Writable instead of the network, so
// we can assert the v2 typed-event stream the poll loop emits when emitV2 is on.

function baseConfig(sessionFile: string, over: Partial<HarnessWrapperConfig>): HarnessWrapperConfig {
  return {
    agentArgs: [],
    agentBin: "claude",
    bucket: "hour",
    captureError: true,
    captureInput: true,
    captureOutput: true,
    captureSession: true,
    dryRun: true,
    emitV2: false,
    outDir: join(tmpdir(), "tp-v2-out"),
    provider: "claude",
    receiveEnabled: false,
    receivePollMs: 1500,
    sessionFile,
    sessionPollMs: 500,
    sessionsDir: join(tmpdir(), "tp-v2-sessions"),
    sessionTailGraceMs: 0,
    scope: "session",
    statusHeartbeatMs: 15_000,
    statusIdleMs: 30_000,
    usePty: false,
    wrapperSessionId: "wrap-test",
    ...over,
  };
}

const CLAUDE_LINES = [
  JSON.stringify({
    type: "user",
    timestamp: "2026-07-07T10:00:00.000Z",
    message: { role: "user", content: "run the tests" },
  }),
  JSON.stringify({
    type: "assistant",
    timestamp: "2026-07-07T10:00:01.000Z",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "running" },
        { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "npm test" } },
      ],
    },
  }),
  JSON.stringify({
    type: "user",
    timestamp: "2026-07-07T10:00:03.000Z",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1", is_error: false, content: "12 passed" }],
    },
  }),
];

function collector(): { out: Writable; envelopes: () => Array<SessionEnvelopeV2> } {
  const chunks: Array<string> = [];
  const out = new Writable({
    write(chunk, _enc, cb): void {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return {
    out,
    envelopes: (): Array<SessionEnvelopeV2> =>
      chunks
        .join("")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as SessionEnvelopeV2)
        .filter((env) => env.envelope_version === "tinyplace.harness.session.v2"),
  };
}

async function drive(config: HarnessWrapperConfig, out: Writable): Promise<void> {
  const options = { env: {} } as unknown as TinyPlaceCliOptions;
  const publisher = new SessionEnvelopePublisher(config, options, out);
  const tailer = new HarnessSessionTailer(config, "/work/proj", out, publisher);
  tailer.start(new Date("2026-07-07T09:59:00.000Z"));
  await tailer.stop();
}

describe("HarnessSessionTailer v2 emission", () => {
  const dirs: Array<string> = [];
  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  function fixture(): string {
    const dir = mkdtempSync(join(tmpdir(), "tp-v2-"));
    dirs.push(dir);
    const file = join(dir, "session.jsonl");
    writeFileSync(file, `${CLAUDE_LINES.join("\n")}\n`, "utf8");
    return file;
  }

  it("emits nothing v2 when emitV2 is off (v1-only default)", async () => {
    const file = fixture();
    const { out, envelopes } = collector();
    await drive(baseConfig(file, { emitV2: false }), out);
    expect(envelopes()).toHaveLength(0);
  });

  it("emits typed tool_call, tool_result and derived status when emitV2 is on", async () => {
    const file = fixture();
    const { out, envelopes } = collector();
    await drive(baseConfig(file, { emitV2: true }), out);
    const events = envelopes();
    const kinds = events.map((env) => env.event.kind);

    expect(kinds).toContain("user_prompt");
    expect(kinds).toContain("agent_message");
    expect(kinds).toContain("tool_call");
    expect(kinds).toContain("tool_result");
    expect(kinds).toContain("status");

    // every envelope is provider-tagged and monotonically sequenced.
    expect(events.every((env) => env.harness.provider === "claude")).toBe(true);
    const seqs = events.map((env) => env.event.seq);
    expect(seqs).toStrictEqual([...seqs].sort((a, b) => a - b));

    // tool_call and its result correlate by call id.
    const call = events.find((env) => env.event.kind === "tool_call");
    const result = events.find((env) => env.event.kind === "tool_result");
    const callId = (call?.event.payload as { call_id: string }).call_id;
    expect(callId).toBe("toolu_1");
    expect((result?.event.payload as { call_id: string }).call_id).toBe(callId);

    // a running_tool status was derived from the tool_call.
    const statuses = events
      .filter((env) => env.event.kind === "status")
      .map((env) => (env.event.payload as { state: string }).state);
    expect(statuses).toContain("running_tool");
  });
});
