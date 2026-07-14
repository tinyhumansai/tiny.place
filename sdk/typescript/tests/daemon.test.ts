import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import {
  decodeTaskFrame,
  encodeTaskFrame,
  TINYPLACE_PROTO,
} from "../src/cli/daemon/protocol.js";
import {
  buildRunArgs,
  detectProviders,
  isTransientLock,
  makePathLookup,
  providerBin,
  runProviderTask,
  withAuthHint,
  type SpawnFn,
} from "../src/cli/daemon/providers.js";
import {
  createContactAutoAccepter,
  createLock,
  createMailbox,
} from "../src/cli/daemon/mailbox.js";
import {
  DaemonRuntime,
  statusDetail,
  type RunTaskFn,
} from "../src/cli/daemon/runtime.js";
import { opencodeEventsFromLine } from "../src/cli/harness-events.js";
import type { TaskFrame } from "../src/cli/daemon/protocol.js";

// ── protocol ─────────────────────────────────────────────────────────────────

describe("medulla-tinyplace/1 protocol", () => {
  it("round-trips a frame with correlationId + harness", () => {
    const body = encodeTaskFrame({
      kind: "reply",
      taskId: "t1",
      text: "done",
      correlationId: "cyc/t1/nonce",
      harness: "claude",
    });
    const frame = decodeTaskFrame(body);
    expect(frame).toMatchObject({
      proto: TINYPLACE_PROTO,
      kind: "reply",
      taskId: "t1",
      text: "done",
      correlationId: "cyc/t1/nonce",
      harness: "claude",
    });
  });

  it("parses an inbound task frame with a provider hint", () => {
    const frame = decodeTaskFrame(
      JSON.stringify({
        proto: TINYPLACE_PROTO,
        kind: "task",
        taskId: "t9",
        text: "do the thing",
        provider: "opencode",
        ts: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(frame?.kind).toBe("task");
    expect(frame?.provider).toBe("opencode");
  });

  it("omits correlationId when absent", () => {
    const frame = decodeTaskFrame(
      encodeTaskFrame({ kind: "ack", taskId: "t2", text: "ok" }),
    );
    expect(frame?.correlationId).toBeUndefined();
  });

  it("returns undefined for non-protocol or malformed bodies", () => {
    expect(decodeTaskFrame("just a chat message")).toBeUndefined();
    expect(decodeTaskFrame(JSON.stringify({ proto: "other/1" }))).toBeUndefined();
    expect(
      decodeTaskFrame(JSON.stringify({ proto: TINYPLACE_PROTO, kind: "nope", taskId: "x", text: "y" })),
    ).toBeUndefined();
  });

  it("drops an unknown provider/harness value", () => {
    const frame = decodeTaskFrame(
      JSON.stringify({
        proto: TINYPLACE_PROTO,
        kind: "task",
        taskId: "t",
        text: "x",
        provider: "gemini",
      }),
    );
    expect(frame?.provider).toBeUndefined();
  });
});

// ── provider detection ───────────────────────────────────────────────────────

describe("provider detection", () => {
  it("detects only providers whose binary is on PATH", () => {
    const found = detectProviders({
      env: {},
      existsOnPath: (bin) => bin === "claude" || bin === "opencode",
    });
    expect(found).toEqual(["claude", "opencode"]);
  });

  it("honors the --providers allow-list and env bin overrides", () => {
    const found = detectProviders({
      env: { TINYPLACE_OPENCODE_BIN: "/opt/oc" },
      only: ["opencode"],
      existsOnPath: (bin) => bin === "/opt/oc",
    });
    expect(found).toEqual(["opencode"]);
    expect(providerBin("opencode", { TINYPLACE_OPENCODE_BIN: "/opt/oc" })).toBe(
      "/opt/oc",
    );
    expect(providerBin("claude", {})).toBe("claude");
  });

  it("builds provider-specific headless argv", () => {
    // Default: claude runs with its normal permission prompts (no bypass).
    expect(buildRunArgs({ provider: "claude", prompt: "hi" })).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "hi",
    ]);
    // Opt-in bypass only when explicitly requested.
    expect(buildRunArgs({ provider: "claude", prompt: "hi", skipPermissions: true })).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
      "hi",
    ]);
    expect(buildRunArgs({ provider: "codex", prompt: "hi", model: "gpt-5" })).toEqual([
      "exec",
      "--json",
      "-m",
      "gpt-5",
      "hi",
    ]);
    expect(
      buildRunArgs({ provider: "opencode", prompt: "hi", model: "m", agent: "build" }),
    ).toEqual(["run", "-m", "m", "--agent", "build", "--format", "json", "hi"]);
  });
});

// ── opencode event parsing ───────────────────────────────────────────────────

describe("opencodeEventsFromLine", () => {
  it("maps assistant text to agent_message", () => {
    const [event] = opencodeEventsFromLine(
      JSON.stringify({ type: "text", part: { type: "text", text: "the answer" } }),
      0,
    );
    expect(event?.event).toMatchObject({
      kind: "agent_message",
      payload: { text: "the answer" },
    });
  });

  it("maps a pending tool part to tool_call and a completed one to tool_result", () => {
    const call = opencodeEventsFromLine(
      JSON.stringify({
        type: "tool",
        part: { tool: "bash", callID: "c1", state: { status: "running", input: { command: "ls" } } },
      }),
      0,
    );
    expect(call[0]?.event.kind).toBe("tool_call");
    if (call[0]?.event.kind === "tool_call") {
      expect(call[0].event.payload.tool_name).toBe("bash");
      expect(call[0].event.payload.tool_kind).toBe("shell");
    }

    const result = opencodeEventsFromLine(
      JSON.stringify({
        type: "tool",
        part: { tool: "bash", callID: "c1", state: { status: "completed", output: "file.txt" } },
      }),
      1,
    );
    expect(result[0]?.event.kind).toBe("tool_result");
    if (result[0]?.event.kind === "tool_result") {
      expect(result[0].event.payload.output).toContain("file.txt");
      expect(result[0].event.payload.is_error).toBe(false);
    }
  });

  it("maps an error event with a readable message", () => {
    const [event] = opencodeEventsFromLine(
      JSON.stringify({ type: "error", error: { name: "AuthError", data: { message: "no key", ref: "e1" } } }),
      0,
    );
    expect(event?.event.kind).toBe("error");
    if (event?.event.kind === "error") {
      expect(event.event.payload.message).toBe("AuthError: no key (e1)");
    }
  });
});

// ── headless task runner ─────────────────────────────────────────────────────

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { writable: boolean; write: (t: string) => void };
  kill: (signal?: string) => void;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { writable: true, write: vi.fn() };
  child.kill = vi.fn();
  return child;
}

describe("runProviderTask", () => {
  it("captures the claude stream-json result as the reply", async () => {
    const child = fakeChild();
    const spawn: SpawnFn = () => child as never;
    const promise = runProviderTask({
      provider: "claude",
      prompt: "2+2?",
      cwd: "/tmp",
      env: {},
      timeoutMs: 5_000,
      spawn,
    });
    child.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "4" }] } }) +
          "\n" +
          JSON.stringify({ type: "result", subtype: "success", result: "The answer is 4." }) +
          "\n",
      ),
    );
    child.emit("close", 0);
    const result = await promise;
    expect(result.reply).toBe("The answer is 4.");
    expect(result.events).toBeGreaterThan(0);
  });

  it("rejects on a non-zero exit with stderr context", async () => {
    const child = fakeChild();
    const spawn: SpawnFn = () => child as never;
    const promise = runProviderTask({
      provider: "opencode",
      prompt: "x",
      cwd: "/tmp",
      env: {},
      timeoutMs: 5_000,
      spawn,
    });
    child.stderr.emit("data", Buffer.from("boom"));
    child.emit("close", 2);
    await expect(promise).rejects.toThrow(/opencode exited 2.*boom/);
  });
});

// ── daemon runtime task protocol ─────────────────────────────────────────────

interface Sent {
  to: string;
  frame: TaskFrame | undefined;
  raw: string;
}

function collector(): { sent: Array<Sent>; send: (to: string, body: string) => Promise<void> } {
  const sent: Array<Sent> = [];
  return {
    sent,
    send: async (to, body) => {
      sent.push({ to, frame: decodeTaskFrame(body), raw: body });
    },
  };
}

const baseDeps = {
  providers: ["claude"] as const,
  defaultProvider: "claude" as const,
  workspace: "/w",
  env: {},
  taskTimeoutMs: 1_000,
  concurrency: 2,
  now: () => 0,
};

describe("DaemonRuntime task protocol", () => {
  it("acks, streams status, and replies — echoing taskId + correlationId + harness", async () => {
    const { sent, send } = collector();
    let statusCount = 0;
    const runTask: RunTaskFn = async (options) => {
      options.onEvent?.({
        line: 0,
        timestamp: new Date(),
        recordType: "assistant:tool_use",
        event: {
          kind: "tool_call",
          role: "agent",
          payload: { call_id: "c", tool_name: "Bash", tool_kind: "shell", display: "ls", input: {} },
        },
      });
      statusCount += 1;
      return { provider: options.provider, reply: "final output", events: 3 };
    };
    const runtime = new DaemonRuntime({ ...baseDeps, send, runTask, statusThrottleMs: 0 });
    runtime.handleMessage(
      "peerA",
      { text: "" },
      {
        proto: TINYPLACE_PROTO,
        kind: "task",
        taskId: "t1",
        text: "run ls",
        correlationId: "cyc-1/t1/n",
        ts: "now",
      },
    );
    await vi.waitFor(() => expect(sent.some((s) => s.frame?.kind === "reply")).toBe(true));

    const ack = sent.find((s) => s.frame?.kind === "ack");
    const status = sent.find((s) => s.frame?.kind === "status");
    const reply = sent.find((s) => s.frame?.kind === "reply");
    for (const s of [ack, status, reply]) {
      expect(s?.frame?.taskId).toBe("t1");
      expect(s?.frame?.correlationId).toBe("cyc-1/t1/n");
      expect(s?.frame?.harness).toBe("claude");
    }
    expect(reply?.frame?.text).toBe("final output");
    expect(statusCount).toBe(1);
  });

  it("errors when the requested provider is unavailable", async () => {
    const { sent, send } = collector();
    const runtime = new DaemonRuntime({
      ...baseDeps,
      send,
      runTask: async () => ({ provider: "claude", reply: "x", events: 0 }),
    });
    runtime.handleMessage(
      "peerB",
      { text: "" },
      { proto: TINYPLACE_PROTO, kind: "task", taskId: "t2", text: "hi", provider: "codex", ts: "now" },
    );
    await vi.waitFor(() => expect(sent.some((s) => s.frame?.kind === "error")).toBe(true));
    const error = sent.find((s) => s.frame?.kind === "error");
    expect(error?.frame?.text).toMatch(/codex/);
  });

  it("emits an error frame when the run throws", async () => {
    const { sent, send } = collector();
    const runtime = new DaemonRuntime({
      ...baseDeps,
      send,
      runTask: async () => {
        throw new Error("provider crashed");
      },
    });
    runtime.handleMessage(
      "peerC",
      { text: "" },
      { proto: TINYPLACE_PROTO, kind: "task", taskId: "t3", text: "hi", ts: "now" },
    );
    await vi.waitFor(() => expect(sent.some((s) => s.frame?.kind === "error")).toBe(true));
    expect(sent.find((s) => s.frame?.kind === "error")?.frame?.text).toBe("provider crashed");
  });

  it("answers a plain-text DM with a plain-text reply (no frame)", async () => {
    const { sent, send } = collector();
    const runtime = new DaemonRuntime({
      ...baseDeps,
      send,
      runTask: async () => ({ provider: "claude", reply: "hello there", events: 1 }),
    });
    runtime.handleMessage("peerD", { text: "hi daemon" }, undefined);
    await vi.waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0]?.frame).toBeUndefined();
    expect(sent[0]?.raw).toBe("hello there");
  });

  it("forwards an input frame into the running session and acks it", async () => {
    const { sent, send } = collector();
    const writes: Array<string> = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => (release = r));
    const runTask: RunTaskFn = async (options) => {
      options.onStdin?.((text) => writes.push(text));
      await gate;
      return { provider: options.provider, reply: "done", events: 0 };
    };
    const runtime = new DaemonRuntime({ ...baseDeps, send, runTask });
    runtime.handleMessage(
      "peerE",
      { text: "" },
      { proto: TINYPLACE_PROTO, kind: "task", taskId: "t4", text: "start", ts: "now" },
    );
    await vi.waitFor(() => expect(sent.some((s) => s.frame?.kind === "ack")).toBe(true));
    runtime.handleMessage(
      "peerE",
      { text: "" },
      { proto: TINYPLACE_PROTO, kind: "input", taskId: "t4", text: "more context", ts: "now" },
    );
    await vi.waitFor(() => expect(writes).toContain("more context"));
    release?.();
    await vi.waitFor(() => expect(sent.some((s) => s.frame?.kind === "reply")).toBe(true));
  });
});

describe("DaemonRuntime isolation & limits", () => {
  it("does not let another sender inject input into a running task", async () => {
    const { sent, send } = collector();
    const writes: Array<string> = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => (release = r));
    const runTask: RunTaskFn = async (options) => {
      options.onStdin?.((text) => writes.push(text));
      await gate;
      return { provider: options.provider, reply: "done", events: 0 };
    };
    const runtime = new DaemonRuntime({ ...baseDeps, send, runTask });
    runtime.handleMessage(
      "owner",
      { text: "" },
      { proto: TINYPLACE_PROTO, kind: "task", taskId: "shared", text: "go", ts: "now" },
    );
    await vi.waitFor(() => expect(sent.some((s) => s.frame?.kind === "ack")).toBe(true));
    // A different accepted contact reuses the same taskId — must not reach stdin.
    runtime.handleMessage(
      "intruder",
      { text: "" },
      { proto: TINYPLACE_PROTO, kind: "input", taskId: "shared", text: "evil", ts: "now" },
    );
    await vi.waitFor(() =>
      expect(
        sent.some((s) => s.to === "intruder" && s.frame?.kind === "ack"),
      ).toBe(true),
    );
    expect(writes).toEqual([]);
    expect(
      sent.find((s) => s.to === "intruder" && s.frame?.kind === "ack")?.frame?.text,
    ).toMatch(/no matching/);
    release?.();
    await runtime.idle();
    expect(writes).toEqual([]);
  });

  it("ignores an input whose correlationId does not match the running task", async () => {
    const { sent, send } = collector();
    const writes: Array<string> = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => (release = r));
    const runTask: RunTaskFn = async (options) => {
      options.onStdin?.((text) => writes.push(text));
      await gate;
      return { provider: options.provider, reply: "done", events: 0 };
    };
    const runtime = new DaemonRuntime({ ...baseDeps, send, runTask });
    runtime.handleMessage(
      "owner",
      { text: "" },
      { proto: TINYPLACE_PROTO, kind: "task", taskId: "t", correlationId: "c-1", text: "go", ts: "now" },
    );
    await vi.waitFor(() => expect(sent.some((s) => s.frame?.kind === "ack")).toBe(true));
    runtime.handleMessage(
      "owner",
      { text: "" },
      { proto: TINYPLACE_PROTO, kind: "input", taskId: "t", correlationId: "c-2", text: "stale", ts: "now" },
    );
    await vi.waitFor(() =>
      expect(sent.filter((s) => s.frame?.kind === "ack").length).toBe(2),
    );
    expect(writes).toEqual([]);
    release?.();
    await runtime.idle();
  });

  it("rejects a duplicate active taskId from the same sender", async () => {
    const { sent, send } = collector();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => (release = r));
    const runtime = new DaemonRuntime({
      ...baseDeps,
      send,
      runTask: async (options) => {
        await gate;
        return { provider: options.provider, reply: "first", events: 0 };
      },
    });
    const task: TaskFrame = { proto: TINYPLACE_PROTO, kind: "task", taskId: "dup", text: "go", ts: "now" };
    runtime.handleMessage("owner", { text: "" }, task);
    await vi.waitFor(() => expect(sent.some((s) => s.frame?.kind === "ack")).toBe(true));
    runtime.handleMessage("owner", { text: "" }, task);
    await vi.waitFor(() => expect(sent.some((s) => s.frame?.kind === "error")).toBe(true));
    expect(sent.find((s) => s.frame?.kind === "error")?.frame?.text).toMatch(/already running/);
    release?.();
    await runtime.idle();
    // The original task still completes normally.
    expect(sent.find((s) => s.frame?.kind === "reply")?.frame?.text).toBe("first");
  });

  it("rejects new tasks beyond maxPending with an error frame", async () => {
    const { sent, send } = collector();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => (release = r));
    const runtime = new DaemonRuntime({
      ...baseDeps,
      maxPending: 1,
      send,
      runTask: async (options) => {
        await gate;
        return { provider: options.provider, reply: "ok", events: 0 };
      },
    });
    runtime.handleMessage(
      "owner",
      { text: "" },
      { proto: TINYPLACE_PROTO, kind: "task", taskId: "a", text: "go", ts: "now" },
    );
    await vi.waitFor(() => expect(sent.some((s) => s.frame?.kind === "ack")).toBe(true));
    runtime.handleMessage(
      "owner",
      { text: "" },
      { proto: TINYPLACE_PROTO, kind: "task", taskId: "b", text: "go", ts: "now" },
    );
    await vi.waitFor(() => expect(sent.some((s) => s.frame?.kind === "error")).toBe(true));
    expect(sent.find((s) => s.frame?.kind === "error")?.frame?.text).toMatch(/capacity/);
    release?.();
    await runtime.idle();
  });

  it("shutdown aborts plain-text runs too, and idle() drains dispatches", async () => {
    const { sent, send } = collector();
    let sawAbort = false;
    const runTask: RunTaskFn = (options) =>
      new Promise((_, reject) => {
        options.signal?.addEventListener("abort", () => {
          sawAbort = true;
          reject(new Error("aborted"));
        });
      });
    const runtime = new DaemonRuntime({ ...baseDeps, send, runTask });
    runtime.handleMessage("owner", { text: "plain prompt" }, undefined);
    await vi.waitFor(() => expect(runtime.activeCount()).toBe(1));
    runtime.shutdown();
    await runtime.idle();
    expect(sawAbort).toBe(true);
    expect(sent[0]?.raw).toMatch(/Task failed: aborted/);
  });
});

describe("provider runner hardening", () => {
  it("never spawns when the signal is already aborted", async () => {
    const spawn = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(
      runProviderTask({
        provider: "claude",
        prompt: "x",
        cwd: "/tmp",
        env: {},
        timeoutMs: 1_000,
        signal: controller.signal,
        spawn: spawn as unknown as SpawnFn,
      }),
    ).rejects.toThrow(/aborted before start/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects an aborted child instead of settling its partial output", async () => {
    const child = fakeChild();
    const controller = new AbortController();
    const promise = runProviderTask({
      provider: "claude",
      prompt: "x",
      cwd: "/tmp",
      env: {},
      timeoutMs: 5_000,
      signal: controller.signal,
      spawn: (() => child) as unknown as SpawnFn,
    });
    child.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ type: "result", result: "partial" }) + "\n"),
    );
    controller.abort();
    child.emit("close", null);
    await expect(promise).rejects.toThrow(/task aborted/);
  });

  it("retries a transient opencode SQLite lock and then succeeds", async () => {
    let attempts = 0;
    const spawn: SpawnFn = () => {
      attempts += 1;
      const child = fakeChild();
      queueMicrotask(() => {
        if (attempts === 1) {
          child.stderr.emit("data", Buffer.from("database is locked"));
          child.emit("close", 1);
        } else {
          child.stdout.emit(
            "data",
            Buffer.from(JSON.stringify({ type: "text", part: { type: "text", text: "recovered" } }) + "\n"),
          );
          child.emit("close", 0);
        }
      });
      return child as never;
    };
    const result = await runProviderTask({
      provider: "opencode",
      prompt: "x",
      cwd: "/tmp",
      env: {},
      timeoutMs: 5_000,
      spawn,
    });
    expect(attempts).toBe(2);
    expect(result.reply).toBe("recovered");
  });

  it("neutralizes a prompt that begins with a dash", () => {
    const args = buildRunArgs({ provider: "claude", prompt: "--version" });
    expect(args[args.length - 1]).toBe(" --version");
    expect(args.some((a) => a === "--version")).toBe(false);
  });

  it("classifies transient locks and appends auth hints", () => {
    expect(isTransientLock("database is locked")).toBe(true);
    expect(isTransientLock("SQLITE_BUSY: db busy")).toBe(true);
    expect(isTransientLock("segfault")).toBe(false);
    expect(withAuthHint("Unexpected server error")).toMatch(/credentials/);
    expect(withAuthHint("plain failure")).toBe("plain failure");
  });
});

describe("mailbox machinery", () => {
  it("createLock serializes overlapping async work", async () => {
    const lock = createLock();
    const order: Array<string> = [];
    const slow = lock(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push("slow");
    });
    const fast = lock(async () => {
      order.push("fast");
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["slow", "fast"]);
  });

  it("createLock keeps the chain alive after a rejection", async () => {
    const lock = createLock();
    await expect(lock(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(lock(async () => "next")).resolves.toBe("next");
  });

  it("mailbox dispatches decoded frames and keeps going when a handler throws", async () => {
    const messages = [
      { id: "1", from: "peer", timestamp: "t", type: "CIPHERTEXT", text: encodeTaskFrame({ kind: "task", taskId: "a", text: "one" }) },
      { id: "2", from: "peer", timestamp: "t", type: "CIPHERTEXT", text: "plain chatter" },
    ];
    const agent = {
      readMessages: vi.fn(async () => messages),
    };
    const errors: Array<unknown> = [];
    const seen: Array<string> = [];
    const mailbox = createMailbox(agent as never, {
      lock: createLock(),
      onError: (error) => errors.push(error),
    });
    mailbox.onMessage((_, message, frame) => {
      seen.push(frame ? `frame:${frame.taskId}` : `plain:${message.text}`);
      throw new Error("handler exploded");
    });
    await expect(mailbox.tickOnce()).resolves.toBeUndefined();
    // Both messages of the destructive batch were dispatched despite the throw.
    expect(seen).toEqual(["frame:a", "plain:plain chatter"]);
    expect(errors).toHaveLength(2);
  });

  it("tickOnce reports read failures through onError and rethrows", async () => {
    const agent = {
      readMessages: vi.fn(async () => {
        throw new Error("relay down");
      }),
    };
    const errors: Array<unknown> = [];
    const mailbox = createMailbox(agent as never, {
      lock: createLock(),
      onError: (error) => errors.push(error),
    });
    await expect(mailbox.tickOnce()).rejects.toThrow("relay down");
    expect(errors).toHaveLength(1);
  });

  it("contact auto-accepter accepts each incoming request", async () => {
    const accepted: Array<string> = [];
    const agent = {
      client: {
        contacts: {
          requests: vi.fn(async () => ({
            incoming: [{ agentId: "peer1" }, { agentId: "peer2" }],
            outgoing: [],
          })),
          accept: vi.fn(async (id: string) => {
            accepted.push(id);
            return {};
          }),
        },
      },
    };
    const accepter = createContactAutoAccepter(agent as never, {
      lock: createLock(),
      intervalMs: 10_000,
      onAccept: () => {},
    });
    accepter.start();
    await vi.waitFor(() => expect(accepted).toEqual(["peer1", "peer2"]));
    accepter.stop();
  });

  it("makePathLookup finds executables only on PATH dirs", () => {
    const lookup = makePathLookup({ PATH: "/definitely/not/a/dir" });
    expect(lookup("some-untraceable-binary-xyz")).toBe(false);
    const shLookup = makePathLookup({ PATH: "/bin:/usr/bin" });
    expect(shLookup("sh")).toBe(true);
  });
});

describe("statusDetail", () => {
  it("summarizes a tool call", () => {
    expect(
      statusDetail({
        line: 0,
        timestamp: new Date(),
        recordType: "x",
        event: {
          kind: "tool_call",
          role: "agent",
          payload: { call_id: "c", tool_name: "Bash", tool_kind: "shell", display: "npm test", input: {} },
        },
      }),
    ).toBe("running Bash: npm test");
  });
});
