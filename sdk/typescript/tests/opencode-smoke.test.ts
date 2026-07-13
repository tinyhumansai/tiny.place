import { join } from "node:path";
import { tmpdir } from "node:os";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";

import {
  SessionEnvelopePublisher,
  type HarnessWrapperConfig,
} from "../src/cli/harness-wrapper.js";
import {
  OpenCodeEventSource,
  startOpenCodeServer,
} from "../src/cli/opencode-source.js";
import type { SessionEnvelopeV1 } from "../src/index.js";
import type { TinyPlaceCliOptions } from "../src/cli/types.js";

// Opt-in live smoke against a REAL `opencode serve`. Gated on the env flag so it
// never runs in CI: it needs opencode installed and an authed provider. It is
// the end-to-end check that OpenCodeEventSource, driven by real bus frames,
// publishes an agent message — and it exercises the exact text-completion signal
// (`time.end`) that the unit fixtures assume.
//
//   TINYPLACE_OPENCODE_SMOKE=1 pnpm --filter @tinyhumansai/tinyplace \
//     exec vitest run tests/opencode-smoke.test.ts

const RUN = process.env.TINYPLACE_OPENCODE_SMOKE === "1";
const BIN = process.env.TINYPLACE_OPENCODE_BIN ?? "opencode";

function config(cwd: string): HarnessWrapperConfig {
  return {
    agentArgs: [],
    agentBin: BIN,
    bucket: "hour",
    captureError: true,
    captureInput: true,
    captureOutput: true,
    captureSession: true,
    dryRun: true,
    emitV2: true,
    outDir: join(tmpdir(), "tp-oc-smoke"),
    provider: "opencode",
    receiveEnabled: false,
    receivePollMs: 1500,
    sessionPollMs: 500,
    sessionsDir: join(tmpdir(), "tp-oc-smoke-sessions"),
    sessionTailGraceMs: 0,
    scope: "session",
    statusHeartbeatMs: 15_000,
    statusIdleMs: 30_000,
    usePty: false,
    wrapperSessionId: "wrap-smoke",
  };
}

describe.skipIf(!RUN)("opencode live smoke", () => {
  it("publishes an agent message for a real turn over the SSE bus", async () => {
    const cwd = process.cwd();
    const server = await startOpenCodeServer({
      bin: BIN,
      cwd,
      env: process.env,
    });
    const chunks: Array<string> = [];
    const out = new Writable({
      write(chunk, _enc, cb): void {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const options = { env: process.env } as unknown as TinyPlaceCliOptions;
    const publisher = new SessionEnvelopePublisher(config(cwd), options, out);
    const source = new OpenCodeEventSource(
      config(cwd),
      cwd,
      out,
      publisher,
      {},
    );
    source.start(`${server.url}/event`);

    try {
      const session = (await (
        await fetch(`${server.url}/session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).json()) as { id: string };
      await fetch(`${server.url}/session/${session.id}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parts: [{ type: "text", text: "Reply with exactly: PONG" }],
        }),
      });
      // Poll for an agent message envelope (LLM latency).
      const deadline = Date.now() + 45_000;
      let messages: Array<SessionEnvelopeV1> = [];
      while (Date.now() < deadline) {
        messages = chunks
          .join("")
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((line) => JSON.parse(line) as SessionEnvelopeV1)
          .filter((env) => env.version === 1 && env.message?.role === "agent");
        if (messages.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.map((env) => env.message.text).join(" ")).toContain(
        "PONG",
      );
    } finally {
      await source.stop();
      await server.stop();
    }
  }, 90_000);
});
