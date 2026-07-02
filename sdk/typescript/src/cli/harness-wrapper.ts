import { spawn as spawnChild } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { basename, join, resolve } from "node:path";

import { resolveRecipientKey, sendMessage } from "../agent/messaging.js";
import {
  SESSION_ENVELOPE_VERSION_V1,
  type HarnessBucketUnit,
  type HarnessEnvelopeScope,
  type HarnessMessageRole,
  type HarnessProvider,
  type SessionEnvelope,
} from "../types/harness.js";
import { makeContext } from "./context.js";
import type { TinyPlaceCliOptions, TinyPlaceCliResult } from "./types.js";
import type { Writable } from "node:stream";

type StreamName = "input" | "output" | "error" | "lifecycle";

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
  outDir: string;
  provider: HarnessProvider;
  sessionFile?: string;
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
  const launch = buildAgentLaunch(config);

  writer.write("lifecycle", `start ${launch.command} ${launch.args.join(" ")}`.trim());
  sessionTailer?.start(new Date());

  const child = spawnFn(launch.command, launch.args, {
    cwd,
    env: { ...process.env, ...env, TERM: env.TERM ?? process.env.TERM ?? "xterm-256color" },
  });

  if (child.pid !== undefined) {
    writer.pid = child.pid;
  }
  child.stdin.on("error", () => {});

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
      stdio.stderr.write(`tinyplace ${provider}: failed to start ${config.agentBin}: ${error.message}\n`);
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

  stdio.stdin.off("data", onInput);
  restoreRawMode();
  const dmFailures = (await sessionTailer?.stop()) ?? 0;

  return { code: exitCode === 0 && dmFailures > 0 ? 1 : exitCode, stdout: "", stderr: "" };
}

export function parseHarnessWrapperArgs(
  provider: HarnessProvider,
  argv: Array<string>,
  env: Record<string, string | undefined> = process.env,
): HarnessWrapperConfig {
  const profile = PROFILES[provider];
  const agentArgs: Array<string> = [];
  const outDir =
    firstEnv(env, [`TINYPLACE_${provider.toUpperCase()}_ENVELOPES`, "TINYPLACE_HARNESS_ENVELOPES"]) ??
    profile.defaultOutDir;
  const config: HarnessWrapperConfig = {
    agentArgs,
    agentBin: firstEnv(env, profile.binEnv) ?? profile.defaultBin,
    bucket: "hour",
    captureError: true,
    captureInput: true,
    captureOutput: true,
    captureSession: true,
    ...(configuredRecipient(provider, env) ? { dmRecipient: configuredRecipient(provider, env) } : {}),
    dryRun: false,
    outDir,
    provider,
    sessionPollMs: Number(
      firstEnv(env, [
        `TINYPLACE_${provider.toUpperCase()}_SESSION_POLL_MS`,
        "TINYPLACE_HARNESS_SESSION_POLL_MS",
      ]) ?? 500,
    ),
    sessionsDir:
      firstEnv(env, [
        `TINYPLACE_${provider.toUpperCase()}_SESSIONS_DIR`,
        provider === "claude" ? "TINYVERSE_CLAUDE_SESSIONS_DIR" : "",
        "TINYPLACE_HARNESS_SESSIONS_DIR",
      ]) ?? profile.defaultSessionsDir,
    sessionTailGraceMs: Number(
      firstEnv(env, [
        `TINYPLACE_${provider.toUpperCase()}_SESSION_TAIL_GRACE_MS`,
        "TINYPLACE_HARNESS_SESSION_TAIL_GRACE_MS",
      ]) ?? 750,
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
        config.sessionPollMs = parsePositiveInteger(token, requiredValue(token, next));
        index += 1;
        break;
      case "--tinyplace-session-tail-grace-ms":
        config.sessionTailGraceMs = parsePositiveInteger(token, requiredValue(token, next));
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

export function asCodexWrapperConfig(config: HarnessWrapperConfig): CodexWrapperConfig {
  return {
    ...config,
    codexArgs: config.agentArgs,
    codexBin: config.agentBin,
  };
}

function buildAgentLaunch(config: HarnessWrapperConfig): {
  args: Array<string>;
  command: string;
  pty: boolean;
} {
  if (config.usePty && platform() === "darwin") {
    return {
      command: "script",
      args: ["-q", "/dev/null", config.agentBin, ...config.agentArgs],
      pty: true,
    };
  }
  return { command: config.agentBin, args: config.agentArgs, pty: false };
}

class HarnessSessionTailer {
  private ignoredSessionFiles = new Set<string>();
  private lineOffset = 0;
  private startedAt: Date | undefined;
  private sessionFile: string | undefined;
  private sessionMeta: SessionMeta | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    private readonly config: HarnessWrapperConfig,
    private readonly cwd: string,
    private readonly dryRunOutput: Writable,
    private readonly publisher: SessionEnvelopePublisher,
  ) {}

  public start(startedAt: Date): void {
    this.startedAt = startedAt;
    this.ignoredSessionFiles = new Set(listSessionFiles(this.config));
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
      this.lineOffset = 0;
    }

    const lines = readNewLines(this.sessionFile, this.lineOffset);
    this.lineOffset += lines.length;
    for (const { line, raw } of lines) {
      for (const message of semanticMessagesFromLine(this.config.provider, raw, line)) {
        this.write(message);
      }
    }
  }

  private locateSession(startedAt: Date): { meta: SessionMeta; path: string } | undefined {
    if (this.config.sessionFile) {
      const meta = readSessionMeta(this.config.provider, this.config.sessionFile) ?? {
        sessionId: basename(this.config.sessionFile),
      };
      return { meta, path: this.config.sessionFile };
    }

    const candidates = listSessionFiles(this.config)
      .filter((path) => !this.ignoredSessionFiles.has(path))
      .filter((path) => {
        try {
          return statSync(path).mtimeMs >= startedAt.getTime() - 2_000;
        } catch {
          return false;
        }
      })
      .map((path) => ({ meta: readSessionMeta(this.config.provider, path), path }))
      .filter((entry): entry is { meta: SessionMeta; path: string } => {
        return entry.meta?.cwd === this.cwd;
      })
      .sort((left, right) => statSync(right.path).mtimeMs - statSync(left.path).mtimeMs);
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
        id: stableEventId(this.sessionMeta.sessionId, message.role, message.line, message.text),
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
    this.writeEnvelope(envelope);
    this.publisher.publish(envelope);
  }

  private writeEnvelope(envelope: SessionEnvelope): void {
    const encoded = `${JSON.stringify(envelope)}\n`;
    if (this.config.dryRun) {
      this.dryRunOutput.write(encoded);
      return;
    }
    const target = this.outputPath(envelope);
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, encoded, { encoding: "utf8", flag: "a" });
  }

  private outputPath(envelope: SessionEnvelope): string {
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
    return join(this.config.outDir, "messages", "folders", safeSlug(this.scopeKey()), fileName);
  }

  private scopeKey(): string {
    if (this.config.scope === "session") {
      return this.config.wrapperSessionId;
    }
    const digest = createHash("sha256").update(this.cwd).digest("hex").slice(0, 12);
    return `${basename(this.cwd) || "root"}-${digest}`;
  }
}

class SessionEnvelopePublisher {
  private contactPromise: Promise<string> | undefined;
  private contextPromise:
    | ReturnType<typeof makeContext>
    | undefined;
  private failures = 0;
  private pending = new Set<Promise<void>>();
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly config: HarnessWrapperConfig,
    private readonly options: TinyPlaceCliOptions,
    private readonly stderr: Writable,
  ) {}

  public publish(envelope: SessionEnvelope): void {
    if (!this.config.dmRecipient || this.config.dryRun) {
      return;
    }
    const run = this.queue
      .then(() => this.publishNow(envelope))
      .catch((error: unknown) => {
        this.failures += 1;
        this.stderr.write(
          `tinyplace ${this.config.provider}: failed to DM session envelope ${envelope.message.id}: ${
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

  private async publishNow(envelope: SessionEnvelope): Promise<void> {
    const ctx = await this.context();
    if (!ctx.signer) {
      throw new Error("DM forwarding requires a tiny.place signer");
    }
    const recipient = await this.ensureContact(ctx);
    try {
      await sendMessage(ctx.client, ctx.signer, recipient, JSON.stringify(envelope));
    } catch (error) {
      if (!isNotAContactError(error)) {
        throw error;
      }
      this.contactPromise = undefined;
      const refreshedRecipient = await this.ensureContact(ctx);
      await sendMessage(ctx.client, ctx.signer, refreshedRecipient, JSON.stringify(envelope));
    }
  }

  private context(): ReturnType<typeof makeContext> {
    this.contextPromise ??= makeContext(this.options);
    return this.contextPromise;
  }

  private ensureContact(ctx: Awaited<ReturnType<typeof makeContext>>): Promise<string> {
    this.contactPromise ??= this.ensureContactNow(ctx);
    return this.contactPromise;
  }

  private async ensureContactNow(ctx: Awaited<ReturnType<typeof makeContext>>): Promise<string> {
    if (!ctx.signer) {
      throw new Error("DM forwarding requires a tiny.place signer");
    }
    const recipient = await resolveRecipientKey(ctx.client, this.config.dmRecipient ?? "");
    if (recipient === ctx.signer.publicKeyBase64) {
      return recipient;
    }

    const before = await ctx.client.contacts.status(recipient);
    if (before.status === "accepted") {
      return recipient;
    }
    if (before.status === "blocked") {
      throw new Error(`tiny.place contact blocked for ${recipient}; unblock before DM forwarding`);
    }

    await ctx.client.contacts.request(recipient);
    const after = await ctx.client.contacts.status(recipient);
    if (after.status === "accepted") {
      return recipient;
    }
    if (after.status === "blocked") {
      throw new Error(`tiny.place contact blocked for ${recipient}; unblock before DM forwarding`);
    }
    throw new Error(
      `tiny.place contact request pending for ${recipient}; approve it in OpenHuman before DM forwarding`,
    );
  }
}

function isNotAContactError(error: unknown): boolean {
  const body = typeof error === "object" && error !== null ? (error as { body?: unknown }).body : undefined;
  const bodyText =
    typeof body === "string" ? body : body !== undefined ? JSON.stringify(body) : "";
  const message = error instanceof Error ? error.message : String(error);
  return /not[_ ]a[_ ]contact/i.test(`${message} ${bodyText}`);
}

class TerminalEnvelopeWriter {
  private sequence = 0;
  public pid: number | undefined;

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
        pty: this.config.usePty && platform() === "darwin",
      },
    };
    envelope[this.config.provider] = {
      argv: this.config.agentArgs,
      command: this.config.agentBin,
      ...(this.pid === undefined ? {} : { pid: this.pid }),
      pty: this.config.usePty && platform() === "darwin",
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
      return join(this.config.outDir, "sessions", safeSlug(this.config.wrapperSessionId), fileName);
    }
    return join(this.config.outDir, "folders", safeSlug(this.scopeKey()), fileName);
  }

  private scopeKey(): string {
    if (this.config.scope === "session") {
      return this.config.wrapperSessionId;
    }
    const digest = createHash("sha256").update(this.cwd).digest("hex").slice(0, 12);
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
        (!profile.sessionFilePrefix || entry.name.startsWith(profile.sessionFilePrefix))
      ) {
        out.push(path);
      }
    }
  };
  visit(config.sessionsDir);
  return out;
}

function readSessionMeta(provider: HarnessProvider, path: string): SessionMeta | undefined {
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
      const sessionId = asString(payload.id) ?? asString(payload.session_id) ?? basename(path);
      return {
        ...(asString(payload.cwd) ? { cwd: asString(payload.cwd) } : {}),
        sessionId,
      };
    }
    if (provider === "claude") {
      const sessionId = asString(record.sessionId) ?? basename(path, ".jsonl");
      return {
        ...(asString(record.cwd) ? { cwd: asString(record.cwd) } : {}),
        sessionId,
      };
    }
  }
  return undefined;
}

function readNewLines(path: string, lineOffset: number): Array<{ line: number; raw: string }> {
  return readAllLines(path)
    .map((raw, index) => ({ line: index + 1, raw }))
    .filter((entry) => entry.line > lineOffset);
}

function readAllLines(path: string): Array<string> {
  try {
    return readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.length > 0);
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

function codexSemanticMessagesFromLine(raw: string, line: number): Array<SemanticMessage> {
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

  if (record.type === "response_item" && payload.type === "message" && payload.role === "assistant") {
    const text = textFromContent(payload.content, new Set(["output_text", "text"]));
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

function claudeSemanticMessagesFromLine(raw: string, line: number): Array<SemanticMessage> {
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

function stableEventId(sessionId: string, stream: string, sequence: number, text: string): string {
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
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
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
