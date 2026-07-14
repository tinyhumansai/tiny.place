import {
  closeSync,
  existsSync,
  openSync,
  readSync,
  readdirSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

/**
 * Recent-session history for the tiny.place home screen. This module is the read
 * model behind the home "resume" pane: it scans the agents' own session dirs
 * (`~/.claude/projects`, `~/.codex/sessions`) — the same files the wrapper's
 * tailer streams — so the list is always accurate with no separate store to keep
 * in sync. A row resolves to `{ agent, id }`, which the TUI relaunches via
 * `claude --resume <id>` / `codex resume <id>` in the session's original cwd.
 */

export type SessionAgentKind = "claude" | "codex";

export interface RecentSession {
  /** Agent session id (claude `sessionId` / codex `session_id`). */
  id: string;
  agent: SessionAgentKind;
  /** Working directory the session ran in, when recorded. */
  cwd?: string;
  /** First human prompt, single-lined + truncated; drives the resume label. */
  label: string;
  /** Last-activity epoch ms (session-file mtime). */
  lastActive: number;
  /** Absolute path to the session's JSONL file. */
  path: string;
}

export interface ListRecentSessionsOptions {
  /** Max rows returned (default 24). */
  limit?: number;
  /** Cap on files whose head we parse, before the final sort/slice (default 60). */
  scanLimit?: number;
}

const DEFAULT_LIMIT = 24;
const DEFAULT_SCAN_LIMIT = 60;
/** Bytes read from each session file — enough for meta + the first prompt. */
const HEAD_BYTES = 64 * 1024;
const LABEL_MAX = 72;

interface RawSessionFile {
  agent: SessionAgentKind;
  path: string;
  mtimeMs: number;
}

interface SessionSummary {
  id: string;
  cwd?: string;
  label: string;
}

/**
 * The most recent agent sessions across both harnesses, ordered
 * **current-folder-first, then most-recent**, so a resume from where you're
 * standing is always at the top. Cost is bounded: only the newest `scanLimit`
 * files are opened, and only their first `HEAD_BYTES` are parsed.
 */
export function listRecentSessions(
  env: Record<string, string | undefined>,
  cwd: string,
  options: ListRecentSessionsOptions = {},
): Array<RecentSession> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const scanLimit = options.scanLimit ?? DEFAULT_SCAN_LIMIT;

  const raw = [
    ...collectSessionFiles("claude", claudeSessionsDir(env)),
    ...collectSessionFiles("codex", codexSessionsDir(env)),
  ]
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, scanLimit);

  const here = safeResolve(cwd);
  // Dedupe by agent+id, keeping the freshest file (a resumed claude session
  // appends to one file; codex resume can spawn a sibling rollout).
  const byId = new Map<string, RecentSession>();
  for (const file of raw) {
    const summary = readSessionSummary(file.agent, file.path);
    if (!summary) {
      continue;
    }
    const key = `${file.agent}:${summary.id}`;
    const existing = byId.get(key);
    if (existing && existing.lastActive >= file.mtimeMs) {
      continue;
    }
    byId.set(key, {
      agent: file.agent,
      id: summary.id,
      label: summary.label,
      lastActive: file.mtimeMs,
      path: file.path,
      ...(summary.cwd ? { cwd: summary.cwd } : {}),
    });
  }

  return [...byId.values()]
    .sort((left, right) => {
      const leftHere = isHere(left.cwd, here) ? 0 : 1;
      const rightHere = isHere(right.cwd, here) ? 0 : 1;
      if (leftHere !== rightHere) {
        return leftHere - rightHere;
      }
      return right.lastActive - left.lastActive;
    })
    .slice(0, limit);
}

/** Resolve the Claude session directory, honoring the env overrides. */
export function claudeSessionsDir(
  env: Record<string, string | undefined>,
): string {
  return (
    firstEnv(env, [
      "TINYVERSE_CLAUDE_SESSIONS_DIR",
      "TINYPLACE_CLAUDE_SESSIONS_DIR",
    ]) ?? join(homedir(), ".claude", "projects")
  );
}

/** Resolve the Codex session directory, honoring the env override. */
export function codexSessionsDir(
  env: Record<string, string | undefined>,
): string {
  return (
    env.TINYPLACE_CODEX_SESSIONS_DIR ?? join(homedir(), ".codex", "sessions")
  );
}

function collectSessionFiles(
  agent: SessionAgentKind,
  dir: string,
): Array<RawSessionFile> {
  if (!existsSync(dir)) {
    return [];
  }
  const out: Array<RawSessionFile> = [];
  const visit = (directory: string): void => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.isFile() || !isSessionFile(agent, path, entry.name)) {
        continue;
      }
      try {
        out.push({ agent, path, mtimeMs: statSync(path).mtimeMs });
      } catch {
        continue;
      }
    }
  };
  visit(dir);
  return out;
}

function isSessionFile(
  agent: SessionAgentKind,
  path: string,
  name: string,
): boolean {
  if (agent === "codex") {
    return name.startsWith("rollout-") && name.endsWith(".jsonl");
  }
  return name.endsWith(".jsonl") && !path.includes(`${sep}subagents${sep}`);
}

function readSessionSummary(
  agent: SessionAgentKind,
  path: string,
): SessionSummary | undefined {
  const lines = readHeadLines(path);
  return agent === "claude"
    ? readClaudeSummary(lines)
    : readCodexSummary(lines);
}

function readClaudeSummary(lines: Array<string>): SessionSummary | undefined {
  let id: string | undefined;
  let cwd: string | undefined;
  let label: string | undefined;
  for (const raw of lines) {
    const record = parseObject(raw);
    if (!record) {
      continue;
    }
    id = asString(record.sessionId) ?? id;
    cwd = asString(record.cwd) ?? cwd;
    if (label === undefined && record.type === "user") {
      label = firstPromptText(asMessageContent(record.message));
    }
  }
  if (!id) {
    return undefined;
  }
  return { id, label: label ?? "(no prompt)", ...(cwd ? { cwd } : {}) };
}

function readCodexSummary(lines: Array<string>): SessionSummary | undefined {
  let id: string | undefined;
  let cwd: string | undefined;
  let label: string | undefined;
  for (const raw of lines) {
    const record = parseObject(raw);
    if (!record) {
      continue;
    }
    if (record.type === "session_meta") {
      const payload = asObject(record.payload);
      if (payload) {
        id = asString(payload.session_id) ?? asString(payload.id) ?? id;
        cwd = asString(payload.cwd) ?? cwd;
      }
      continue;
    }
    if (label !== undefined || record.type !== "response_item") {
      continue;
    }
    const payload = asObject(record.payload);
    if (
      payload?.type === "message" &&
      asString(payload.role) === "user"
    ) {
      label = firstPromptText(payload.content);
    }
  }
  if (!id) {
    return undefined;
  }
  return { id, label: label ?? "(no prompt)", ...(cwd ? { cwd } : {}) };
}

/**
 * Turn a user message's `content` into a display label, or undefined when the
 * content is not a real prompt. System-injected turns are wrapped in
 * `<...>` tags (codex `<environment_context>` / `<permissions>`, claude
 * `<command-name>` / `<local-command-...>`) and tool-result turns carry no text
 * block — both are skipped so the label reflects the first thing the human said.
 */
function firstPromptText(content: unknown): string | undefined {
  const text = extractText(content);
  if (text === undefined) {
    return undefined;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.startsWith("<")) {
    return undefined;
  }
  return truncateLabel(trimmed);
}

function extractText(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (const item of content) {
    const object = asObject(item);
    if (!object) {
      continue;
    }
    // claude blocks are {type:"text",text}; codex are {type:"input_text",text}.
    if (object.type === "text" || object.type === "input_text") {
      const text = asString(object.text);
      if (text !== undefined) {
        return text;
      }
    }
  }
  return undefined;
}

function asMessageContent(message: unknown): unknown {
  const object = asObject(message);
  if (!object || asString(object.role) !== "user") {
    return undefined;
  }
  return object.content;
}

function truncateLabel(text: string): string {
  // Labels come from arbitrary prior prompts, which can carry terminal control
  // bytes (ESC/CSI, BEL, C1). Strip C0/DEL/C1 to a space so a pasted escape
  // sequence can't move the cursor or recolor the pane when the label renders —
  // sanitizing here covers every consumer (TTY rows, the non-TTY snapshot, tests).
  const single = text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (single.length <= LABEL_MAX) {
    return single;
  }
  return `${single.slice(0, LABEL_MAX - 1).trimEnd()}…`;
}

function readHeadLines(path: string): Array<string> {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return [];
  }
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = readSync(fd, buffer, 0, HEAD_BYTES, 0);
    const text = buffer.toString("utf8", 0, read);
    const lines = text.split(/\r?\n/);
    // When the read hit the cap the final line is likely truncated — drop it so
    // a half-JSON line doesn't parse-fail noisily.
    if (read >= HEAD_BYTES && lines.length > 1) {
      lines.pop();
    }
    return lines.filter((line) => line.length > 0);
  } catch {
    return [];
  } finally {
    closeSync(fd);
  }
}

function isHere(cwd: string | undefined, here: string | undefined): boolean {
  return cwd !== undefined && here !== undefined && safeResolve(cwd) === here;
}

function safeResolve(path: string): string | undefined {
  try {
    return resolve(path);
  } catch {
    return undefined;
  }
}

function firstEnv(
  env: Record<string, string | undefined>,
  names: Array<string>,
): string | undefined {
  return names
    .map((name) => env[name])
    .find((value) => value !== undefined && value !== "");
}

function parseObject(raw: string): Record<string, unknown> | undefined {
  try {
    return asObject(JSON.parse(raw));
  } catch {
    return undefined;
  }
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
