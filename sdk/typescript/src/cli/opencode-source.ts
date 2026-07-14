// opencode session source — the non-file "tailer" for the interactive wrapper.
//
// opencode keeps sessions in a single SQLite DB, not per-session JSONL files, so
// the file-polling `HarnessSessionTailer` cannot observe a live session. But
// running `opencode` starts an HTTP server with an SSE bus (`GET /event`), and
// `opencode attach <url>` launches the interactive TUI against an existing
// server. This module owns that seam: it starts a headless `opencode serve`,
// subscribes to its `/event` bus, folds bus frames through the shared
// `createOpenCodeBusMapper`, and emits the same v1/v2 envelopes as the file
// tailer via `SessionEnvelopeEmitter`. The wrapper spawns `opencode attach
// <url>` in the PTY so the human's session and this observer share one server.
import { spawn as spawnChild, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { resolve as resolvePath } from "node:path";
import type { Writable } from "node:stream";

import { bridgeLog } from "./bridge-debug.js";
import {
  createOpenCodeBusMapper,
  type HarnessSemanticEvent,
  type OpenCodeBusMapper,
} from "./harness-events.js";
import {
  SessionEnvelopeEmitter,
  type EmitIdentity,
  type HarnessWrapperConfig,
  type SemanticMessage,
  type SessionEnvelopePublisher,
} from "./harness-wrapper.js";

/**
 * Opens the opencode `/event` SSE stream and yields one raw JSON payload per
 * bus frame (the `data:` lines, `data:` prefix stripped). Injectable so tests
 * can feed a synthetic frame sequence without a real server.
 */
export type SseConnect = (
  url: string,
  signal: AbortSignal,
) => AsyncIterable<string>;

const READY_TIMEOUT_MS = 10_000;
const STOP_GRACE_MS = 2_000;
// Pre-latch buffer bound — before we know our session id, incoming events are
// held; a runaway (never-latched) stream must not grow this without limit.
const PRE_LATCH_CAP = 500;

// ── server lifecycle ─────────────────────────────────────────────────────────

export interface OpenCodeServerHandle {
  url: string;
  port: number;
  stop(): Promise<void>;
}

export interface StartOpenCodeServerOptions {
  bin: string;
  cwd: string;
  env: Record<string, string | undefined>;
  spawn?: typeof spawnChild;
  connect?: SseConnect;
  readyTimeoutMs?: number;
}

/**
 * Start a headless `opencode serve` on a free ephemeral port and resolve only
 * once it is accepting connections (the SSE `server.connected` frame, or a
 * "listening on <url>" line on the child's output — whichever comes first). A
 * child that exits before ready (e.g. a lost port race) is retried once.
 */
export async function startOpenCodeServer(
  options: StartOpenCodeServerOptions,
): Promise<OpenCodeServerHandle> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await startOnce(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= 1 || !/EADDRINUSE|exited before ready/i.test(message)) {
        throw error;
      }
      bridgeLog("opencode.serve.retry", { message });
    }
  }
}

async function startOnce(
  options: StartOpenCodeServerOptions,
): Promise<OpenCodeServerHandle> {
  const spawn = options.spawn ?? spawnChild;
  const connect = options.connect ?? defaultSseConnect;
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    options.bin,
    ["serve", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: options.cwd, env: options.env },
  );
  bridgeLog("opencode.serve.spawn", { bin: options.bin, port });

  try {
    await waitForReady(
      connect,
      `${url}/event`,
      child,
      options.readyTimeoutMs ?? READY_TIMEOUT_MS,
    );
  } catch (error) {
    await killChild(child);
    throw error;
  }

  return { url, port, stop: () => killChild(child) };
}

/** Wait until the server accepts SSE connections, or the child dies / times out. */
function waitForReady(
  connect: SseConnect,
  eventUrl: string,
  child: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  const probe = new AbortController();
  return new Promise<void>((resolvePromise, reject) => {
    let settled = false;
    const done = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      probe.abort();
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
      child.off("exit", onExit);
      child.off("error", onError);
      if (error) {
        reject(error);
      } else {
        resolvePromise();
      }
    };

    const timer = setTimeout(
      () => done(new Error(`opencode serve not ready after ${timeoutMs}ms`)),
      timeoutMs,
    );
    const onExit = (code: number | null): void =>
      done(new Error(`opencode serve exited before ready (code ${code})`));
    const onError = (error: Error): void =>
      done(new Error(`opencode serve failed to spawn: ${error.message}`));
    const onData = (chunk: Buffer | string): void => {
      if (/listening on\s+http/i.test(String(chunk))) {
        done();
      }
    };

    child.on("exit", onExit);
    child.on("error", onError);
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    // Primary readiness signal: the first `/event` frame (server.connected).
    void (async (): Promise<void> => {
      try {
        for await (const raw of connect(eventUrl, probe.signal)) {
          void raw;
          done();
          return;
        }
      } catch {
        // Aborted (we won via stdout) or transient — the timeout/exit guards
        // still resolve or reject this wait.
      }
    })();
  });
}

async function killChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolvePromise) => {
    const grace = setTimeout(() => {
      child.kill("SIGKILL");
    }, STOP_GRACE_MS);
    child.once("exit", () => {
      clearTimeout(grace);
      resolvePromise();
    });
    child.kill("SIGTERM");
  });
}

function freePort(): Promise<number> {
  return new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => {
        if (port) {
          resolvePromise(port);
        } else {
          reject(new Error("could not acquire a free port"));
        }
      });
    });
  });
}

// ── event source ─────────────────────────────────────────────────────────────

/**
 * Subscribes to an opencode server's `/event` SSE bus and publishes the tiny.place
 * session envelopes for the ONE session whose working directory matches `cwd`.
 * The global stream can carry other sessions; this filters them out.
 */
export class OpenCodeEventSource {
  private readonly emitter: SessionEnvelopeEmitter;
  private readonly mapper: OpenCodeBusMapper = createOpenCodeBusMapper();
  private readonly connect: SseConnect;
  private readonly controller = new AbortController();
  private targetSessionId: string | undefined;
  private pending: Array<{ sessionID?: string; event: HarnessSemanticEvent }> =
    [];
  private line = 0;
  private statusTimer: ReturnType<typeof setInterval> | undefined;
  private readerDone: Promise<void> | undefined;

  public constructor(
    private readonly config: HarnessWrapperConfig,
    private readonly cwd: string,
    dryRunOutput: Writable,
    private readonly publisher: SessionEnvelopePublisher,
    options: { connect?: SseConnect } = {},
  ) {
    this.emitter = new SessionEnvelopeEmitter(
      config,
      cwd,
      dryRunOutput,
      publisher,
    );
    this.connect = options.connect ?? defaultSseConnect;
  }

  /** Begin reading the SSE stream and ticking status; resolves immediately. */
  public start(eventUrl: string): void {
    this.readerDone = this.readLoop(eventUrl);
    if (this.config.emitV2) {
      this.statusTimer = setInterval(() => {
        const id = this.identity();
        if (id) {
          this.emitter.tick(id);
        }
      }, this.config.sessionPollMs);
    }
  }

  /** Stop the stream, flush any buffered text, and flush the publisher. */
  public async stop(): Promise<number> {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = undefined;
    }
    this.controller.abort();
    await this.readerDone?.catch(() => undefined);
    for (const event of this.mapper.flush(this.line)) {
      this.emit(event);
    }
    return this.publisher.flush();
  }

  private async readLoop(eventUrl: string): Promise<void> {
    try {
      for await (const raw of this.connect(eventUrl, this.controller.signal)) {
        this.line += 1;
        this.handleFrame(raw, this.line);
      }
    } catch (error) {
      if (!this.controller.signal.aborted) {
        bridgeLog("opencode.source.read.error", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private handleFrame(raw: string, line: number): void {
    const mapping = this.mapper.next(raw, line);

    // Latch our session id the first time a `session.*` frame reports our cwd.
    if (
      !this.targetSessionId &&
      mapping.sessionID &&
      mapping.directory !== undefined &&
      this.sameCwd(mapping.directory)
    ) {
      this.targetSessionId = mapping.sessionID;
      bridgeLog("opencode.source.latched", {
        sessionId: this.targetSessionId,
        directory: mapping.directory,
      });
      const buffered = this.pending;
      this.pending = [];
      for (const held of buffered) {
        if (!held.sessionID || held.sessionID === this.targetSessionId) {
          this.emit(held.event);
        }
      }
    }

    for (const event of mapping.events) {
      if (this.targetSessionId) {
        // Drop events tagged for a different session on the shared bus.
        if (mapping.sessionID && mapping.sessionID !== this.targetSessionId) {
          continue;
        }
        this.emit(event);
      } else {
        this.bufferPreLatch(mapping.sessionID, event);
      }
    }
  }

  private bufferPreLatch(
    sessionID: string | undefined,
    event: HarnessSemanticEvent,
  ): void {
    if (this.pending.length >= PRE_LATCH_CAP) {
      this.pending.shift();
      bridgeLog("opencode.source.preLatchOverflow", { cap: PRE_LATCH_CAP });
    }
    this.pending.push({ ...(sessionID ? { sessionID } : {}), event });
  }

  private emit(event: HarnessSemanticEvent): void {
    const id = this.identity();
    if (!id) {
      return;
    }
    const message = v1FromSemantic(event);
    if (message) {
      this.emitter.emitV1Message(message, id);
    }
    if (this.config.emitV2) {
      this.emitter.emitV2Event(event, id);
    }
  }

  private identity(): EmitIdentity | undefined {
    if (!this.targetSessionId) {
      return undefined;
    }
    return {
      sessionId: this.targetSessionId,
      sourcePath: `opencode-sse://${this.targetSessionId}`,
    };
  }

  private sameCwd(directory: string): boolean {
    return resolvePath(directory) === resolvePath(this.cwd);
  }
}

/**
 * Project a typed semantic event onto a v1 session message. Only owner prompts
 * and agent messages become v1 lines — tool calls, thinking, and status are
 * v2-only, exactly as the claude/codex v1 mappers already drop them.
 */
function v1FromSemantic(
  event: HarnessSemanticEvent,
): SemanticMessage | undefined {
  const { line, timestamp, recordType } = event;
  if (event.event.kind === "user_prompt") {
    return {
      line,
      timestamp,
      recordType,
      role: "user",
      text: event.event.payload.text,
    };
  }
  if (event.event.kind === "agent_message") {
    return {
      line,
      timestamp,
      recordType,
      role: "agent",
      sourceRole: "assistant",
      text: event.event.payload.text,
    };
  }
  return undefined;
}

// ── default SSE transport (Node 22 global fetch) ─────────────────────────────

async function* defaultSseConnect(
  url: string,
  signal: AbortSignal,
): AsyncIterable<string> {
  const response = await fetch(url, {
    signal,
    headers: { accept: "text/event-stream" },
  });
  if (!response.ok || !response.body) {
    throw new Error(`opencode /event returned HTTP ${response.status}`);
  }
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frameData(frame);
      if (data !== undefined) {
        yield data;
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

/** Extract the joined `data:` payload from one SSE frame (ignore comments/ids). */
function frameData(frame: string): string | undefined {
  const dataLines = frame
    .split("\n")
    .filter((raw) => raw.startsWith("data:"))
    .map((raw) => raw.slice("data:".length).replace(/^ /, ""));
  return dataLines.length > 0 ? dataLines.join("\n") : undefined;
}
