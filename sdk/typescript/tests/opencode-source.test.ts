import { join } from "node:path";
import { tmpdir } from "node:os";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import {
  SessionEnvelopePublisher,
  type HarnessWrapperConfig,
} from "../src/cli/harness-wrapper.js";
import {
  OpenCodeEventSource,
  type SseConnect,
} from "../src/cli/opencode-source.js";
import type {
  AnySessionEnvelope,
  SessionEnvelopeV1,
  SessionEnvelopeV2,
} from "../src/index.js";
import type { TinyPlaceCliOptions } from "../src/cli/types.js";

// Drives the real OpenCodeEventSource against a synthetic SSE frame sequence
// (injected SseConnect — no server, no network). Dry-run routes every envelope
// to a Writable so we can assert the v1 messages and v2 typed events the source
// publishes, plus session filtering and flush-on-stop.

const CWD = "/work/proj";

function baseConfig(
  over: Partial<HarnessWrapperConfig> = {},
): HarnessWrapperConfig {
  return {
    agentArgs: [],
    agentBin: "opencode",
    bucket: "hour",
    captureError: true,
    captureInput: true,
    captureOutput: true,
    captureSession: true,
    dryRun: true,
    emitV2: false,
    outDir: join(tmpdir(), "tp-oc-out"),
    provider: "opencode",
    receiveEnabled: false,
    receivePollMs: 1500,
    sessionPollMs: 500,
    sessionsDir: join(tmpdir(), "tp-oc-sessions"),
    sessionTailGraceMs: 0,
    scope: "session",
    statusHeartbeatMs: 15_000,
    statusIdleMs: 30_000,
    usePty: false,
    wrapperSessionId: "wrap-oc",
    ...over,
  };
}

function frame(record: unknown): string {
  return JSON.stringify(record);
}

/** An injected SSE transport that replays a fixed list of JSON frame strings. */
function replay(frames: Array<string>): SseConnect {
  return async function* (): AsyncIterable<string> {
    for (const raw of frames) {
      yield raw;
    }
    // Hold open like a real stream would until aborted, so stop() controls exit.
    await new Promise((resolve) => setTimeout(resolve, 50));
  };
}

function collector(): {
  out: Writable;
  envelopes: () => Array<AnySessionEnvelope>;
} {
  const chunks: Array<string> = [];
  const out = new Writable({
    write(chunk, _enc, cb): void {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return {
    out,
    envelopes: (): Array<AnySessionEnvelope> =>
      chunks
        .join("")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as AnySessionEnvelope),
  };
}

async function drive(
  config: HarnessWrapperConfig,
  frames: Array<string>,
  out: Writable,
): Promise<void> {
  const options = { env: {} } as unknown as TinyPlaceCliOptions;
  // dryRun sends envelopes straight to `out`, so the publisher never touches
  // the network.
  const publisher = new SessionEnvelopePublisher(config, options, out);
  const source = new OpenCodeEventSource(config, CWD, out, publisher, {
    connect: replay(frames),
  });
  source.start("http://127.0.0.1:1/event");
  // Let the async reader drain the frames before we stop + flush.
  await new Promise((resolve) => setTimeout(resolve, 20));
  await source.stop();
}

const created = (directory = CWD, id = "ses_1"): string =>
  frame({ type: "session.created", properties: { info: { id, directory } } });

const textPart = (text: string, sessionID = "ses_1"): string =>
  frame({
    type: "message.part.updated",
    properties: {
      sessionID,
      part: {
        type: "text",
        id: `t_${text}`,
        messageID: "m1",
        text,
        time: { start: 1, end: 2 },
      },
    },
  });

describe("OpenCodeEventSource", () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => {
    for (const fn of cleanup.splice(0)) fn();
  });

  it("publishes a v1 agent message for our session", async () => {
    const { out, envelopes } = collector();
    await drive(
      baseConfig(),
      [frame({ type: "server.connected" }), created(), textPart("all done")],
      out,
    );
    const v1 = envelopes().filter(
      (env): env is SessionEnvelopeV1 => env.version === 1,
    );
    expect(v1.length).toBeGreaterThanOrEqual(1);
    expect(v1[0].message).toMatchObject({ role: "agent", text: "all done" });
    expect(v1[0].scope.harness_session_id).toBe("ses_1");
    expect(v1[0].source.path).toBe("opencode-sse://ses_1");
  });

  it("emits v2 typed events when emitV2 is on", async () => {
    const { out, envelopes } = collector();
    await drive(
      baseConfig({ emitV2: true }),
      [frame({ type: "server.connected" }), created(), textPart("hi")],
      out,
    );
    const v2 = envelopes().filter(
      (env): env is SessionEnvelopeV2 => env.version === 2,
    );
    const kinds = v2.map((env) => env.event.kind);
    expect(kinds).toContain("agent_message");
  });

  it("drops events for a different session on the shared bus", async () => {
    const { out, envelopes } = collector();
    await drive(
      baseConfig(),
      [
        created(CWD, "ses_mine"),
        textPart("mine", "ses_mine"),
        textPart("theirs", "ses_other"),
      ],
      out,
    );
    const texts = envelopes()
      .filter((env): env is SessionEnvelopeV1 => env.version === 1)
      .map((env) => env.message.text);
    expect(texts).toContain("mine");
    expect(texts).not.toContain("theirs");
  });

  it("never latches onto a session in a different directory", async () => {
    const { out, envelopes } = collector();
    await drive(
      baseConfig(),
      [created("/some/other/dir", "ses_x"), textPart("nope", "ses_x")],
      out,
    );
    expect(envelopes().filter((env) => env.version === 1)).toHaveLength(0);
  });
});
