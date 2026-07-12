import { spawn as spawnChild } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { IPty } from "node-pty";

import {
  publishKeys,
  readMessages,
  resolveRecipientKey,
  sendMessage,
  type ReadMessage,
} from "../agent/messaging.js";
import { publishCard } from "../agent/identity.js";
import {
  SESSION_ENVELOPE_VERSION_V1,
  SESSION_ENVELOPE_VERSION_V2,
  type AnySessionEnvelope,
  type HarnessBucketUnit,
  type HarnessEnvelopeScope,
  type HarnessMessageRole,
  type HarnessProvider,
  type SessionEnvelope,
  type StatusPayload,
} from "../types/harness.js";
import { bridgeLog } from "./bridge-debug.js";
import { createHarnessLineMapper } from "./harness-events.js";
import type {
  HarnessLineMapper,
  HarnessSemanticEvent,
} from "./harness-events.js";
import {
  buildEventEnvelopeV2,
  type EnvelopeContext,
} from "./harness-envelope.js";
import {
  initialStatus,
  reduceStatus,
  tickStatus,
  type SessionStatusState,
} from "./harness-status.js";
import { makeContext } from "./context.js";
import type { TinyPlaceCliOptions, TinyPlaceCliResult } from "./types.js";
import type { Writable } from "node:stream";

type StreamName = "input" | "output" | "error" | "lifecycle";

const requireForHarness = createRequire(import.meta.url);

interface HarnessWrapperProfile {
  binEnv: Array<string>;
  defaultBin: string;
  defaultOutDir: string;
  defaultSessionsDir: string;
  sessionFilePrefix?: string;
  terminalEnvelopeVersion: string;
}

export interface HarnessWrapperConfig {
  agentArgs: Array<string>;
  agentBin: string;
  bucket: HarnessBucketUnit;
  captureError: boolean;
  captureInput: boolean;
  captureOutput: boolean;
  captureSession: boolean;
  dmRecipient?: string;
  dryRun: boolean;
  // Opt-in: also emit the v2 typed-event stream (tool_call/tool_result/status/
  // thinking) alongside v1. Default off so current v1 consumers are untouched
  // until the OpenHuman receiver understands v2.
  emitV2: boolean;
  outDir: string;
  provider: HarnessProvider;
  // v2 status derivation: idle a silent session after this long, and re-emit a
  // heartbeat status no more often than this. Only used when emitV2 is on.
  statusHeartbeatMs: number;
  statusIdleMs: number;
  receiveEnabled: boolean;
  receiveFrom?: string;
  receivePollMs: number;
  sessionFile?: string;
  // A resumed session appends to a file that already existed when the tailer
  // started, so it lands in `ignoredSessionFiles` and would never be tailed.
  // Setting this un-ignores that one file so the resumed turns still stream
  // (without pinning — a resume that instead spawns a fresh file is still
  // located normally). See tui.ts resume flow.
  resumeSessionFile?: string;
  sessionPollMs: number;
  sessionsDir: string;
  sessionTailGraceMs: number;
  scope: HarnessEnvelopeScope;
  usePty: boolean;
  wrapperSessionId: string;
}

export type CodexWrapperConfig = HarnessWrapperConfig & {
  codexArgs: Array<string>;
  codexBin: string;
};

interface TerminalEnvelope {
  envelope_version: string;
  bucket: {
    unit: HarnessBucketUnit;
    start: string;
    end: string;
  };
  scope: {
    type: HarnessEnvelopeScope;
    key: string;
    cwd: string;
    wrapper_session_id: string;
  };
  event: {
    id: string;
    sequence: number;
    stream: StreamName;
    timestamp: string;
    text: string;
  };
  harness: {
    provider: HarnessProvider;
    argv: Array<string>;
    command: string;
    pid?: number;
    pty: boolean;
  };
  codex?: {
    argv: Array<string>;
    command: string;
    pid?: number;
    pty: boolean;
  };
  claude?: {
    argv: Array<string>;
    command: string;
    pid?: number;
    pty: boolean;
  };
  opencode?: {
    argv: Array<string>;
    command: string;
    pid?: number;
    pty: boolean;
  };
}

interface SessionMeta {
  cwd?: string;
  sessionId: string;
}

interface SemanticMessage {
  line: number;
  phase?: string;
  recordType: string;
  role: HarnessMessageRole;
  sourceRole?: string;
  text: string;
  timestamp: Date;
}

interface AgentLaunch {
  args: Array<string>;
  command: string;
}

interface HarnessStdio {
  stdin: NodeJS.ReadableStream;
  stdout: Writable;
  stderr: Writable;
}

const PROFILES: Record<HarnessProvider, HarnessWrapperProfile> = {
  codex: {
    binEnv: ["TINYPLACE_CODEX_BIN"],
    defaultBin: "codex",
    defaultOutDir: join(homedir(), ".tinyplace", "codex-envelopes"),
    defaultSessionsDir: join(homedir(), ".codex", "sessions"),
    sessionFilePrefix: "rollout-",
    terminalEnvelopeVersion: "tinyplace.codex.terminal.v1",
  },
  claude: {
    binEnv: ["TINYVERSE_CLAUDE_BIN", "TINYPLACE_CLAUDE_BIN"],
    defaultBin: "claude",
    defaultOutDir: join(homedir(), ".tinyplace", "claude-envelopes"),
    defaultSessionsDir: join(homedir(), ".claude", "projects"),
    terminalEnvelopeVersion: "tinyplace.claude.terminal.v1",
  },
  // opencode is driven headlessly by the daemon (`opencode run --format json`),
  // not by the interactive PTY tailer — it keeps sessions in a SQLite store, not
  // per-session JSONL files. The profile exists so opencode is a first-class
  // `HarnessProvider` (bin resolution, envelope framing); the sessions dir is a
  // best-effort default and is not tailed for opencode.
  opencode: {
    binEnv: ["TINYPLACE_OPENCODE_BIN"],
    defaultBin: "opencode",
    defaultOutDir: join(homedir(), ".tinyplace", "opencode-envelopes"),
    defaultSessionsDir: join(homedir(), ".local", "share", "opencode", "sessions"),
    terminalEnvelopeVersion: "tinyplace.opencode.terminal.v1",
  },
};

export async function runHarnessCommand(
  provider: HarnessProvider,
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const config = parseHarnessWrapperArgs(provider, argv, env);
  const spawnFn = options.spawn ?? spawnChild;
  const stdio = {
    stdin: options.stdin ?? process.stdin,
    stdout: options.stdout ?? process.stdout,
    stderr: options.stderr ?? process.stderr,
  };
  const writer = new TerminalEnvelopeWriter(config, cwd, stdio.stderr);
  const publisher = new SessionEnvelopePublisher(config, options, stdio.stderr);
  const sessionTailer = config.captureSession
    ? new HarnessSessionTailer(config, cwd, stdio.stderr, publisher)
    : undefined;
  const receiver = config.receiveEnabled
    ? new InboundMessageReceiver(config, publisher, stdio.stderr)
    : undefined;
  const launch = buildAgentLaunch(config);

  const usePty = config.usePty && options.spawn === undefined;
  writer.pty = usePty;
  writer.write(
    "lifecycle",
    `start ${launch.command} ${launch.args.join(" ")}`.trim(),
  );
  sessionTailer?.start(new Date());
  // Publish keys + start the inbound poll before spawn; injection stays a no-op
  // until the child registers its input sink below. Guarded (not `?.`) so the
  // no-receiver path stays synchronous and doesn't reorder stdin capture.
  if (receiver) {
    await receiver.start();
  }

  const onInputSink = receiver
    ? (write: (text: string) => void): void => receiver.setSink(write)
    : undefined;
  const exitCode = usePty
    ? await runPtyAgent(launch, config, cwd, env, writer, stdio, onInputSink)
    : await runPipeAgent(
        launch,
        config,
        cwd,
        env,
        writer,
        stdio,
        spawnFn,
        onInputSink,
      );

  const dmFailures = (await sessionTailer?.stop()) ?? 0;
  if (receiver) {
    await receiver.stop();
  }

  return {
    code: exitCode === 0 && dmFailures > 0 ? 1 : exitCode,
    stdout: "",
    stderr: "",
  };
}

async function runPtyAgent(
  launch: AgentLaunch,
  config: HarnessWrapperConfig,
  cwd: string,
  env: Record<string, string | undefined>,
  writer: TerminalEnvelopeWriter,
  stdio: HarnessStdio,
  onInputSink?: (write: (text: string) => void) => void,
): Promise<number> {
  let pty: IPty;
  try {
    fixNodePtyHelperPermissions();
    const { spawn: spawnPty } = await import("node-pty");
    pty = spawnPty(launch.command, launch.args, {
      cols: terminalColumns(stdio.stdout),
      cwd,
      env: childEnv(env),
      name: terminalName(env),
      rows: terminalRows(stdio.stdout),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writer.write("lifecycle", `node-pty unavailable: ${message}`);
    stdio.stderr.write(
      `tinyplace ${config.provider}: node-pty unavailable: ${message}\n`,
    );
    writer.pty = false;
    return runPipeAgent(
      launch,
      config,
      cwd,
      env,
      writer,
      stdio,
      spawnChild,
      onInputSink,
    );
  }

  writer.pid = pty.pid;
  // Inbound injection writes straight to the PTY master — NOT through the
  // `writer.write("input", …)` capture, so injected prompts are never re-emitted
  // outbound as a fresh terminal envelope (feedback-loop defense).
  onInputSink?.((text) => {
    try {
      pty.write(text);
    } catch {
      // PTY closed — drop injected input
    }
  });
  const restoreRawMode = configureRawInput(stdio.stdin);
  const onInput = (chunk: Buffer | string): void => {
    if (config.captureInput) {
      writer.write("input", String(chunk));
    }
    pty.write(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
  };
  stdio.stdin.on("data", onInput);
  pty.onData((chunk: string) => {
    if (config.captureOutput) {
      writer.write("output", chunk);
    }
    stdio.stdout.write(chunk);
  });

  const exitCode = await new Promise<number>((resolveExit) => {
    pty.onExit(({ exitCode: code, signal }) => {
      if (signal) {
        writer.write("lifecycle", `exit signal ${signal}`);
        resolveExit(1);
        return;
      }
      writer.write("lifecycle", `exit code ${code}`);
      resolveExit(code);
    });
  });

  restoreInput(stdio.stdin, onInput);
  restoreRawMode();
  return exitCode;
}

async function runPipeAgent(
  launch: AgentLaunch,
  config: HarnessWrapperConfig,
  cwd: string,
  env: Record<string, string | undefined>,
  writer: TerminalEnvelopeWriter,
  stdio: HarnessStdio,
  spawnFn: NonNullable<TinyPlaceCliOptions["spawn"]>,
  onInputSink?: (write: (text: string) => void) => void,
): Promise<number> {
  const child = spawnFn(launch.command, launch.args, {
    cwd,
    env: {
      ...process.env,
      ...env,
      TERM: env.TERM ?? process.env.TERM ?? "xterm-256color",
    },
  });

  if (child.pid !== undefined) {
    writer.pid = child.pid;
  }
  child.stdin.on("error", () => {});
  // Inbound injection writes straight to the child's stdin, bypassing the
  // `writer.write("input", …)` capture (feedback-loop defense).
  onInputSink?.((text) => child.stdin.write(text));

  const restoreRawMode = configureRawInput(stdio.stdin);
  const onInput = (chunk: Buffer | string): void => {
    if (config.captureInput) {
      writer.write("input", String(chunk));
    }
    child.stdin.write(chunk);
  };
  stdio.stdin.on("data", onInput);
  child.stdout.on("data", (chunk: Buffer | string) => {
    if (config.captureOutput) {
      writer.write("output", String(chunk));
    }
    stdio.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    if (config.captureError) {
      writer.write("error", String(chunk));
    }
    stdio.stderr.write(chunk);
  });

  const exitCode = await new Promise<number>((resolveExit) => {
    child.on("error", (error) => {
      writer.write("lifecycle", `error: ${error.message}`);
      stdio.stderr.write(
        `tinyplace ${config.provider}: failed to start ${config.agentBin}: ${error.message}\n`,
      );
      resolveExit(1);
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        writer.write("lifecycle", `exit signal ${signal}`);
        resolveExit(1);
        return;
      }
      writer.write("lifecycle", `exit code ${code ?? 0}`);
      resolveExit(code ?? 0);
    });
  });

  restoreInput(stdio.stdin, onInput);
  restoreRawMode();
  return exitCode;
}

export function parseHarnessWrapperArgs(
  provider: HarnessProvider,
  argv: Array<string>,
  env: Record<string, string | undefined> = process.env,
): HarnessWrapperConfig {
  const profile = PROFILES[provider];
  const agentArgs: Array<string> = [];
  const outDir =
    firstEnv(env, [
      `TINYPLACE_${provider.toUpperCase()}_ENVELOPES`,
      "TINYPLACE_HARNESS_ENVELOPES",
    ]) ?? profile.defaultOutDir;
  const owner = configuredRecipient(provider, env);
  // Inbound receive-from: an explicit override, else the same owner we DM to.
  // Receive is ON by default whenever an owner is known, unless TINYPLACE_..._RECEIVE=0.
  const receiveFrom =
    firstEnv(env, [
      `TINYPLACE_${provider.toUpperCase()}_RECEIVE_FROM`,
      "TINYPLACE_HARNESS_RECEIVE_FROM",
    ]) ?? owner;
  const receiveDisabled =
    firstEnv(env, [
      `TINYPLACE_${provider.toUpperCase()}_RECEIVE`,
      "TINYPLACE_HARNESS_RECEIVE",
    ]) === "0";
  const config: HarnessWrapperConfig = {
    agentArgs,
    agentBin: firstEnv(env, profile.binEnv) ?? profile.defaultBin,
    bucket: "hour",
    captureError: true,
    captureInput: true,
    captureOutput: true,
    captureSession: true,
    ...(owner ? { dmRecipient: owner } : {}),
    dryRun: false,
    emitV2:
      firstEnv(env, [
        `TINYPLACE_${provider.toUpperCase()}_V2`,
        "TINYPLACE_HARNESS_V2",
      ]) === "1",
    outDir,
    provider,
    statusHeartbeatMs: numberEnvOr(
      firstEnv(env, [
        `TINYPLACE_${provider.toUpperCase()}_STATUS_HEARTBEAT_MS`,
        "TINYPLACE_HARNESS_STATUS_HEARTBEAT_MS",
      ]),
      15_000,
    ),
    statusIdleMs: numberEnvOr(
      firstEnv(env, [
        `TINYPLACE_${provider.toUpperCase()}_STATUS_IDLE_MS`,
        "TINYPLACE_HARNESS_STATUS_IDLE_MS",
      ]),
      30_000,
    ),
    ...(receiveFrom ? { receiveFrom } : {}),
    receiveEnabled: receiveFrom !== undefined && !receiveDisabled,
    receivePollMs: numberEnvOr(
      firstEnv(env, [
        `TINYPLACE_${provider.toUpperCase()}_RECEIVE_POLL_MS`,
        "TINYPLACE_HARNESS_RECEIVE_POLL_MS",
      ]),
      1500,
    ),
    sessionPollMs: numberEnvOr(
      firstEnv(env, [
        `TINYPLACE_${provider.toUpperCase()}_SESSION_POLL_MS`,
        "TINYPLACE_HARNESS_SESSION_POLL_MS",
      ]),
      500,
    ),
    sessionsDir:
      firstEnv(env, [
        `TINYPLACE_${provider.toUpperCase()}_SESSIONS_DIR`,
        provider === "claude" ? "TINYVERSE_CLAUDE_SESSIONS_DIR" : "",
        "TINYPLACE_HARNESS_SESSIONS_DIR",
      ]) ?? profile.defaultSessionsDir,
    sessionTailGraceMs: numberEnvOr(
      firstEnv(env, [
        `TINYPLACE_${provider.toUpperCase()}_SESSION_TAIL_GRACE_MS`,
        "TINYPLACE_HARNESS_SESSION_TAIL_GRACE_MS",
      ]),
      750,
    ),
    scope: "folder",
    usePty: true,
    wrapperSessionId: `tp-${provider}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--") {
      agentArgs.push(...argv.slice(index + 1));
      break;
    }
    if (!token.startsWith("--tinyplace-")) {
      agentArgs.push(token);
      continue;
    }
    const next = argv[index + 1];
    switch (token) {
      case "--tinyplace-bucket":
        config.bucket = parseBucket(requiredValue(token, next));
        index += 1;
        break;
      case "--tinyplace-agent-bin":
      case `--tinyplace-${provider}-bin`:
        config.agentBin = requiredValue(token, next);
        index += 1;
        break;
      case "--tinyplace-codex-bin":
        if (provider !== "codex") {
          throw new Error(`${token} is only valid for tinyplace codex`);
        }
        config.agentBin = requiredValue(token, next);
        index += 1;
        break;
      case "--tinyplace-claude-bin":
        if (provider !== "claude") {
          throw new Error(`${token} is only valid for tinyplace claude`);
        }
        config.agentBin = requiredValue(token, next);
        index += 1;
        break;
      case "--tinyplace-dm-to":
      case "--tinyplace-recipient":
        config.dmRecipient = requiredValue(token, next);
        index += 1;
        break;
      case "--tinyplace-dry-run":
        config.dryRun = true;
        break;
      case "--tinyplace-no-dm":
        delete config.dmRecipient;
        break;
      case "--tinyplace-no-receive":
        config.receiveEnabled = false;
        break;
      case "--tinyplace-receive-from":
        config.receiveFrom = requiredValue(token, next);
        config.receiveEnabled = true;
        index += 1;
        break;
      case "--tinyplace-receive-poll-ms":
        config.receivePollMs = parsePositiveInteger(
          token,
          requiredValue(token, next),
        );
        index += 1;
        break;
      case "--tinyplace-no-input":
        config.captureInput = false;
        break;
      case "--tinyplace-no-output":
        config.captureOutput = false;
        break;
      case "--tinyplace-no-stderr":
        config.captureError = false;
        break;
      case "--tinyplace-no-session-tail":
        config.captureSession = false;
        break;
      case "--tinyplace-no-pty":
        config.usePty = false;
        break;
      case "--tinyplace-out":
        config.outDir = requiredValue(token, next);
        index += 1;
        break;
      case "--tinyplace-scope":
        config.scope = parseScope(requiredValue(token, next));
        index += 1;
        break;
      case "--tinyplace-session-id":
        config.wrapperSessionId = requiredValue(token, next);
        index += 1;
        break;
      case "--tinyplace-session-file":
        config.sessionFile = requiredValue(token, next);
        index += 1;
        break;
      case "--tinyplace-session-poll-ms":
        config.sessionPollMs = parsePositiveInteger(
          token,
          requiredValue(token, next),
        );
        index += 1;
        break;
      case "--tinyplace-session-tail-grace-ms":
        config.sessionTailGraceMs = parsePositiveInteger(
          token,
          requiredValue(token, next),
        );
        index += 1;
        break;
      case "--tinyplace-sessions-dir":
        config.sessionsDir = requiredValue(token, next);
        index += 1;
        break;
      default:
        throw new Error(`unknown tinyplace ${provider} wrapper flag: ${token}`);
    }
  }

  return config;
}

export function asCodexWrapperConfig(
  config: HarnessWrapperConfig,
): CodexWrapperConfig {
  return {
    ...config,
    codexArgs: config.agentArgs,
    codexBin: config.agentBin,
  };
}

function buildAgentLaunch(config: HarnessWrapperConfig): AgentLaunch {
  return { command: config.agentBin, args: config.agentArgs };
}

export class HarnessSessionTailer {
  private ignoredSessionFiles = new Set<string>();
  private lineOffset = 0;
  // Lines already present in a resumed file when the tailer started — the offset
  // to begin at so the pre-existing transcript isn't replayed to OpenHuman.
  private resumeStartOffset = 0;
  // Canonicalized (symlink/relative-resolved) path of the resumed file, so the
  // ignore-set removal and the located-path match key off one stable identity.
  private resumeSessionPath: string | undefined;
  private startedAt: Date | undefined;
  private sessionFile: string | undefined;
  private sessionMeta: SessionMeta | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  // v2 typed-event stream state (only used when config.emitV2 is on).
  private status: SessionStatusState = initialStatus();
  private v2Seq = 0;
  private lastHeartbeatMs = 0;
  // Stateful per-stream mapper: dedupes codex's double-recorded assistant
  // message (event_msg + response_item for the same turn).
  private readonly mapEventsFromLine: HarnessLineMapper;

  public constructor(
    private readonly config: HarnessWrapperConfig,
    private readonly cwd: string,
    private readonly dryRunOutput: Writable,
    private readonly publisher: SessionEnvelopePublisher,
  ) {
    this.mapEventsFromLine = createHarnessLineMapper(config.provider);
  }

  public start(startedAt: Date): void {
    this.startedAt = startedAt;
    this.ignoredSessionFiles = new Set(listSessionFiles(this.config));
    // Resume: the file the resumed session appends to already existed, so it was
    // just swept into the ignore set. Drop it back out so its new turns tail.
    if (this.config.resumeSessionFile) {
      // Canonicalize once: the resume path comes from a different origin (session
      // discovery) than listSessionFiles, so a symlinked / relative / absolute
      // alias of the same file would otherwise stay ignored or fall through to a
      // newer fresh file and replay history. Match on the resolved identity.
      this.resumeSessionPath = canonicalPath(this.config.resumeSessionFile);
      for (const ignored of this.ignoredSessionFiles) {
        if (canonicalPath(ignored) === this.resumeSessionPath) {
          this.ignoredSessionFiles.delete(ignored);
        }
      }
      // Skip the transcript that already exists — only turns appended after the
      // resume should stream, or OpenHuman would re-receive the whole history.
      this.resumeStartOffset = readAllLines(
        this.config.resumeSessionFile,
      ).length;
    }
    bridgeLog("tailer.start", {
      startedAt: startedAt.toISOString(),
      cwd: this.cwd,
      provider: this.config.provider,
      pollMs: this.config.sessionPollMs,
      sessionFileOverride: this.config.sessionFile,
      // Pre-existing sessions we will skip (only NEWER files get tailed).
      ignoredCount: this.ignoredSessionFiles.size,
      ignored: [...this.ignoredSessionFiles],
    });
    this.timer = setInterval(() => {
      this.poll(startedAt);
    }, this.config.sessionPollMs);
    this.poll(startedAt);
  }

  public async stop(): Promise<number> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await new Promise((resolveStop) => {
      setTimeout(resolveStop, this.config.sessionTailGraceMs);
    });
    this.poll(this.startedAt ?? new Date());
    return this.publisher.flush();
  }

  private poll(startedAt: Date): void {
    if (!this.sessionFile) {
      const located = this.locateSession(startedAt);
      if (!located) {
        return;
      }
      this.sessionFile = located.path;
      this.sessionMeta = located.meta;
      // A resumed file starts past its existing transcript; any other located
      // file is new, so start at 0. Compare on the canonical identity so a
      // path alias of the resumed file still seeds past its history.
      this.lineOffset =
        this.resumeSessionPath !== undefined &&
        canonicalPath(located.path) === this.resumeSessionPath
          ? this.resumeStartOffset
          : 0;
      bridgeLog("tailer.located", {
        path: located.path,
        sessionId: located.meta?.sessionId,
        metaCwd: located.meta?.cwd,
      });
    }

    const lines = readNewLines(this.sessionFile, this.lineOffset);
    this.lineOffset += lines.length;
    if (lines.length > 0) {
      let semanticCount = 0;
      for (const { line, raw } of lines) {
        for (const message of semanticMessagesFromLine(
          this.config.provider,
          raw,
          line,
        )) {
          semanticCount += 1;
          this.write(message);
        }
        if (this.config.emitV2) {
          for (const event of this.mapEventsFromLine(raw, line)) {
            this.writeV2(event);
          }
        }
      }
      bridgeLog("tailer.poll", {
        newLines: lines.length,
        semanticMessages: semanticCount,
        lineOffset: this.lineOffset,
      });
    }
    // Even with no new lines, age a silent session toward idle and heartbeat.
    if (this.config.emitV2) {
      this.tickV2Status();
    }
  }

  private locateSession(
    startedAt: Date,
  ): { meta: SessionMeta; path: string } | undefined {
    if (this.config.sessionFile) {
      const meta = readSessionMeta(
        this.config.provider,
        this.config.sessionFile,
      ) ?? {
        sessionId: basename(this.config.sessionFile),
      };
      return { meta, path: this.config.sessionFile };
    }

    const all = listSessionFiles(this.config);
    const fresh = all
      .filter((path) => !this.ignoredSessionFiles.has(path))
      .filter((path) => {
        try {
          return statSync(path).mtimeMs >= startedAt.getTime() - 2_000;
        } catch {
          return false;
        }
      });
    const withMeta = fresh.map((path) => ({
      meta: readSessionMeta(this.config.provider, path),
      path,
    }));
    const candidates = withMeta
      .filter((entry): entry is { meta: SessionMeta; path: string } => {
        return entry.meta?.cwd === this.cwd;
      })
      .sort(
        (left, right) =>
          statSync(right.path).mtimeMs - statSync(left.path).mtimeMs,
      );
    // Only log when there ARE fresh candidates but none matched, or when we found
    // one — avoids spamming the log every poll before the session file exists.
    if (fresh.length > 0 && candidates.length === 0) {
      bridgeLog("tailer.locate.cwdMismatch", {
        wantCwd: this.cwd,
        freshCount: fresh.length,
        // Surface the cwd each fresh session recorded so a mismatch is obvious.
        sawCwds: withMeta.map((entry) => ({
          path: entry.path,
          cwd: entry.meta?.cwd,
        })),
      });
    }
    return candidates[0];
  }

  private write(message: SemanticMessage): void {
    if (!this.sessionFile || !this.sessionMeta) {
      return;
    }
    const bucketStart = floorTimestamp(message.timestamp, this.config.bucket);
    const bucketEnd = addBucket(bucketStart, this.config.bucket);
    const envelope: SessionEnvelope = {
      envelope_version: SESSION_ENVELOPE_VERSION_V1,
      version: 1,
      bucket: {
        unit: this.config.bucket,
        start: formatTimestamp(bucketStart),
        end: formatTimestamp(bucketEnd),
      },
      scope: {
        type: this.config.scope,
        key: this.scopeKey(),
        cwd: this.cwd,
        wrapper_session_id: this.config.wrapperSessionId,
        harness_session_id: this.sessionMeta.sessionId,
      },
      harness: {
        provider: this.config.provider,
        command: this.config.agentBin,
        argv: this.config.agentArgs,
      },
      message: {
        id: stableEventId(
          this.sessionMeta.sessionId,
          message.role,
          message.line,
          message.text,
        ),
        line: message.line,
        ...(message.phase ? { phase: message.phase } : {}),
        role: message.role,
        text: message.text,
        timestamp: formatTimestamp(message.timestamp),
      },
      source: {
        path: this.sessionFile,
        record_type: message.recordType,
        ...(message.sourceRole ? { source_role: message.sourceRole } : {}),
      },
    };
    bridgeLog("tailer.message", {
      id: envelope.message.id,
      role: message.role,
      line: message.line,
      recordType: message.recordType,
      textPreview: message.text,
    });
    this.writeEnvelope(envelope);
    this.publisher.publish(envelope);
  }

  /** Emit one typed v2 event, then the status transition it implies. */
  private writeV2(semantic: HarnessSemanticEvent): void {
    if (!this.sessionFile || !this.sessionMeta) {
      return;
    }
    const ctx = this.v2Context(this.sessionFile, this.sessionMeta);
    const envelope = buildEventEnvelopeV2(ctx, semantic, this.nextV2Seq());
    bridgeLog("tailer.v2.event", {
      id: envelope.event.id,
      seq: envelope.event.seq,
      kind: envelope.event.kind,
      line: semantic.line,
    });
    this.writeEnvelope(envelope);
    this.publisher.publish(envelope);

    const step = reduceStatus(this.status, semantic);
    this.status = step.next;
    if (step.emit) {
      this.publishStatus(step.emit, Date.now());
    }
  }

  /** Age a silent session toward idle and emit a periodic heartbeat status. */
  private tickV2Status(): void {
    if (!this.sessionFile || !this.sessionMeta) {
      return;
    }
    const now = Date.now();
    const heartbeat =
      now - this.lastHeartbeatMs >= this.config.statusHeartbeatMs;
    const step = tickStatus(this.status, now, {
      idleAfterMs: this.config.statusIdleMs,
      heartbeat,
    });
    this.status = step.next;
    if (step.emit) {
      this.lastHeartbeatMs = now;
      this.publishStatus(step.emit, now);
    }
  }

  private publishStatus(payload: StatusPayload, nowMs: number): void {
    if (!this.sessionFile || !this.sessionMeta) {
      return;
    }
    const semantic: HarnessSemanticEvent = {
      line: this.lineOffset,
      timestamp: new Date(nowMs),
      recordType: "derived:status",
      event: { kind: "status", role: "agent", payload },
    };
    const ctx = this.v2Context(this.sessionFile, this.sessionMeta);
    const envelope = buildEventEnvelopeV2(ctx, semantic, this.nextV2Seq());
    this.writeEnvelope(envelope);
    this.publisher.publish(envelope);
  }

  private v2Context(sessionFile: string, meta: SessionMeta): EnvelopeContext {
    return {
      provider: this.config.provider,
      command: this.config.agentBin,
      argv: this.config.agentArgs,
      scopeType: this.config.scope,
      scopeKey: this.scopeKey(),
      cwd: this.cwd,
      wrapperSessionId: this.config.wrapperSessionId,
      harnessSessionId: meta.sessionId,
      bucketUnit: this.config.bucket,
      sourcePath: sessionFile,
    };
  }

  private nextV2Seq(): number {
    const seq = this.v2Seq;
    this.v2Seq += 1;
    return seq;
  }

  private writeEnvelope(envelope: AnySessionEnvelope): void {
    const encoded = `${JSON.stringify(envelope)}\n`;
    if (this.config.dryRun) {
      this.dryRunOutput.write(encoded);
      return;
    }
    const target = this.outputPath(envelope);
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, encoded, { encoding: "utf8", flag: "a" });
  }

  private outputPath(envelope: AnySessionEnvelope): string {
    const bucketStart = new Date(envelope.bucket.start);
    const fileName = bucketFileName(bucketStart, this.config.bucket);
    if (this.config.scope === "session") {
      return join(
        this.config.outDir,
        "messages",
        "sessions",
        safeSlug(this.config.wrapperSessionId),
        fileName,
      );
    }
    return join(
      this.config.outDir,
      "messages",
      "folders",
      safeSlug(this.scopeKey()),
      fileName,
    );
  }

  private scopeKey(): string {
    if (this.config.scope === "session") {
      return this.config.wrapperSessionId;
    }
    const digest = createHash("sha256")
      .update(this.cwd)
      .digest("hex")
      .slice(0, 12);
    return `${basename(this.cwd) || "root"}-${digest}`;
  }
}

export class SessionEnvelopePublisher {
  private contactPromise: Promise<string> | undefined;
  private contextPromise: ReturnType<typeof makeContext> | undefined;
  private failures = 0;
  private pending = new Set<Promise<void>>();
  private queue: Promise<void> = Promise.resolve();
  // Echo suppression: text injected FROM the owner (inbound) is recorded by the
  // agent as a `user`-role session line, which the tailer would otherwise stream
  // straight back — the owner then sees its own message twice AND may auto-reply
  // to its own echo, feeding a ping-pong loop. Remember recent injections so
  // `publish()` can drop the matching `user` echo. TTL-bounded so a genuine
  // later user turn with identical text still forwards.
  private injectedEchoes = new Map<string, number>();
  private static readonly ECHO_TTL_MS = 60_000;

  public constructor(
    private readonly config: HarnessWrapperConfig,
    private readonly options: TinyPlaceCliOptions,
    private readonly stderr: Writable,
  ) {}

  /** Record an owner→agent injection so its echoed-back `user` line is dropped. */
  public markInjected(text: string): void {
    const key = echoKey(text);
    if (key.length === 0) {
      return;
    }
    const now = Date.now();
    // Prune expired keys on every write so the map stays bounded even when the
    // echo never comes back (e.g. captureSession off → no tailer → publish()
    // never consumes entries). Without this it grows one entry per inbound.
    for (const [existingKey, expiry] of this.injectedEchoes) {
      if (expiry < now) {
        this.injectedEchoes.delete(existingKey);
      }
    }
    this.injectedEchoes.set(key, now + SessionEnvelopePublisher.ECHO_TTL_MS);
  }

  /** True (consuming the record) if this outbound is an echo of a fresh injection. */
  private isInjectedEcho(envelope: AnySessionEnvelope): boolean {
    // The echoed injection is a `user` turn in v1 and an `owner` `user_prompt`
    // in v2 — accept both, or v2 sessions (TINYPLACE_*_V2=1) leak the echo and
    // re-enter the auto-reply loop this suppression exists to stop.
    const role = envelopeRole(envelope);
    if (role !== "user" && role !== "owner") {
      return false;
    }
    const key = echoKey(envelopeText(envelope));
    const expiry = this.injectedEchoes.get(key);
    if (expiry === undefined) {
      return false;
    }
    this.injectedEchoes.delete(key);
    return expiry >= Date.now();
  }

  public publish(envelope: AnySessionEnvelope): void {
    const id = envelopeId(envelope);
    if (!this.config.dmRecipient || this.config.dryRun) {
      bridgeLog("publish.skip", {
        id,
        reason: !this.config.dmRecipient ? "no-dmRecipient" : "dryRun",
      });
      return;
    }
    if (this.isInjectedEcho(envelope)) {
      bridgeLog("publish.echoSkip", { id });
      return;
    }
    bridgeLog("publish.enqueue", {
      id,
      role: envelopeRole(envelope),
      recipient: this.config.dmRecipient,
    });
    const run = this.queue
      .then(() => this.publishNow(envelope))
      .then(() => {
        bridgeLog("publish.ok", { id });
      })
      .catch((error: unknown) => {
        this.failures += 1;
        bridgeLog("publish.error", {
          id,
          error: error instanceof Error ? error.message : String(error),
        });
        this.stderr.write(
          `tinyplace ${this.config.provider}: failed to DM session envelope ${id}: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
      });
    this.queue = run.then(() => undefined);
    const tracked = run.finally(() => {
      this.pending.delete(tracked);
    });
    this.pending.add(tracked);
  }

  public async flush(): Promise<number> {
    await Promise.allSettled([...this.pending]);
    return this.failures;
  }

  private async publishNow(envelope: AnySessionEnvelope): Promise<void> {
    const ctx = await this.context();
    if (!ctx.signer) {
      throw new Error("DM forwarding requires a tiny.place signer");
    }
    const recipient = await this.ensureContact(ctx);
    try {
      await sendMessage(
        ctx.client,
        ctx.signer,
        recipient,
        JSON.stringify(envelope),
      );
    } catch (error) {
      if (!isNotAContactError(error)) {
        throw error;
      }
      this.contactPromise = undefined;
      const refreshedRecipient = await this.ensureContact(ctx);
      await sendMessage(
        ctx.client,
        ctx.signer,
        refreshedRecipient,
        JSON.stringify(envelope),
      );
    }
  }

  /** Shared, memoized tiny.place context (client + signer). Reused by the
   *  inbound receiver so only ONE client / FileSessionStore / ratchet exists. */
  public getContext(): ReturnType<typeof makeContext> {
    return this.context();
  }

  private context(): ReturnType<typeof makeContext> {
    this.contextPromise ??= makeContext(this.options);
    return this.contextPromise;
  }

  private ensureContact(
    ctx: Awaited<ReturnType<typeof makeContext>>,
  ): Promise<string> {
    this.contactPromise ??= this.ensureContactNow(ctx);
    return this.contactPromise;
  }

  private async ensureContactNow(
    ctx: Awaited<ReturnType<typeof makeContext>>,
  ): Promise<string> {
    if (!ctx.signer) {
      throw new Error("DM forwarding requires a tiny.place signer");
    }
    const recipient = await resolveRecipientKey(
      ctx.client,
      this.config.dmRecipient ?? "",
    );
    if (recipient === ctx.signer.agentId) {
      return recipient;
    }

    // Request first (idempotent; auto-accepts a reverse-pending request), then
    // read status. Never pre-check status: the backend 404s on a fresh
    // relationship, so a status-first probe would throw before we ever send the
    // request.
    await ctx.client.contacts.request(recipient);
    const status = await ctx.client.contacts.status(recipient);
    if (status.status === "accepted") {
      return recipient;
    }
    if (status.status === "blocked") {
      throw new Error(
        `tiny.place contact blocked for ${recipient}; unblock before DM forwarding`,
      );
    }
    throw new Error(
      `tiny.place contact request pending for ${recipient}; approve it in OpenHuman before DM forwarding`,
    );
  }
}

function envelopeId(envelope: AnySessionEnvelope): string {
  return envelope.envelope_version === SESSION_ENVELOPE_VERSION_V2
    ? envelope.event.id
    : envelope.message.id;
}

export function envelopeRole(envelope: AnySessionEnvelope): string {
  return envelope.envelope_version === SESSION_ENVELOPE_VERSION_V2
    ? envelope.event.role
    : envelope.message.role;
}

export function envelopeText(envelope: AnySessionEnvelope): string {
  if (envelope.envelope_version === SESSION_ENVELOPE_VERSION_V2) {
    // v2 typed events carry their body under event.payload.text (user_prompt,
    // agent_message, …); older/other shapes may put it at event.text.
    const event = envelope.event as {
      text?: string;
      payload?: { text?: string };
    };
    return event.payload?.text ?? event.text ?? "";
  }
  return envelope.message.text;
}

/** Normalize a message body so an injected inbound and its echoed-back session
 *  line compare equal (trim + collapse interior whitespace). */
function echoKey(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function isNotAContactError(error: unknown): boolean {
  const body =
    typeof error === "object" && error !== null
      ? (error as { body?: unknown }).body
      : undefined;
  const bodyText =
    typeof body === "string"
      ? body
      : body !== undefined
        ? JSON.stringify(body)
        : "";
  const message = error instanceof Error ? error.message : String(error);
  return /not[_ ]a[_ ]contact/i.test(`${message} ${bodyText}`);
}

/** Re-handshake ping the plugin daemon sends; never inject it into the agent. */
const RESET_SENTINEL = "\x01tp-rehandshake\x01";

/**
 * Inbound half of the wrapper's tiny.place connection: polls the relay for
 * Signal-E2E DMs from the configured owner (OpenHuman) and injects them into the
 * live agent process the wrapper spawned, so a message sent from OpenHuman
 * appears as a typed+submitted prompt in the running codex/claude session.
 *
 * The outbound `SessionEnvelopePublisher` already streams the agent's turns back,
 * so together they form a full bidirectional bridge with no plugin.
 *
 * Reuses the publisher's memoized context (one client / FileSessionStore / ratchet)
 * and the SDK primitives `publishKeys` (be messageable) + `readMessages` (decrypt).
 */
export class InboundMessageReceiver {
  // Debounce between typing the body and sending the distinct Enter, mirroring
  // the interactive TUI (tui.ts injectOne) so the agent TUI doesn't swallow the
  // carriage return as part of a bracketed paste.
  private static readonly INJECT_ENTER_DELAY_MS = 150;

  private sink: ((text: string) => void) | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private draining = false;
  private ownerAddress: string | undefined;
  // Serialize injected turns so a batched poll never interleaves them: each
  // body → Enter pair completes before the next body types.
  private injectionQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly config: HarnessWrapperConfig,
    private readonly publisher: SessionEnvelopePublisher,
    private readonly stderr: Writable,
  ) {}

  /** Register the agent-input writer once the child is spawned. Injection is a
   *  no-op until this is set, so the poll loop can start before the child. */
  public setSink(write: (text: string) => void): void {
    this.sink = write;
  }

  public async start(): Promise<void> {
    if (!this.config.receiveEnabled || this.config.dryRun) {
      return;
    }
    const ctx = await this.publisher.getContext();
    if (!ctx.signer) {
      this.stderr.write(
        `tinyplace ${this.config.provider}: inbound receive needs a tiny.place signer (unlock or set TINYPLACE_SECRET_KEY); receive disabled\n`,
      );
      return;
    }
    // Publish our Signal key bundle so the owner can open a session to us — the
    // wrapper never did this before, which is why it was un-messageable.
    try {
      await publishKeys(ctx.client, ctx.signer);
    } catch (error) {
      this.stderr.write(
        `tinyplace ${this.config.provider}: failed to publish Signal keys: ${describeError(error)}\n`,
      );
    }
    // Also register a directory card. publishKeys makes us *messageable* (prekey
    // bundle) but not *discoverable*: a peer that resolves us by lookup —
    // OpenHuman's `signal send` hits /directory/agents/<id> — 404s without a
    // card, so first contact from the owner fails. Best-effort; a card failure
    // must not stop the inbound poll from starting.
    try {
      await publishCard(ctx.client, ctx.signer, {
        name: `tinyplace ${this.config.provider}`,
        description: `coding-agent bridge (${this.config.provider}) → OpenHuman`,
      });
    } catch (error) {
      this.stderr.write(
        `tinyplace ${this.config.provider}: failed to publish directory card: ${describeError(error)}\n`,
      );
    }
    if (this.config.receiveFrom) {
      try {
        this.ownerAddress = await resolveRecipientKey(
          ctx.client,
          this.config.receiveFrom,
        );
        await this.ensureOwnerContact(ctx, this.ownerAddress);
      } catch (error) {
        this.stderr.write(
          `tinyplace ${this.config.provider}: could not set up inbound owner ${this.config.receiveFrom}: ${describeError(error)}\n`,
        );
      }
    }
    bridgeLog("receiver.start", {
      agentId: ctx.signer.agentId,
      ownerAddress: this.ownerAddress,
      receiveFrom: this.config.receiveFrom,
      pollMs: this.config.receivePollMs,
    });
    this.timer = setInterval(() => void this.poll(), this.config.receivePollMs);
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    try {
      await this.poll();
    } catch {
      // best-effort final drain
    }
    // Let any queued body → Enter injections finish before we tear down.
    await this.injectionQueue;
  }

  /** Accept the owner contact so inbound DMs are not 403'd by the relay. */
  private async ensureOwnerContact(
    ctx: Awaited<ReturnType<typeof makeContext>>,
    owner: string,
  ): Promise<void> {
    if (!ctx.signer || owner === ctx.signer.agentId) {
      return;
    }
    // Request first (idempotent; auto-accepts a reverse-pending request), then
    // read status — never pre-check, since a fresh relationship 404s.
    await ctx.client.contacts.request(owner);
    const status = await ctx.client.contacts.status(owner);
    if (status.status === "blocked") {
      this.stderr.write(
        `tinyplace ${this.config.provider}: inbound owner ${owner} is blocked; unblock to receive\n`,
      );
      return;
    }
    if (status.status !== "accepted") {
      this.stderr.write(
        `tinyplace ${this.config.provider}: contact with ${owner} pending; approve it in OpenHuman to receive inbound\n`,
      );
    }
  }

  private async poll(): Promise<void> {
    if (this.draining || !this.sink) {
      return;
    }
    this.draining = true;
    try {
      const ctx = await this.publisher.getContext();
      if (!ctx.signer) {
        return;
      }
      const messages = await readMessages(ctx.client, ctx.signer, {
        limit: 50,
      });
      let injected = 0;
      let dropped = 0;
      for (const message of messages) {
        const text = this.filterAndParse(message);
        // `this.sink` is guaranteed defined here — poll() returns early when it
        // is not. injectOne re-guards it before each write regardless.
        if (text !== undefined) {
          injected += 1;
          // Record before injecting so the tailer's echoed-back `user` line
          // (the agent logs the injected prompt as its own user turn) is dropped
          // by the publisher instead of bouncing to the owner.
          this.publisher.markInjected(text);
          // Type the body now, then submit with a DISTINCT carriage return after
          // a short debounce (see injectOne). Enqueued so batched inbound turns
          // stay serialized (body → Enter → next body) and never interleave.
          this.enqueueInjection(text);
        } else {
          dropped += 1;
        }
      }
      if (messages.length > 0) {
        bridgeLog("receiver.poll", {
          read: messages.length,
          injected,
          dropped,
        });
      }
    } catch (error) {
      // transient relay / decrypt hiccup — retry on the next tick
      bridgeLog("receiver.poll.error", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.draining = false;
    }
  }

  /** Chain an injection onto the serial queue so batched inbound turns keep
   *  their boundaries (body → Enter → next body), never interleaving. */
  private enqueueInjection(text: string): void {
    this.injectionQueue = this.injectionQueue
      .then(() => this.injectOne(text))
      .catch(() => {});
  }

  /** Type one inbound turn, then send the carriage return as a SEPARATE write
   *  after a short debounce. Writing "text\r" in one chunk makes the agent TUI
   *  (codex/claude) treat the burst as a bracketed paste and swallow the CR, so
   *  the prompt parks unsubmitted; a distinct CR after the paste settles submits
   *  it. Mirrors the interactive TUI's injectOne. */
  private async injectOne(text: string): Promise<void> {
    if (this.sink) {
      this.sink(text);
    }
    await delay(InboundMessageReceiver.INJECT_ENTER_DELAY_MS);
    if (this.sink) {
      this.sink("\r");
    }
  }

  /** Decide whether a received DM should be injected, and extract its text.
   *  Returns undefined to drop the message. */
  private filterAndParse(message: ReadMessage): string | undefined {
    // Owner-scoped: never inject a message from anyone but the configured owner.
    if (this.ownerAddress && message.from !== this.ownerAddress) {
      return undefined;
    }
    const raw = message.text;
    if (raw === RESET_SENTINEL) {
      return undefined;
    }
    if (!raw.trimStart().startsWith("{")) {
      return raw; // plaintext DM
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return raw; // looked like JSON but isn't — treat as plaintext
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { envelope_version?: unknown }).envelope_version !==
        SESSION_ENVELOPE_VERSION_V1
    ) {
      return raw;
    }
    // `tp.auto` is a plugin extension (not on the typed SessionEnvelope); read it
    // loosely. Drop auto/echo turns so the bridge never ping-pongs.
    const obj = parsed as Record<string, unknown>;
    const tpAuto = (obj.tp as { auto?: unknown } | undefined)?.auto;
    const messageObj = obj.message as
      | { text?: unknown; tp?: { auto?: unknown } }
      | undefined;
    if (tpAuto || messageObj?.tp?.auto) {
      return undefined;
    }
    return typeof messageObj?.text === "string" ? messageObj.text : undefined;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

class TerminalEnvelopeWriter {
  private sequence = 0;
  public pid: number | undefined;
  public pty = false;

  public constructor(
    private readonly config: HarnessWrapperConfig,
    private readonly cwd: string,
    private readonly dryRunOutput: Writable,
  ) {}

  public write(stream: StreamName, text: string): void {
    const timestamp = new Date();
    const bucketStart = floorTimestamp(timestamp, this.config.bucket);
    const bucketEnd = addBucket(bucketStart, this.config.bucket);
    const sequence = this.sequence;
    this.sequence += 1;
    const envelope: TerminalEnvelope = {
      envelope_version: PROFILES[this.config.provider].terminalEnvelopeVersion,
      bucket: {
        unit: this.config.bucket,
        start: formatTimestamp(bucketStart),
        end: formatTimestamp(bucketEnd),
      },
      scope: {
        type: this.config.scope,
        key: this.scopeKey(),
        cwd: this.cwd,
        wrapper_session_id: this.config.wrapperSessionId,
      },
      event: {
        id: stableEventId(this.config.wrapperSessionId, stream, sequence, text),
        sequence,
        stream,
        timestamp: formatTimestamp(timestamp),
        text,
      },
      harness: {
        provider: this.config.provider,
        argv: this.config.agentArgs,
        command: this.config.agentBin,
        ...(this.pid === undefined ? {} : { pid: this.pid }),
        pty: this.pty,
      },
    };
    envelope[this.config.provider] = {
      argv: this.config.agentArgs,
      command: this.config.agentBin,
      ...(this.pid === undefined ? {} : { pid: this.pid }),
      pty: this.pty,
    };
    this.writeEnvelope(envelope);
  }

  private writeEnvelope(envelope: TerminalEnvelope): void {
    const encoded = `${JSON.stringify(envelope)}\n`;
    if (this.config.dryRun) {
      this.dryRunOutput.write(encoded);
      return;
    }
    const target = this.outputPath(envelope);
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, encoded, { encoding: "utf8", flag: "a" });
  }

  private outputPath(envelope: TerminalEnvelope): string {
    const bucketStart = new Date(envelope.bucket.start);
    const fileName = bucketFileName(bucketStart, this.config.bucket);
    if (this.config.scope === "session") {
      return join(
        this.config.outDir,
        "sessions",
        safeSlug(this.config.wrapperSessionId),
        fileName,
      );
    }
    return join(
      this.config.outDir,
      "folders",
      safeSlug(this.scopeKey()),
      fileName,
    );
  }

  private scopeKey(): string {
    if (this.config.scope === "session") {
      return this.config.wrapperSessionId;
    }
    const digest = createHash("sha256")
      .update(this.cwd)
      .digest("hex")
      .slice(0, 12);
    return `${basename(this.cwd) || "root"}-${digest}`;
  }
}

function configureRawInput(stdin: NodeJS.ReadableStream): () => void {
  const maybeRaw = stdin as NodeJS.ReadStream;
  if (!maybeRaw.isTTY || typeof maybeRaw.setRawMode !== "function") {
    return () => {};
  }
  const wasRaw = maybeRaw.isRaw;
  maybeRaw.setRawMode(true);
  maybeRaw.resume();
  return () => {
    maybeRaw.setRawMode(Boolean(wasRaw));
  };
}

function restoreInput(
  stdin: NodeJS.ReadableStream,
  onInput: ((chunk: Buffer | string) => void) | undefined,
): void {
  if (onInput) {
    stdin.off("data", onInput);
  }
}

function childEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const merged: Record<string, string | undefined> = {
    ...process.env,
    ...env,
    TERM: terminalName(env),
  };
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function terminalName(env: Record<string, string | undefined>): string {
  const value = env.TERM ?? process.env.TERM;
  return value && value !== "dumb" ? value : "xterm-256color";
}

function terminalColumns(stdout: Writable): number {
  const columns =
    (stdout as { columns?: number }).columns ?? process.stdout.columns ?? 80;
  return Math.max(20, columns);
}

function terminalRows(stdout: Writable): number {
  const rows = (stdout as { rows?: number }).rows ?? process.stdout.rows ?? 24;
  return Math.max(5, rows);
}

function fixNodePtyHelperPermissions(): void {
  let packageDir: string;
  try {
    packageDir = dirname(requireForHarness.resolve("node-pty/package.json"));
  } catch {
    return;
  }
  for (const helperPath of [
    join(packageDir, "build", "Release", "spawn-helper"),
    join(
      packageDir,
      "prebuilds",
      `${process.platform}-${process.arch}`,
      "spawn-helper",
    ),
  ]) {
    if (!existsSync(helperPath)) {
      continue;
    }
    chmodSync(helperPath, 0o755);
  }
}

function listSessionFiles(config: HarnessWrapperConfig): Array<string> {
  if (!existsSync(config.sessionsDir)) {
    return [];
  }
  const profile = PROFILES[config.provider];
  const out: Array<string> = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".jsonl") &&
        (!profile.sessionFilePrefix ||
          entry.name.startsWith(profile.sessionFilePrefix))
      ) {
        out.push(path);
      }
    }
  };
  visit(config.sessionsDir);
  return out;
}

function readSessionMeta(
  provider: HarnessProvider,
  path: string,
): SessionMeta | undefined {
  // A claude session can open with a cwd-less record (e.g. `type:"last-prompt"`
  // on a resumed session). Returning on that first line would yield a meta with
  // no `cwd`, which `locateSession` rejects (`meta.cwd === this.cwd`) — silently
  // orphaning the whole (correct) session so the tailer never streams. Remember
  // the id from such lines but keep scanning for one that records the cwd.
  let claudeFallbackId: string | undefined;
  for (const raw of readAllLines(path)) {
    const record = parseJsonObject(raw);
    if (!record) {
      continue;
    }
    if (provider === "codex" && record.type === "session_meta") {
      const payload = asObject(record.payload);
      if (!payload) {
        continue;
      }
      const sessionId =
        asString(payload.id) ?? asString(payload.session_id) ?? basename(path);
      return {
        ...(asString(payload.cwd) ? { cwd: asString(payload.cwd) } : {}),
        sessionId,
      };
    }
    if (provider === "claude") {
      const cwd = asString(record.cwd);
      const sessionId = asString(record.sessionId);
      if (!cwd) {
        claudeFallbackId ??= sessionId;
        continue;
      }
      return { cwd, sessionId: sessionId ?? basename(path, ".jsonl") };
    }
  }
  // No cwd-bearing line found. Surface any id we saw so a directly-specified
  // session file still resolves (locate-by-cwd simply won't match this one).
  if (claudeFallbackId) {
    return { sessionId: claudeFallbackId };
  }
  return undefined;
}

function readNewLines(
  path: string,
  lineOffset: number,
): Array<{ line: number; raw: string }> {
  return readAllLines(path)
    .map((raw, index) => ({ line: index + 1, raw }))
    .filter((entry) => entry.line > lineOffset);
}

/**
 * Resolve a path to a stable identity for equality checks: symlinks + relative
 * segments collapsed. Falls back to `resolve()` (absolute, no symlink walk) when
 * the file doesn't exist yet, so callers still get a normalized comparison key.
 */
function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function readAllLines(path: string): Array<string> {
  try {
    return readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function semanticMessagesFromLine(
  provider: HarnessProvider,
  raw: string,
  line: number,
): Array<SemanticMessage> {
  return provider === "claude"
    ? claudeSemanticMessagesFromLine(raw, line)
    : codexSemanticMessagesFromLine(raw, line);
}

function codexSemanticMessagesFromLine(
  raw: string,
  line: number,
): Array<SemanticMessage> {
  const record = parseJsonObject(raw);
  if (!record) {
    return [];
  }
  const timestamp = parseRecordTimestamp(record.timestamp);
  const payload = asObject(record.payload);
  if (!payload) {
    return [];
  }

  if (record.type === "event_msg" && payload.type === "user_message") {
    const text = asString(payload.message);
    if (!text) {
      return [];
    }
    return [
      {
        line,
        recordType: "event_msg",
        role: "user",
        text,
        timestamp,
      },
    ];
  }

  if (
    record.type === "response_item" &&
    payload.type === "message" &&
    payload.role === "assistant"
  ) {
    const text = textFromContent(
      payload.content,
      new Set(["output_text", "text"]),
    );
    if (!text) {
      return [];
    }
    return [
      {
        line,
        ...(asString(payload.phase) ? { phase: asString(payload.phase) } : {}),
        recordType: "response_item",
        role: "agent",
        sourceRole: "assistant",
        text,
        timestamp,
      },
    ];
  }

  return [];
}

function claudeSemanticMessagesFromLine(
  raw: string,
  line: number,
): Array<SemanticMessage> {
  const record = parseJsonObject(raw);
  if (!record) {
    return [];
  }
  const timestamp = parseRecordTimestamp(record.timestamp);
  const message = asObject(record.message);
  if (!message) {
    return [];
  }
  const sourceRole = asString(message.role);
  if (record.type === "user" && sourceRole === "user") {
    const text = claudeUserText(message.content);
    if (!text) {
      return [];
    }
    return [
      {
        line,
        recordType: "user",
        role: "user",
        sourceRole,
        text,
        timestamp,
      },
    ];
  }
  if (record.type === "assistant" && sourceRole === "assistant") {
    const text = textFromContent(message.content, new Set(["text"]));
    if (!text) {
      return [];
    }
    return [
      {
        line,
        recordType: "assistant",
        role: "agent",
        sourceRole,
        text,
        timestamp,
      },
    ];
  }
  return [];
}

function claudeUserText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .flatMap((item) => {
      const object = asObject(item);
      if (!object || object.type !== "text") {
        return [];
      }
      const text = asString(object.text);
      return text ? [text] : [];
    })
    .join("\n");
}

function textFromContent(content: unknown, allowedTypes: Set<string>): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .flatMap((item) => {
      const object = asObject(item);
      if (!object || !allowedTypes.has(String(object.type))) {
        return [];
      }
      const text = asString(object.text);
      return text ? [text] : [];
    })
    .join("\n");
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return asObject(parsed) ?? undefined;
  } catch {
    return undefined;
  }
}

function parseRecordTimestamp(value: unknown): Date {
  if (typeof value !== "string") {
    return new Date();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// Env-configured positive-millisecond knob: fall back to the default unless the
// var parses to a finite value > 0. This rejects the three ways a bad env var
// would otherwise poison a timer — unset, non-numeric (`Number("abc")` → NaN),
// blank (`Number("")`/`Number(" ")` → 0), and negative — any of which would
// disable the idle/heartbeat tick or spin a 0 ms poll loop.
function numberEnvOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requiredValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parsePositiveInteger(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseBucket(value: string): HarnessBucketUnit {
  if (value === "minute" || value === "hour" || value === "day") {
    return value;
  }
  throw new Error("--tinyplace-bucket must be minute, hour, or day");
}

function parseScope(value: string): HarnessEnvelopeScope {
  if (value === "folder" || value === "session") {
    return value;
  }
  throw new Error("--tinyplace-scope must be folder or session");
}

function floorTimestamp(value: Date, unit: HarnessBucketUnit): Date {
  const out = new Date(value);
  out.setUTCSeconds(0, 0);
  if (unit === "minute") {
    return out;
  }
  out.setUTCMinutes(0, 0, 0);
  if (unit === "hour") {
    return out;
  }
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function addBucket(value: Date, unit: HarnessBucketUnit): Date {
  const out = new Date(value);
  if (unit === "minute") {
    out.setUTCMinutes(out.getUTCMinutes() + 1);
  } else if (unit === "hour") {
    out.setUTCHours(out.getUTCHours() + 1);
  } else {
    out.setUTCDate(out.getUTCDate() + 1);
  }
  return out;
}

function bucketFileName(value: Date, unit: HarnessBucketUnit): string {
  const year = value.getUTCFullYear();
  const month = pad2(value.getUTCMonth() + 1);
  const day = pad2(value.getUTCDate());
  const hour = pad2(value.getUTCHours());
  const minute = pad2(value.getUTCMinutes());
  if (unit === "minute") {
    return `${year}-${month}-${day}T${hour}-${minute}Z.jsonl`;
  }
  if (unit === "hour") {
    return `${year}-${month}-${day}T${hour}Z.jsonl`;
  }
  return `${year}-${month}-${day}.jsonl`;
}

function stableEventId(
  sessionId: string,
  stream: string,
  sequence: number,
  text: string,
): string {
  return createHash("sha256")
    .update(`${sessionId}\0${stream}\0${sequence}\0${text}`)
    .digest("hex");
}

function formatTimestamp(value: Date): string {
  return value.toISOString();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function safeSlug(value: string): string {
  return (
    value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"
  );
}

function firstEnv(
  env: Record<string, string | undefined>,
  names: Array<string>,
): string | undefined {
  return names
    .filter((name) => name.length > 0)
    .map((name) => env[name])
    .find((value) => value !== undefined && value !== "");
}

function configuredRecipient(
  provider: HarnessProvider,
  env: Record<string, string | undefined>,
): string | undefined {
  return firstEnv(env, [
    `TINYPLACE_${provider.toUpperCase()}_DM_TO`,
    "TINYPLACE_HARNESS_DM_TO",
    "TINYPLACE_OPENHUMAN_OWNER",
    "OPENHUMAN_OWNER_AGENT",
  ]);
}
