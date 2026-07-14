import {
  appendFileSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import {
  HarnessSessionTailer,
  SessionEnvelopePublisher,
  type HarnessWrapperConfig,
} from "../src/cli/harness-wrapper.js";
import type { SessionEnvelope } from "../src/index.js";
import type { TinyPlaceCliOptions } from "../src/cli/types.js";

// A resumed session appends to a file that already existed at bridge start. The
// tailer must begin PAST that transcript, or resuming replays the whole history
// back into the OpenHuman thread. This drives the real tailer (dry-run → the
// Writable) and asserts only the post-resume turn is emitted.

function resumeConfig(file: string): HarnessWrapperConfig {
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
    outDir: join(tmpdir(), "tp-resume-out"),
    provider: "claude",
    receiveEnabled: false,
    receivePollMs: 1500,
    // Pin + resume the same file: locate resolves it deterministically AND the
    // offset-seed path (`located.path === resumeSessionFile`) is exercised.
    sessionFile: file,
    resumeSessionFile: file,
    sessionPollMs: 500,
    sessionsDir: join(tmpdir(), "tp-resume-sessions"),
    sessionTailGraceMs: 0,
    scope: "session",
    statusHeartbeatMs: 15_000,
    statusIdleMs: 30_000,
    usePty: false,
    wrapperSessionId: "tp-claude-resume-sess-1",
  };
}

const EXISTING = [
  JSON.stringify({
    type: "user",
    sessionId: "sess-1",
    timestamp: "2026-07-07T10:00:00.000Z",
    message: { role: "user", content: "old turn one" },
  }),
  JSON.stringify({
    type: "user",
    sessionId: "sess-1",
    timestamp: "2026-07-07T10:00:01.000Z",
    message: { role: "user", content: "old turn two" },
  }),
];

function v1Texts(chunks: Array<string>): Array<string> {
  return chunks
    .join("")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SessionEnvelope)
    .filter((env) => env.envelope_version === "tinyplace.harness.session.v1")
    .map((env) => env.message.text);
}

describe("HarnessSessionTailer resume offset", () => {
  const dirs: Array<string> = [];
  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("skips the existing transcript and emits only the post-resume turn", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tp-resume-"));
    dirs.push(dir);
    const file = join(dir, "session.jsonl");
    writeFileSync(file, `${EXISTING.join("\n")}\n`, "utf8");

    const chunks: Array<string> = [];
    const out = new Writable({
      write(chunk, _enc, cb): void {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const config = resumeConfig(file);
    const options = { env: {} } as unknown as TinyPlaceCliOptions;
    const publisher = new SessionEnvelopePublisher(config, options, out);
    const tailer = new HarnessSessionTailer(
      config,
      "/work/proj",
      out,
      publisher,
    );

    // start() records the 2 existing lines as the baseline; the first poll
    // locates the file and begins past them.
    tailer.start(new Date("2026-07-07T09:59:00.000Z"));
    // The resumed agent appends a fresh turn.
    appendFileSync(
      file,
      `${JSON.stringify({
        type: "user",
        sessionId: "sess-1",
        timestamp: "2026-07-07T11:00:00.000Z",
        message: { role: "user", content: "fresh turn after resume" },
      })}\n`,
      "utf8",
    );
    await tailer.stop();

    const texts = v1Texts(chunks);
    // Exact sequence: only the post-resume turn, no history replay, no dupes.
    expect(texts).toEqual(["fresh turn after resume"]);
  });

  it("resolves a symlinked resume path and ignores a competing fresh file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tp-resume-alias-"));
    dirs.push(dir);

    // The real resumed transcript lives under the scan dir; its meta pins cwd.
    const real = join(dir, "rollout-real.jsonl");
    writeFileSync(
      real,
      `${[
        JSON.stringify({
          type: "user",
          sessionId: "sess-1",
          cwd: "/work/proj",
          timestamp: "2026-07-07T10:00:00.000Z",
          message: { role: "user", content: "old turn one" },
        }),
        JSON.stringify({
          type: "user",
          sessionId: "sess-1",
          timestamp: "2026-07-07T10:00:01.000Z",
          message: { role: "user", content: "old turn two" },
        }),
      ].join("\n")}\n`,
      "utf8",
    );
    // A DIFFERENT-origin alias of the same file: raw `===` against the scan
    // path would miss, leaving the file ignored / replayed. Canonicalizing fixes it.
    const alias = join(dir, "alias-link.jsonl");
    symlinkSync(real, alias);

    // A newer, competing fresh file for a DIFFERENT cwd — must NOT be selected.
    const competitor = join(dir, "rollout-other.jsonl");
    writeFileSync(
      competitor,
      `${JSON.stringify({
        type: "user",
        sessionId: "sess-2",
        cwd: "/some/other/proj",
        timestamp: "2026-07-07T12:00:00.000Z",
        message: { role: "user", content: "competitor turn" },
      })}\n`,
      "utf8",
    );

    const chunks: Array<string> = [];
    const out = new Writable({
      write(chunk, _enc, cb): void {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const config: HarnessWrapperConfig = {
      ...resumeConfig(real),
      sessionFile: undefined, // force the scan path (locateSession), not the override
      resumeSessionFile: alias, // the symlink alias, resolved via realpath
      sessionsDir: dir,
    };
    const options = { env: {} } as unknown as TinyPlaceCliOptions;
    const publisher = new SessionEnvelopePublisher(config, options, out);
    const tailer = new HarnessSessionTailer(
      config,
      "/work/proj",
      out,
      publisher,
    );

    // Fixed mtimes (after startedAt) BEFORE start(): start() polls immediately,
    // so selection must be deterministic without relying on the wall clock. The
    // competitor is excluded by cwd, not recency, so real is always chosen.
    const mtime = new Date("2026-07-07T10:30:00.000Z");
    utimesSync(real, mtime, mtime);
    utimesSync(competitor, mtime, mtime);

    tailer.start(new Date("2026-07-07T09:59:00.000Z"));
    // Resumed agent appends a fresh turn to the REAL file (via the pinned cwd).
    appendFileSync(
      real,
      `${JSON.stringify({
        type: "user",
        sessionId: "sess-1",
        timestamp: "2026-07-07T11:00:00.000Z",
        message: { role: "user", content: "fresh turn after resume" },
      })}\n`,
      "utf8",
    );
    await tailer.stop();

    const texts = v1Texts(chunks);
    expect(texts).toEqual(["fresh turn after resume"]);
    expect(texts).not.toContain("competitor turn");
  });
});
