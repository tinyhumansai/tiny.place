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

import type { TinyPlaceCliOptions, TinyPlaceCliResult } from "./types.js";
import type { Writable } from "node:stream";

type BucketUnit = "minute" | "hour" | "day";
type EnvelopeScope = "folder" | "session";
type StreamName = "input" | "output" | "error" | "lifecycle";
type SemanticRole = "user" | "assistant";

interface CodexWrapperConfig {
  bucket: BucketUnit;
  captureInput: boolean;
  captureOutput: boolean;
  captureError: boolean;
  captureSession: boolean;
  codexArgs: Array<string>;
  codexBin: string;
  dryRun: boolean;
  outDir: string;
  sessionFile?: string;
  sessionPollMs: number;
  sessionsDir: string;
  sessionTailGraceMs: number;
  scope: EnvelopeScope;
  usePty: boolean;
  wrapperSessionId: string;
}

interface TerminalEnvelope {
  envelope_version: "tinyplace.codex.terminal.v1";
  bucket: {
    unit: BucketUnit;
    start: string;
    end: string;
  };
  scope: {
    type: EnvelopeScope;
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
  codex: {
    argv: Array<string>;
    command: string;
    pid?: number;
    pty: boolean;
  };
}

const ENVELOPE_VERSION = "tinyplace.codex.terminal.v1" as const;
const SESSION_ENVELOPE_VERSION = "tinyplace.codex.session.v1" as const;

export async function runCodexCommand(
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const config = parseCodexWrapperArgs(argv, env);
  const spawnFn = options.spawn ?? spawnChild;
  const stdio = {
    stdin: options.stdin ?? process.stdin,
    stdout: options.stdout ?? process.stdout,
    stderr: options.stderr ?? process.stderr,
  };
  const writer = new TerminalEnvelopeWriter(config, cwd, stdio.stderr);
  const sessionTailer = config.captureSession
    ? new CodexSessionTailer(config, cwd, stdio.stderr)
    : undefined;
  const launch = buildCodexLaunch(config);

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
      stdio.stderr.write(`tinyplace codex: failed to start ${config.codexBin}: ${error.message}\n`);
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
  await sessionTailer?.stop();

  return { code: exitCode, stdout: "", stderr: "" };
}

export function parseCodexWrapperArgs(
  argv: Array<string>,
  env: Record<string, string | undefined> = process.env,
): CodexWrapperConfig {
  const codexArgs: Array<string> = [];
  const outDir = env.TINYPLACE_CODEX_ENVELOPES ?? join(homedir(), ".tinyplace", "codex-envelopes");
  const config: CodexWrapperConfig = {
    bucket: "hour",
    captureInput: true,
    captureOutput: true,
    captureError: true,
    captureSession: true,
    codexArgs,
    codexBin: env.TINYPLACE_CODEX_BIN ?? "codex",
    dryRun: false,
    outDir,
    sessionPollMs: Number(env.TINYPLACE_CODEX_SESSION_POLL_MS ?? 500),
    sessionsDir: env.TINYPLACE_CODEX_SESSIONS_DIR ?? join(homedir(), ".codex", "sessions"),
    sessionTailGraceMs: Number(env.TINYPLACE_CODEX_SESSION_TAIL_GRACE_MS ?? 750),
    scope: "folder",
    usePty: true,
    wrapperSessionId: `tp-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--") {
      codexArgs.push(...argv.slice(index + 1));
      break;
    }
    if (!token.startsWith("--tinyplace-")) {
      codexArgs.push(token);
      continue;
    }
    const next = argv[index + 1];
    switch (token) {
      case "--tinyplace-bucket":
        config.bucket = parseBucket(requiredValue(token, next));
        index += 1;
        break;
      case "--tinyplace-codex-bin":
        config.codexBin = requiredValue(token, next);
        index += 1;
        break;
      case "--tinyplace-dry-run":
        config.dryRun = true;
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
        throw new Error(`unknown tinyplace codex wrapper flag: ${token}`);
    }
  }

  return config;
}

function buildCodexLaunch(config: CodexWrapperConfig): {
  args: Array<string>;
  command: string;
  pty: boolean;
} {
  if (config.usePty && platform() === "darwin") {
    return {
      command: "script",
      args: ["-q", "/dev/null", config.codexBin, ...config.codexArgs],
      pty: true,
    };
  }
  return { command: config.codexBin, args: config.codexArgs, pty: false };
}

interface CodexSessionMeta {
  cwd?: string;
  sessionId: string;
}

interface SemanticMessage {
  line: number;
  phase?: string;
  recordType: string;
  role: SemanticRole;
  text: string;
  timestamp: Date;
}

interface SessionEnvelope {
  envelope_version: "tinyplace.codex.session.v1";
  bucket: {
    unit: BucketUnit;
    start: string;
    end: string;
  };
  scope: {
    type: EnvelopeScope;
    key: string;
    cwd: string;
    wrapper_session_id: string;
    codex_session_id: string;
  };
  message: {
    id: string;
    line: number;
    phase?: string;
    role: SemanticRole;
    text: string;
    timestamp: string;
  };
  source: {
    path: string;
    record_type: string;
  };
}

class CodexSessionTailer {
  private ignoredSessionFiles = new Set<string>();
  private lineOffset = 0;
  private startedAt: Date | undefined;
  private sessionFile: string | undefined;
  private sessionMeta: CodexSessionMeta | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    private readonly config: CodexWrapperConfig,
    private readonly cwd: string,
    private readonly dryRunOutput: Writable,
  ) {}

  public start(startedAt: Date): void {
    this.startedAt = startedAt;
    this.ignoredSessionFiles = new Set(listSessionFiles(this.config.sessionsDir));
    this.timer = setInterval(() => {
      this.poll(startedAt);
    }, this.config.sessionPollMs);
    this.poll(startedAt);
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await new Promise((resolveStop) => {
      setTimeout(resolveStop, this.config.sessionTailGraceMs);
    });
    this.poll(this.startedAt ?? new Date());
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
      return;
    }

    const lines = readNewLines(this.sessionFile, this.lineOffset);
    this.lineOffset += lines.length;
    for (const { line, raw } of lines) {
      for (const message of semanticMessagesFromLine(raw, line)) {
        this.write(message);
      }
    }
  }

  private locateSession(startedAt: Date): { meta: CodexSessionMeta; path: string } | undefined {
    if (this.config.sessionFile) {
      const meta = readSessionMeta(this.config.sessionFile) ?? {
        sessionId: basename(this.config.sessionFile),
      };
      return { meta, path: this.config.sessionFile };
    }

    const candidates = listSessionFiles(this.config.sessionsDir)
      .filter((path) => !this.ignoredSessionFiles.has(path))
      .filter((path) => {
        try {
          return statSync(path).mtimeMs >= startedAt.getTime() - 2_000;
        } catch {
          return false;
        }
      })
      .map((path) => ({ meta: readSessionMeta(path), path }))
      .filter((entry): entry is { meta: CodexSessionMeta; path: string } => {
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
      envelope_version: SESSION_ENVELOPE_VERSION,
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
        codex_session_id: this.sessionMeta.sessionId,
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
      },
    };
    this.writeEnvelope(envelope);
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

class TerminalEnvelopeWriter {
  private sequence = 0;
  public pid: number | undefined;

  public constructor(
    private readonly config: CodexWrapperConfig,
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
      envelope_version: ENVELOPE_VERSION,
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
      codex: {
        argv: this.config.codexArgs,
        command: this.config.codexBin,
        ...(this.pid === undefined ? {} : { pid: this.pid }),
        pty: this.config.usePty && platform() === "darwin",
      },
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

function listSessionFiles(root: string): Array<string> {
  if (!existsSync(root)) {
    return [];
  }
  const out: Array<string> = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
        out.push(path);
      }
    }
  };
  visit(root);
  return out;
}

function readSessionMeta(path: string): CodexSessionMeta | undefined {
  for (const raw of readAllLines(path)) {
    const record = parseJsonObject(raw);
    if (record?.type !== "session_meta") {
      continue;
    }
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

function countLines(path: string): number {
  return readAllLines(path).length;
}

function semanticMessagesFromLine(raw: string, line: number): Array<SemanticMessage> {
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
    const text = textFromContent(payload.content);
    if (!text) {
      return [];
    }
    return [
      {
        line,
        ...(asString(payload.phase) ? { phase: asString(payload.phase) } : {}),
        recordType: "response_item",
        role: "assistant",
        text,
        timestamp,
      },
    ];
  }

  return [];
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .flatMap((item) => {
      const object = asObject(item);
      if (!object || (object.type !== "output_text" && object.type !== "text")) {
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

function parseBucket(value: string): BucketUnit {
  if (value === "minute" || value === "hour" || value === "day") {
    return value;
  }
  throw new Error("--tinyplace-bucket must be minute, hour, or day");
}

function parseScope(value: string): EnvelopeScope {
  if (value === "folder" || value === "session") {
    return value;
  }
  throw new Error("--tinyplace-scope must be folder or session");
}

function floorTimestamp(value: Date, unit: BucketUnit): Date {
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

function addBucket(value: Date, unit: BucketUnit): Date {
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

function bucketFileName(value: Date, unit: BucketUnit): string {
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
