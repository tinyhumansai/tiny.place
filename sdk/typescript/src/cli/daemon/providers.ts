/**
 * Provider detection + headless task execution for the daemon.
 *
 * The daemon runs a delegated task by spawning the requested coding-agent CLI
 * **once**, non-interactively, with the instruction as the prompt, then folds
 * the CLI's streaming output through the shared semantic-event mappers
 * (`createHarnessLineMapper`) — the same parser the interactive wrapper uses — to
 * derive status updates and the final agent message. This is the headless
 * complement to `harness-wrapper.ts`: that module wraps a human-driven PTY
 * session and tails its transcript files; this one drives a one-shot run and
 * captures its result.
 *
 * Invocations (all emit JSONL to stdout):
 *   claude    claude -p <prompt> --output-format stream-json --verbose
 *   codex     codex exec --json [-m <model>] <prompt>
 *   opencode  opencode run [-m <model>] [--agent <agent>] --format json <prompt>
 */
import { spawn as spawnChild, type ChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

import {
  createHarnessLineMapper,
  type HarnessSemanticEvent,
} from "../harness-events.js";
import type { HarnessProvider } from "../../types/harness.js";

export const DAEMON_PROVIDERS: ReadonlyArray<HarnessProvider> = [
  "claude",
  "codex",
  "opencode",
];

/** Per-provider binary + env overrides for the bin name. */
const PROVIDER_BINS: Record<
  HarnessProvider,
  { defaultBin: string; binEnv: ReadonlyArray<string> }
> = {
  claude: { defaultBin: "claude", binEnv: ["TINYVERSE_CLAUDE_BIN", "TINYPLACE_CLAUDE_BIN"] },
  codex: { defaultBin: "codex", binEnv: ["TINYPLACE_CODEX_BIN"] },
  opencode: { defaultBin: "opencode", binEnv: ["TINYPLACE_OPENCODE_BIN"] },
};

/** Resolve the binary name/path for a provider (env override wins). */
export function providerBin(
  provider: HarnessProvider,
  env: Record<string, string | undefined>,
): string {
  const spec = PROVIDER_BINS[provider];
  for (const key of spec.binEnv) {
    const value = env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return spec.defaultBin;
}

export type ExistsOnPath = (bin: string) => boolean;

/** Default PATH lookup: an absolute/relative path is probed directly, a bare
 *  name is searched across `$PATH` entries for an executable file. */
export function makePathLookup(
  env: Record<string, string | undefined>,
): ExistsOnPath {
  const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
  return (bin: string): boolean => {
    if (bin.includes("/") || bin.includes("\\")) {
      return isExecutable(bin);
    }
    return dirs.some((dir) => isExecutable(join(dir, bin)));
  };
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export interface DetectProvidersOptions {
  env: Record<string, string | undefined>;
  /** Restrict detection to this set (the `--providers` allow-list). */
  only?: ReadonlyArray<HarnessProvider>;
  /** Injectable PATH probe (tests). Defaults to a real `$PATH` scan. */
  existsOnPath?: ExistsOnPath;
}

/** Which of the (optionally restricted) providers have a binary on PATH. */
export function detectProviders(
  options: DetectProvidersOptions,
): Array<HarnessProvider> {
  const lookup = options.existsOnPath ?? makePathLookup(options.env);
  const candidates = options.only ?? DAEMON_PROVIDERS;
  return candidates.filter((provider) =>
    lookup(providerBin(provider, options.env)),
  );
}

export type SpawnFn = (
  command: string,
  args: Array<string>,
  options: { cwd: string; env: Record<string, string | undefined> },
) => ChildProcess;

export interface RunTaskOptions {
  provider: HarnessProvider;
  prompt: string;
  cwd: string;
  env: Record<string, string | undefined>;
  timeoutMs: number;
  /** Model override (codex / opencode). */
  model?: string;
  /** opencode agent profile (defaults to "build"). */
  agent?: string;
  /** Extra args appended before the prompt (advanced / permissions). */
  extraArgs?: ReadonlyArray<string>;
  signal?: AbortSignal;
  /** Fired for each parsed semantic event — drives periodic status frames. */
  onEvent?: (event: HarnessSemanticEvent) => void;
  /** Register a stdin writer for `input` frame forwarding into the child. */
  onStdin?: (write: (text: string) => void) => void;
  spawn?: SpawnFn;
}

export interface RunTaskResult {
  provider: HarnessProvider;
  /** The agent's final answer (concatenated assistant text, or a fallback). */
  reply: string;
  /** Count of semantic events observed — a liveness signal for callers. */
  events: number;
}

/** Build the argv for a one-shot headless run of `provider`. */
export function buildRunArgs(options: {
  provider: HarnessProvider;
  prompt: string;
  model?: string;
  agent?: string;
  extraArgs?: ReadonlyArray<string>;
}): Array<string> {
  const extra = options.extraArgs ?? [];
  // A prompt beginning with "-" would be parsed as a CLI flag by the provider
  // (an argument-injection vector, since task text is remote-controlled). None
  // of the three CLIs documents `--` termination, so neutralize with a leading
  // space instead: the token no longer starts with "-" and the model sees an
  // insignificant leading space.
  const prompt = options.prompt.startsWith("-")
    ? ` ${options.prompt}`
    : options.prompt;
  switch (options.provider) {
    case "claude":
      return [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        ...extra,
        prompt,
      ];
    case "codex":
      return [
        "exec",
        "--json",
        ...(options.model ? ["-m", options.model] : []),
        ...extra,
        prompt,
      ];
    case "opencode":
      return [
        "run",
        ...(options.model ? ["-m", options.model] : []),
        "--agent",
        options.agent ?? "build",
        "--format",
        "json",
        ...extra,
        prompt,
      ];
  }
}

/** opencode's SQLite session store throws this when runs start too close
 *  together; it is transient and clears on a short retry. */
export function isTransientLock(message: string): boolean {
  return /database (?:is|table is) locked|SQLITE_BUSY/i.test(message);
}

/** opencode reports missing provider credentials as an opaque server error —
 *  append a diagnosis hint so a failed run tells the operator what to check. */
export function withAuthHint(message: string): string {
  const authShaped =
    /unexpected server error|unauthorized|401|api key|credential/i.test(message);
  return authShaped
    ? `${message} — hint: the provider may lack credentials (run \`opencode auth login\` or export the provider API key)`
    : message;
}

/** Transient-lock retry policy (opencode's SQLite store under concurrency). */
const LOCK_RETRY_ATTEMPTS = 5;
const LOCK_RETRY_BASE_MS = 250;

/**
 * Run one delegated task headlessly and return the agent's final answer. Streams
 * semantic events to `onEvent` as they arrive; captures assistant text for the
 * reply and falls back to the raw stdout tail when a provider emits no parseable
 * assistant message. Transient opencode SQLite-lock exits are retried with
 * jittered exponential backoff (concurrent starts contend on its session store).
 */
export async function runProviderTask(
  options: RunTaskOptions,
): Promise<RunTaskResult> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runProviderAttempt(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !isTransientLock(message) ||
        attempt >= LOCK_RETRY_ATTEMPTS ||
        options.signal?.aborted
      ) {
        throw error;
      }
      // Jittered backoff so a burst of workers desynchronizes instead of all
      // retrying into the same lock window.
      const delay = LOCK_RETRY_BASE_MS * 2 ** (attempt - 1) * (0.5 + Math.random());
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    }
  }
}

/** A record that never terminates in a newline is dropped past this size — a
 *  noisy provider must not grow the line buffer without bound. */
const MAX_RECORD_BYTES = 1_048_576;

/** One spawn of the provider CLI (the single attempt behind the retry loop). */
function runProviderAttempt(options: RunTaskOptions): Promise<RunTaskResult> {
  if (options.signal?.aborted) {
    // Queued work aborted (e.g. daemon shutdown) — never spawn a new CLI.
    return Promise.reject(
      new Error(`${options.provider} task aborted before start`),
    );
  }
  const spawn = options.spawn ?? defaultSpawn;
  const args = buildRunArgs({
    provider: options.provider,
    prompt: options.prompt,
    ...(options.model ? { model: options.model } : {}),
    ...(options.agent ? { agent: options.agent } : {}),
    ...(options.extraArgs ? { extraArgs: options.extraArgs } : {}),
  });
  const bin = providerBin(options.provider, options.env);
  const child = spawn(bin, args, { cwd: options.cwd, env: options.env });

  return new Promise<RunTaskResult>((resolvePromise, reject) => {
    // Per-run stateful mapper: dedupes codex's double-recorded assistant
    // message so `messages` collects each reply exactly once.
    const mapEventsFromLine = createHarnessLineMapper(options.provider);
    const messages: Array<string> = [];
    let claudeResult: string | undefined;
    let events = 0;
    let line = 0;
    let stdoutBuffer = "";
    let stdoutTail = "";
    let stderrTail = "";
    let settled = false;

    if (options.onStdin && child.stdin) {
      const stdin = child.stdin;
      options.onStdin((text: string) => {
        if (stdin.writable) {
          stdin.write(text.endsWith("\n") ? text : `${text}\n`);
        }
      });
    }

    const timer = setTimeout(() => {
      finishError(
        new Error(
          `${options.provider} task timed out after ${options.timeoutMs}ms`,
        ),
      );
      child.kill("SIGKILL");
    }, options.timeoutMs);

    const onAbort = (): void => {
      child.kill("SIGTERM");
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    function cleanup(): void {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }

    function finishError(error: Error): void {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function consumeLine(raw: string): void {
      if (!raw.trim()) return;
      // Claude's final `result` frame carries the whole answer as a plain string
      // — prefer it as the reply since it is the canonical print-mode output.
      if (options.provider === "claude") {
        const result = extractClaudeResult(raw);
        if (result !== undefined) {
          claudeResult = result;
        }
      }
      for (const event of mapEventsFromLine(raw, line)) {
        events += 1;
        options.onEvent?.(event);
        if (event.event.kind === "agent_message") {
          messages.push(event.event.payload.text);
        }
      }
      line += 1;
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      stdoutTail = tail(stdoutTail + chunk.toString());
      let newline = stdoutBuffer.indexOf("\n");
      while (newline !== -1) {
        consumeLine(stdoutBuffer.slice(0, newline));
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        newline = stdoutBuffer.indexOf("\n");
      }
      // A record that huge is not parseable JSONL — drop it rather than let a
      // noisy provider grow the buffer without bound (the tail keeps evidence).
      if (stdoutBuffer.length > MAX_RECORD_BYTES) {
        stdoutBuffer = "";
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = tail(stderrTail + chunk.toString());
    });

    child.on("error", (error: Error) => {
      finishError(
        new Error(`failed to start ${bin}: ${withAuthHint(error.message)}`),
      );
    });

    child.on("close", (code: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      // An aborted child exits with code null (signal kill); its partial output
      // must never settle as a normal reply.
      if (options.signal?.aborted) {
        reject(new Error(`${options.provider} task aborted`));
        return;
      }
      if (stdoutBuffer.trim()) {
        consumeLine(stdoutBuffer);
      }
      if (code !== 0 && code !== null) {
        reject(
          new Error(
            `${options.provider} exited ${code}: ${withAuthHint(
              (stderrTail || stdoutTail).slice(-600).trim(),
            )}`,
          ),
        );
        return;
      }
      const reply =
        claudeResult?.trim() ||
        messages.join("\n").trim() ||
        stdoutTail.trim() ||
        `${options.provider} completed without a text response.`;
      resolvePromise({ provider: options.provider, reply, events });
    });
  });
}

/** Parse a claude stream-json `result` line into its answer text, if that's
 *  what this line is. */
function extractClaudeResult(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.type === "result" && typeof parsed.result === "string") {
      return parsed.result;
    }
  } catch {
    // not JSON — ignore.
  }
  return undefined;
}

const TAIL_CAP = 8192;

function tail(value: string): string {
  return value.length > TAIL_CAP ? value.slice(-TAIL_CAP) : value;
}

const defaultSpawn: SpawnFn = (command, args, options) =>
  spawnChild(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
