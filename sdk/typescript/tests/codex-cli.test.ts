import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import { runTinyPlaceCli } from "../src/cli.js";
import {
  parseAgentArgs,
  parseCodexWrapperArgs,
  wantsAgentMode,
} from "../src/cli/codex.js";
import {
  LocalSigner,
  MemorySessionStore,
  TinyPlaceClient,
  type MessageEnvelope,
  type SignedKey,
} from "../src/index.js";
import { publishKeys, readMessages, sendMessage } from "../src/agent/index.js";
import { publicKeyToSolanaAddress } from "../src/crypto.js";
import { fromBase64 } from "../src/signal/index.js";

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

  it("defaults to the tiny.place TUI (static snapshot in a non-TTY)", async () => {
    const result = await runTinyPlaceCli(["codex"], {
      env: { TINYPLACE_ENDPOINT: "https://relay.test" },
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("welcome to tiny.place");
  });

  it("routes bare `claude` to the TUI too, so it gets the same OpenHuman onboarding as codex", async () => {
    const result = await runTinyPlaceCli(["claude"], {
      env: { TINYPLACE_ENDPOINT: "https://relay.test" },
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("welcome to tiny.place");
    // The claude profile drives the snapshot — not codex.
    expect(result.stdout).toContain("claude: claude");
  });

  it("wraps `claude <args>` (no --raw) instead of dropping them in the TUI", async () => {
    // Regression: bare `claude` opens the TUI, but any args (recipient/model/…)
    // mean the caller wants to wrap a specific session — route to the wrapper
    // and forward them rather than silently ignoring them.
    let spawned: { args: Array<string>; command: string } | undefined;
    const result = await runTinyPlaceCli(
      ["claude", "--tinyplace-no-pty", "--tinyplace-no-session-tail", "--model", "opus"],
      {
        cwd: "/tmp/project",
        env: { TINYPLACE_CLAUDE_BIN: "fake-claude" },
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        spawn: (command, args) => {
          spawned = { args, command };
          const child = new EventEmitter() as ChildProcessWithoutNullStreams;
          child.stdin = new PassThrough();
          child.stdout = new PassThrough();
          child.stderr = new PassThrough();
          child.pid = 4321;
          queueMicrotask(() => child.emit("exit", 0, null));
          return child;
        },
      },
    );
    expect(result.code).toBe(0);
    // The TUI never spawns via the injected `spawn`; the wrapper does — and the
    // model flag survives (only tinyplace-* flags are consumed).
    expect(spawned).toEqual({ command: "fake-claude", args: ["--model", "opus"] });
  });

  it("routes `claude --agent` to the plugin launcher with `--harness claude`", async () => {
    // The core new behavior of the parity dispatch is harness-parameterizing the
    // agent launcher. An injected spawn lets us assert it without a real plugin
    // install (the launcher is workspace-excluded and has no node_modules in CI).
    let spawned: { args: Array<string>; command: string } | undefined;
    const result = await runTinyPlaceCli(["claude", "--agent"], {
      env: { TINYPLACE_ENDPOINT: "https://relay.test" },
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      spawn: (command, args) => {
        spawned = { args, command };
        const child = new EventEmitter() as ChildProcessWithoutNullStreams;
        child.pid = 5555;
        queueMicrotask(() => child.emit("exit", 0, null));
        return child;
      },
    });
    expect(result.code).toBe(0);
    // Launches `node <launcher> --harness claude` — the claude adapter, not codex.
    expect(spawned?.command).toBe("node");
    expect(spawned?.args).toEqual(
      expect.arrayContaining(["--harness", "claude"]),
    );
    const h = spawned?.args.indexOf("--harness") ?? -1;
    expect(spawned?.args[h + 1]).toBe("claude");
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
        // `codex` now defaults to the TUI; --raw selects the transparent wrapper.
        "--raw",
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
        // `codex` now defaults to the TUI; --raw selects the transparent wrapper.
        "--raw",
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
    expect(envelope).toContain('"envelope_version":"tinyplace.harness.session.v1"');
    expect(envelope).toContain('"version":1');
    expect(envelope).toContain('"harness_session_id":"019f1111-2222-7333-8444-555555555555"');
    expect(envelope).toContain('"provider":"codex"');
    expect(envelope).toContain('"role":"user"');
    expect(envelope).toContain('"role":"agent"');
    expect(envelope).toContain("real user prompt");
    expect(envelope).toContain("assistant answer");
    expect(envelope).not.toContain("synthetic system material");
  });

  it("Signal-DMs each semantic Codex SessionEnvelope when a recipient is configured", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "tinyplace-codex-"));
    const sessionsDir = join(tempDir, "sessions");
    const sessionFile = join(
      sessionsDir,
      "2026",
      "06",
      "30",
      "rollout-2026-06-30T10-00-00-019f1111-2222-7333-8444-666666666666.jsonl",
    );
    const relay = makeRelay({ autoAcceptContacts: true });
    const recipient = await makeClient(44, relay);
    await publishKeys(recipient.client, recipient.signer);

    const result = await runTinyPlaceCli(
      [
        "codex",
        // `codex` now defaults to the TUI; --raw selects the transparent wrapper.
        "--raw",
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
          TINYPLACE_CONFIG: join(tempDir, "config.json"),
          TINYPLACE_ENDPOINT: "https://relay.test",
          TINYPLACE_HARNESS_DM_TO: recipient.signer.agentId,
          TINYPLACE_SECRET_KEY: hexSeed(33),
        },
        fetch: relay,
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
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
                    id: "019f1111-2222-7333-8444-666666666666",
                  },
                }),
                JSON.stringify({
                  timestamp: "2026-06-30T10:01:00.000Z",
                  type: "event_msg",
                  payload: { message: "real user prompt", type: "user_message" },
                }),
                JSON.stringify({
                  timestamp: "2026-06-30T10:02:00.000Z",
                  type: "response_item",
                  payload: {
                    content: [{ text: "assistant answer", type: "output_text" }],
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

    expect(result.code).toBe(0);
    expect(relay.contactRequests).toEqual([recipient.signer.agentId]);
    const messages = await readMessages(recipient.client, recipient.signer);
    expect(messages).toHaveLength(2);
    const envelopes = messages.map((message) => JSON.parse(message.text) as Record<string, unknown>);
    expect(envelopes.map((envelope) => (envelope.message as { role: string }).role)).toEqual([
      "user",
      "agent",
    ]);
    expect(envelopes[0]).toMatchObject({
      envelope_version: "tinyplace.harness.session.v1",
      harness: { provider: "codex" },
    });
  });

  it("requests contact approval and withholds DMs while the relationship is pending", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "tinyplace-codex-"));
    const sessionsDir = join(tempDir, "sessions");
    const sessionFile = join(
      sessionsDir,
      "2026",
      "06",
      "30",
      "rollout-2026-06-30T10-00-00-019f1111-2222-7333-8444-777777777777.jsonl",
    );
    const relay = makeRelay();
    const recipient = await makeClient(44, relay);
    await publishKeys(recipient.client, recipient.signer);
    const stderr = new PassThrough();
    const stderrChunks: Array<string> = [];
    stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk.toString("utf8")));

    const result = await runTinyPlaceCli(
      [
        "codex",
        // `codex` now defaults to the TUI; --raw selects the transparent wrapper.
        "--raw",
        "--tinyplace-no-pty",
        // Outbound-only test: keep the inbound receiver off so it doesn't also
        // request the (pending) contact and skew relay.contactRequests.
        "--tinyplace-no-receive",
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
          TINYPLACE_CONFIG: join(tempDir, "config.json"),
          TINYPLACE_ENDPOINT: "https://relay.test",
          TINYPLACE_HARNESS_DM_TO: recipient.signer.agentId,
          TINYPLACE_SECRET_KEY: hexSeed(33),
        },
        fetch: relay,
        stdin: new PassThrough(),
        stdout: new PassThrough(),
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
                    id: "019f1111-2222-7333-8444-777777777777",
                  },
                }),
                JSON.stringify({
                  timestamp: "2026-06-30T10:01:00.000Z",
                  type: "event_msg",
                  payload: { message: "real user prompt", type: "user_message" },
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

    expect(result.code).toBe(1);
    expect(relay.contactRequests).toEqual([recipient.signer.agentId]);
    expect(stderrChunks.join("")).toContain("contact request pending");
    await expect(readMessages(recipient.client, recipient.signer)).resolves.toHaveLength(0);
  });

  describe("agent mode routing (--agent)", () => {
    it("selects agent mode only for a leading --agent, not one after --", () => {
      expect(wantsAgentMode(["--agent"])).toBe(true);
      expect(wantsAgentMode(["--wallet", "alice", "--agent", "--", "-m", "gpt-5.4"])).toBe(true);
      expect(wantsAgentMode(["--model", "gpt-5"])).toBe(false);
      // `--agent` after the `--` belongs to the forwarded codex args, not us.
      expect(wantsAgentMode(["--", "--agent"])).toBe(false);
      expect(wantsAgentMode([])).toBe(false);
    });

    it("strips our flags and forwards the rest to the launcher", () => {
      const parsed = parseAgentArgs([
        "--agent",
        "--wallet",
        "alice",
        "--autorespond",
        "--profile",
        "work",
        "--",
        "-m",
        "gpt-5.4",
      ]);
      expect(parsed.wallet).toBe("alice");
      expect(parsed.autorespond).toBe(true);
      expect(parsed.passthrough).toEqual(["--profile", "work"]);
      expect(parsed.forwarded).toEqual(["-m", "gpt-5.4"]);
    });

    it("accepts --wallet=<value> and defaults autorespond off", () => {
      const parsed = parseAgentArgs(["--agent", "--wallet=bob"]);
      expect(parsed.wallet).toBe("bob");
      expect(parsed.autorespond).toBe(false);
      expect(parsed.passthrough).toEqual([]);
      expect(parsed.forwarded).toEqual([]);
    });
  });

  describe("inbound receive → inject into codex", () => {
    // The wrapper identity is derived from TINYPLACE_SECRET_KEY=hexSeed(33), so
    // its address is deterministic and the owner can DM it.
    async function runWrapperReceiving(opts: {
      relay: HarnessRelay;
      ownerAgentId: string;
      send: (wrapperAddress: string) => Promise<void>;
    }): Promise<{
      code: number;
      stdin: string;
      stdinChunks: Array<string>;
      wrapperAddress: string;
    }> {
      const tempDir = await mkdtemp(join(tmpdir(), "tinyplace-inbound-"));
      const wrapperSigner = await LocalSigner.fromSeed(new Uint8Array(32).fill(33));
      const stdinChunks: Array<string> = [];
      const result = await runTinyPlaceCli(
        [
          "codex",
          "--raw",
          "--tinyplace-no-pty",
          "--tinyplace-no-session-tail",
          "--tinyplace-out",
          tempDir,
          "--tinyplace-receive-poll-ms",
          "5",
          "prompt",
        ],
        {
          cwd: "/tmp/project",
          env: {
            TINYPLACE_CODEX_BIN: "fake-codex",
            TINYPLACE_CONFIG: join(tempDir, "config.json"),
            TINYPLACE_ENDPOINT: "https://relay.test",
            TINYPLACE_HARNESS_DM_TO: opts.ownerAgentId,
            TINYPLACE_SECRET_KEY: hexSeed(33),
          },
          fetch: opts.relay,
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          spawn: () => {
            const child = new EventEmitter() as ChildProcessWithoutNullStreams;
            child.stdin = new PassThrough();
            child.stdout = new PassThrough();
            child.stderr = new PassThrough();
            child.pid = 1234;
            child.stdin.on("data", (chunk: Buffer) => stdinChunks.push(chunk.toString("utf8")));
            // Keys are published + owner contact accepted BEFORE spawn (in
            // receiver.start), so the owner can DM the wrapper immediately here.
            queueMicrotask(() => {
              void (async () => {
                await opts.send(wrapperSigner.agentId);
                setTimeout(() => child.emit("exit", 0, null), 80);
              })();
            });
            return child;
          },
        },
      );
      return {
        code: result.code,
        stdin: stdinChunks.join(""),
        stdinChunks,
        wrapperAddress: wrapperSigner.agentId,
      };
    }

    it("publishes its Signal keys so the owner can DM it (was un-messageable before)", async () => {
      const relay = makeRelay({ autoAcceptContacts: true });
      const owner = await makeClient(44, relay);
      await publishKeys(owner.client, owner.signer);
      const { code, wrapperAddress } = await runWrapperReceiving({
        relay,
        ownerAgentId: owner.signer.agentId,
        send: async () => {
          // no DM — this test only asserts key publication
        },
      });
      expect(code).toBe(0);
      expect(relay.keysPublished).toContain(wrapperAddress);
    });

    it("injects an owner DM as the body then a DISTINCT carriage return", async () => {
      const relay = makeRelay({ autoAcceptContacts: true });
      const owner = await makeClient(44, relay);
      await publishKeys(owner.client, owner.signer);
      const { code, stdin, stdinChunks } = await runWrapperReceiving({
        relay,
        ownerAgentId: owner.signer.agentId,
        send: async (wrapperAddress) => {
          await sendMessage(owner.client, owner.signer, wrapperAddress, "hello from openhuman");
        },
      });
      expect(code).toBe(0);
      // The body and the submitting CR must be SEPARATE writes: writing
      // "text\r" in one chunk makes the agent TUI swallow the CR as a paste and
      // park the prompt unsubmitted.
      expect(stdinChunks).toContain("hello from openhuman");
      expect(stdinChunks).toContain("\r");
      // The body is not written with a trailing CR fused onto it.
      expect(stdinChunks).not.toContain("hello from openhuman\r");
      // The CR still lands after the body so the joined stream submits.
      expect(stdin).toContain("hello from openhuman\r");
    });

    it("drops auto-flagged envelopes but injects normal ones (loop-guard)", async () => {
      const relay = makeRelay({ autoAcceptContacts: true });
      const owner = await makeClient(44, relay);
      await publishKeys(owner.client, owner.signer);
      const autoEnvelope = JSON.stringify({
        envelope_version: "tinyplace.harness.session.v1",
        tp: { auto: true },
        message: { text: "AUTO_SHOULD_NOT_INJECT" },
      });
      const humanEnvelope = JSON.stringify({
        envelope_version: "tinyplace.harness.session.v1",
        message: { text: "HUMAN_SHOULD_INJECT" },
      });
      const { code, stdin } = await runWrapperReceiving({
        relay,
        ownerAgentId: owner.signer.agentId,
        send: async (wrapperAddress) => {
          await sendMessage(owner.client, owner.signer, wrapperAddress, autoEnvelope);
          await sendMessage(owner.client, owner.signer, wrapperAddress, humanEnvelope);
        },
      });
      expect(code).toBe(0);
      expect(stdin).toContain("HUMAN_SHOULD_INJECT\r");
      expect(stdin).not.toContain("AUTO_SHOULD_NOT_INJECT");
    });
  });

  it("mirrors the wrapper for Claude Code session JSONL", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "tinyplace-claude-"));
    const sessionsDir = join(tempDir, "claude-projects");
    const sessionFile = join(sessionsDir, "-tmp-project", "b74208bd-179a-4e16-a533.jsonl");
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();

    const resultPromise = runTinyPlaceCli(
      [
        "claude",
        "--raw",
        "--tinyplace-no-pty",
        "--tinyplace-out",
        tempDir,
        "--tinyplace-session-id",
        "claude-wrapper",
        "--tinyplace-session-poll-ms",
        "5",
        "--tinyplace-session-tail-grace-ms",
        "20",
        "--model",
        "opus",
      ],
      {
        cwd: "/tmp/project",
        env: {
          TINYPLACE_CLAUDE_BIN: "fake-claude",
          TINYPLACE_CLAUDE_SESSIONS_DIR: sessionsDir,
        },
        stdin,
        stdout,
        stderr,
        spawn: (command, args) => {
          expect(command).toBe("fake-claude");
          expect(args).toEqual(["--model", "opus"]);
          const child = new EventEmitter() as ChildProcessWithoutNullStreams;
          child.stdin = new PassThrough();
          child.stdout = new PassThrough();
          child.stderr = new PassThrough();
          child.pid = 1234;
          queueMicrotask(() => {
            mkdirSync(join(sessionsDir, "-tmp-project"), { recursive: true });
            writeFileSync(
              sessionFile,
              [
                JSON.stringify({
                  type: "user",
                  message: { role: "user", content: "please inspect this" },
                  uuid: "u1",
                  timestamp: "2026-06-30T10:01:00.000Z",
                  cwd: "/tmp/project",
                  sessionId: "b74208bd-179a-4e16-a533",
                }),
                JSON.stringify({
                  type: "user",
                  message: {
                    role: "user",
                    content: [{ type: "tool_result", content: "not a semantic user prompt" }],
                  },
                  uuid: "tool-result",
                  timestamp: "2026-06-30T10:01:30.000Z",
                  cwd: "/tmp/project",
                  sessionId: "b74208bd-179a-4e16-a533",
                }),
                JSON.stringify({
                  type: "assistant",
                  message: {
                    role: "assistant",
                    content: [
                      { type: "thinking", thinking: "hidden" },
                      { type: "text", text: "I inspected it." },
                      { type: "tool_use", name: "Bash", input: {} },
                    ],
                  },
                  uuid: "a1",
                  timestamp: "2026-06-30T10:02:00.000Z",
                  cwd: "/tmp/project",
                  sessionId: "b74208bd-179a-4e16-a533",
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
    expect(envelope).toContain('"provider":"claude"');
    expect(envelope).toContain('"harness_session_id":"b74208bd-179a-4e16-a533"');
    expect(envelope).toContain('"role":"user"');
    expect(envelope).toContain('"role":"agent"');
    expect(envelope).toContain("please inspect this");
    expect(envelope).toContain("I inspected it.");
    expect(envelope).not.toContain("not a semantic user prompt");
    expect(envelope).not.toContain("hidden");
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

function hexSeed(value: number): string {
  return Array.from(new Uint8Array(32).fill(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function makeClient(
  seed: number,
  fetch: typeof globalThis.fetch,
): Promise<{ client: TinyPlaceClient; signer: LocalSigner }> {
  const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(seed));
  const store = new MemorySessionStore(await signer.getX25519KeyPair());
  const client = new TinyPlaceClient({
    baseUrl: "https://relay.test",
    signer,
    encryption: { store },
    fetch,
  });
  return { client, signer };
}

interface HarnessRelay {
  (
    input: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1],
  ): Promise<Response>;
  contactRequests: Array<string>;
  keysPublished: Array<string>;
}

function makeRelay(options: { autoAcceptContacts?: boolean } = {}): HarnessRelay {
  const inbox = new Map<string, Array<MessageEnvelope>>();
  const signedPreKeys = new Map<string, SignedKey>();
  const preKeys = new Map<string, Array<SignedKey>>();
  const contacts = new Map<string, "pending" | "accepted" | "blocked">();

  const relay = (async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === "/messages" && method === "PUT") {
      const envelope = (await request.json()) as MessageEnvelope;
      if (
        envelope.from !== envelope.to &&
        contacts.get(contactKey(envelope.from, envelope.to)) !== "accepted"
      ) {
        return Response.json({ error: "not_a_contact" }, { status: 403 });
      }
      inbox.set(envelope.to, [...(inbox.get(envelope.to) ?? []), envelope]);
      return Response.json(envelope, { status: 202 });
    }
    if (path === "/messages" && method === "GET") {
      const agentId = url.searchParams.get("agentId") ?? "";
      return Response.json({ messages: inbox.get(agentId) ?? [] });
    }
    if (path.startsWith("/messages/") && method === "DELETE") {
      const id = decodeURIComponent(path.slice("/messages/".length));
      const agentId = url.searchParams.get("agentId") ?? "";
      inbox.set(
        agentId,
        (inbox.get(agentId) ?? []).filter((envelope) => envelope.id !== id),
      );
      return new Response(null, { status: 204 });
    }
    const contactStatusMatch = path.match(/^\/contacts\/([^/]+)\/status$/);
    if (contactStatusMatch && method === "GET") {
      const agentId = decodeURIComponent(contactStatusMatch[1]!);
      return Response.json({
        agentId,
        status: contacts.get(contactKey(actorId(request), agentId)) ?? "none",
      });
    }
    const contactRequestMatch = path.match(/^\/contacts\/([^/]+)$/);
    if (contactRequestMatch && method === "POST") {
      const agentId = decodeURIComponent(contactRequestMatch[1]!);
      const requester = actorId(request);
      const status = options.autoAcceptContacts ? "accepted" : "pending";
      const now = "2026-06-16T00:00:00.000Z";
      // contacts.request is idempotent server-side; model that (the wrapper may
      // request the same owner from both the outbound publisher and the inbound
      // receiver).
      if (!relay.contactRequests.includes(agentId)) {
        relay.contactRequests.push(agentId);
      }
      contacts.set(contactKey(requester, agentId), status);
      return Response.json({
        requester,
        addressee: agentId,
        status,
        createdAt: now,
        updatedAt: now,
      });
    }
    const signedMatch = path.match(/^\/keys\/([^/]+)\/signed-prekey$/);
    if (signedMatch && method === "PUT") {
      const id = decodeURIComponent(signedMatch[1]!);
      const body = (await request.json()) as { signedPreKey: SignedKey };
      signedPreKeys.set(id, body.signedPreKey);
      relay.keysPublished.push(id);
      return new Response(null, { status: 204 });
    }
    const preKeysMatch = path.match(/^\/keys\/([^/]+)\/prekeys$/);
    if (preKeysMatch && method === "PUT") {
      const id = decodeURIComponent(preKeysMatch[1]!);
      const body = (await request.json()) as { preKeys: Array<SignedKey> };
      preKeys.set(id, [...(preKeys.get(id) ?? []), ...body.preKeys]);
      return new Response(null, { status: 204 });
    }
    const bundleMatch = path.match(/^\/keys\/([^/]+)\/bundle$/);
    if (bundleMatch && method === "GET") {
      const id = decodeURIComponent(bundleMatch[1]!);
      const signedPreKey = signedPreKeys.get(id);
      const oneTimePreKey = preKeys.get(id)?.shift();
      if (!signedPreKey) {
        return Response.json({ error: "no bundle" }, { status: 404 });
      }
      return Response.json({
        agentId: id,
        identityKey: id,
        signedPreKey,
        ...(oneTimePreKey ? { oneTimePreKey } : {}),
        updatedAt: "2026-06-16T00:00:00.000Z",
      });
    }
    return Response.json({ error: `unhandled ${method} ${path}` }, { status: 500 });
  }) as HarnessRelay;
  relay.contactRequests = [];
  relay.keysPublished = [];
  return relay;
}

function actorId(request: Request): string {
  // The backend canonicalizes the authenticated actor to its base58 cryptoId; the
  // auth headers carry the base64 public key, so derive the cryptoId to match the
  // base58 `from`/`to` the SDK now routes with. Falls back to the raw header value.
  const raw =
    request.headers.get("X-TinyPlace-Public-Key") ??
    request.headers.get("X-Agent-ID") ??
    "";
  try {
    return publicKeyToSolanaAddress(fromBase64(raw));
  } catch {
    return raw;
  }
}

function contactKey(a: string, b: string): string {
  return [a, b].sort().join("\0");
}
