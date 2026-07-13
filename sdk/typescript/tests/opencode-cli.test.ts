import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it } from "vitest";

import { runTinyPlaceCli } from "../src/cli.js";
import { parseTinyVerseAgentKind } from "../src/cli/tui.js";

describe("tinyplace opencode dispatch", () => {
  it("parses the opencode agent kind and rejects unknown kinds", () => {
    expect(parseTinyVerseAgentKind("opencode")).toBe("opencode");
    expect(parseTinyVerseAgentKind("codex")).toBe("codex");
    expect(() => parseTinyVerseAgentKind("gemini")).toThrow(/opencode/);
  });

  it("defaults bare `opencode` to the tiny.place TUI (static snapshot in a non-TTY)", async () => {
    const result = await runTinyPlaceCli(["opencode"], {
      env: { TINYPLACE_ENDPOINT: "https://relay.test" },
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("welcome to tiny.place");
    // The opencode profile drives the snapshot.
    expect(result.stdout).toContain("opencode: opencode");
  });

  it("wraps `opencode <args>` (non-PTY) with the forwarded args and no SSE bridge", async () => {
    // With an injected spawn (usePty=false) the SSE/attach bridge is skipped —
    // opencode runs as a plain child with the user's args forwarded verbatim.
    let spawned: { args: Array<string>; command: string } | undefined;
    const result = await runTinyPlaceCli(
      [
        "opencode",
        "--tinyplace-no-pty",
        "--tinyplace-no-session-tail",
        "--model",
        "grok",
      ],
      {
        cwd: "/tmp/project",
        env: { TINYPLACE_OPENCODE_BIN: "fake-opencode" },
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        spawn: (command, args) => {
          spawned = { args, command };
          const child = new EventEmitter() as ChildProcessWithoutNullStreams;
          child.stdin = new PassThrough();
          child.stdout = new PassThrough();
          child.stderr = new PassThrough();
          child.pid = 8642;
          queueMicrotask(() => child.emit("exit", 0, null));
          return child;
        },
      },
    );
    expect(result.code).toBe(0);
    // Not `attach <url>` — the SSE bridge only engages under a real TTY.
    expect(spawned).toEqual({
      command: "fake-opencode",
      args: ["--model", "grok"],
    });
  });
});
