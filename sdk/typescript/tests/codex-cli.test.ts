import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import { runTinyPlaceCli } from "../src/cli.js";
import { parseCodexWrapperArgs } from "../src/cli/codex.js";

import type { ChildProcessWithoutNullStreams } from "node:child_process";

describe("tinyplace codex", () => {
  it("preserves arbitrary codex args while consuming tinyplace wrapper flags", () => {
    const parsed = parseCodexWrapperArgs(
      [
        "--model",
        "gpt-5",
        "--tinyplace-scope",
        "session",
        "--tinyplace-bucket",
        "minute",
        "--",
        "--search",
        "hello",
      ],
      {
        TINYPLACE_CODEX_BIN: "/bin/codex",
        TINYPLACE_CODEX_ENVELOPES: "/tmp/envelopes",
      },
    );

    expect(parsed.codexBin).toBe("/bin/codex");
    expect(parsed.outDir).toBe("/tmp/envelopes");
    expect(parsed.scope).toBe("session");
    expect(parsed.bucket).toBe("minute");
    expect(parsed.codexArgs).toEqual(["--model", "gpt-5", "--search", "hello"]);
  });

  it("proxies terminal streams into envelope files without creating tinyplace context", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "tinyplace-codex-"));
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdoutChunks: Array<string> = [];
    const stderrChunks: Array<string> = [];
    stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk.toString("utf8")));
    stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk.toString("utf8")));

    let spawned: { args: Array<string>; command: string } | undefined;
    const resultPromise = runTinyPlaceCli(
      [
        "codex",
        "--tinyplace-no-pty",
        "--tinyplace-no-session-tail",
        "--tinyplace-out",
        tempDir,
        "--tinyplace-session-id",
        "session-test",
        "--model",
        "gpt-5",
        "prompt",
      ],
      {
        cwd: "/tmp/project",
        env: {
          TINYPLACE_CODEX_BIN: "fake-codex",
        },
        stdin,
        stdout,
        stderr,
        spawn: (command, args) => {
          spawned = { args, command };
          const child = new EventEmitter() as ChildProcessWithoutNullStreams;
          child.stdin = new PassThrough();
          child.stdout = new PassThrough();
          child.stderr = new PassThrough();
          child.pid = 1234;
          queueMicrotask(() => {
            child.stdout.write("codex output\n");
            child.stderr.write("codex warning\n");
            child.emit("exit", 0, null);
          });
          return child;
        },
      },
    );

    stdin.write("hello codex\n");
    const result = await resultPromise;

    expect(result.code).toBe(0);
    expect(spawned).toEqual({
      args: ["--model", "gpt-5", "prompt"],
      command: "fake-codex",
    });
    expect(stdoutChunks.join("")).toContain("codex output");
    expect(stderrChunks.join("")).toContain("codex warning");

    const envelope = await readFile(
      join(tempDir, "folders", "project-f630ad93b344", currentHourFile()),
      "utf8",
    );
    expect(envelope).toContain('"wrapper_session_id":"session-test"');
    expect(envelope).toContain('"stream":"input"');
    expect(envelope).toContain('"stream":"output"');
    expect(envelope).toContain('"stream":"error"');
    expect(envelope).toContain("hello codex");
    expect(envelope).toContain("codex output");
  });

  it("tails Codex session JSONL into semantic message envelopes", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "tinyplace-codex-"));
    const sessionsDir = join(tempDir, "sessions");
    const sessionFile = join(
      sessionsDir,
      "2026",
      "06",
      "30",
      "rollout-2026-06-30T10-00-00-019f1111-2222-7333-8444-555555555555.jsonl",
    );
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();

    const resultPromise = runTinyPlaceCli(
      [
        "codex",
        "--tinyplace-no-pty",
        "--tinyplace-out",
        tempDir,
        "--tinyplace-session-id",
        "session-test",
        "--tinyplace-session-poll-ms",
        "5",
        "--tinyplace-session-tail-grace-ms",
        "20",
        "prompt",
      ],
      {
        cwd: "/tmp/project",
        env: {
          TINYPLACE_CODEX_BIN: "fake-codex",
          TINYPLACE_CODEX_SESSIONS_DIR: sessionsDir,
        },
        stdin,
        stdout,
        stderr,
        spawn: () => {
          const child = new EventEmitter() as ChildProcessWithoutNullStreams;
          child.stdin = new PassThrough();
          child.stdout = new PassThrough();
          child.stderr = new PassThrough();
          child.pid = 1234;
          queueMicrotask(() => {
            mkdirSync(join(sessionsDir, "2026", "06", "30"), { recursive: true });
            writeFileSync(
              sessionFile,
              [
                JSON.stringify({
                  timestamp: "2026-06-30T10:00:00.000Z",
                  type: "session_meta",
                  payload: {
                    cwd: "/tmp/project",
                    id: "019f1111-2222-7333-8444-555555555555",
                  },
                }),
                JSON.stringify({
                  timestamp: "2026-06-30T10:01:00.000Z",
                  type: "response_item",
                  payload: {
                    content: [{ text: "synthetic system material", type: "input_text" }],
                    role: "user",
                    type: "message",
                  },
                }),
                JSON.stringify({
                  timestamp: "2026-06-30T10:02:00.000Z",
                  type: "event_msg",
                  payload: { message: "real user prompt", type: "user_message" },
                }),
                JSON.stringify({
                  timestamp: "2026-06-30T10:03:00.000Z",
                  type: "response_item",
                  payload: {
                    content: [{ text: "assistant answer", type: "output_text" }],
                    phase: "final_answer",
                    role: "assistant",
                    type: "message",
                  },
                }),
              ].join("\n") + "\n",
              "utf8",
            );
            setTimeout(() => {
              child.emit("exit", 0, null);
            }, 20);
          });
          return child;
        },
      },
    );

    const result = await resultPromise;

    expect(result.code).toBe(0);
    const envelope = await readFile(
      join(tempDir, "messages", "folders", "project-f630ad93b344", "2026-06-30T10Z.jsonl"),
      "utf8",
    );
    expect(envelope).toContain('"envelope_version":"tinyplace.codex.session.v1"');
    expect(envelope).toContain('"codex_session_id":"019f1111-2222-7333-8444-555555555555"');
    expect(envelope).toContain('"role":"user"');
    expect(envelope).toContain('"role":"assistant"');
    expect(envelope).toContain("real user prompt");
    expect(envelope).toContain("assistant answer");
    expect(envelope).not.toContain("synthetic system material");
  });
});

function currentHourFile(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}Z.jsonl`;
}
