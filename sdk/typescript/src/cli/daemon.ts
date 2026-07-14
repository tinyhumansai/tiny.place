/**
 * `tinyplace daemon` — a headless agent that offers this machine's local
 * coding-agent CLIs (Claude Code / Codex / OpenCode) as an addressable
 * tiny.place agent. It onboards an identity, advertises the detected providers
 * as card skills, auto-accepts contact requests, and serves delegated tasks over
 * Signal E2E DMs — both plain-text prompts and the structured
 * `medulla-tinyplace/1` task protocol medulla's orchestrator speaks.
 *
 * Reuses the harness machinery: task output is folded through the same
 * `harnessEventsFromLine` semantic-event mappers the interactive wrapper uses
 * (see `daemon/providers.ts`), and identity/messaging go through the standard
 * Agent facade + the CLI's managed wallet/Signal store (`makeContext`).
 */
import { resolve } from "node:path";

import { Agent } from "../agent/agent.js";
import { boolFlag, listFlag, numberFlag, stringFlag } from "./args.js";
import {
  DAEMON_PROVIDERS,
  detectProviders,
  providerBin,
} from "./daemon/providers.js";
import {
  createContactAutoAccepter,
  createLock,
  createMailbox,
} from "./daemon/mailbox.js";
import { DaemonRuntime } from "./daemon/runtime.js";
import type { CliContext } from "./types.js";
import type { Flags } from "./types.js";
import type { HarnessProvider } from "../types/harness.js";

const DEFAULT_CONCURRENCY = 2;
// Idle (no-event) watchdog, not a hard cap: a task is killed only after this many
// ms with NO new event from the provider CLI; each event re-arms it. A long-but-
// active run survives, a wedged one is reaped ~10 min after it goes silent.
const DEFAULT_TASK_TIMEOUT_MS = 600_000;
const DEFAULT_POLL_MS = 2_000;

/** Require a positive-integer flag (or its default); reject 0/negative/NaN. */
function positiveIntFlag(flags: Flags, name: string, fallback: number): number {
  const value = numberFlag(flags, name) ?? fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer (got ${value})`);
  }
  return value;
}

function parseProviders(flags: Flags): Array<HarnessProvider> | undefined {
  const raw = listFlag(flags, "providers");
  if (!raw) return undefined;
  const out: Array<HarnessProvider> = [];
  for (const entry of raw) {
    if ((DAEMON_PROVIDERS as ReadonlyArray<string>).includes(entry)) {
      out.push(entry as HarnessProvider);
    } else {
      throw new Error(
        `unknown provider "${entry}" (expected: ${DAEMON_PROVIDERS.join(", ")})`,
      );
    }
  }
  return out;
}

export interface DaemonSummary {
  daemon: {
    agentId: string;
    publicKey: string;
    handle?: string;
    endpoint: string;
    workspace: string;
    providers: Array<HarnessProvider>;
    defaultProvider: HarnessProvider | undefined;
    mode: "once" | "served";
  };
  onboard?: Array<{ step: string; status: string; error?: string }>;
}

export async function runDaemon(
  ctx: CliContext,
  flags: Flags,
): Promise<DaemonSummary> {
  if (!ctx.signer) {
    throw new Error(
      "daemon needs a tiny.place identity — run `tinyplace init` or set TINYPLACE_SECRET_KEY",
    );
  }
  const log = (line: string): void => {
    process.stderr.write(`tinyplace daemon: ${line}\n`);
  };

  const only = parseProviders(flags);
  const providers = detectProviders({ env: ctx.env, ...(only ? { only } : {}) });
  if (providers.length === 0) {
    const wanted = (only ?? DAEMON_PROVIDERS)
      .map((p) => `${p} (${providerBin(p, ctx.env)})`)
      .join(", ");
    throw new Error(
      `no coding-agent CLI found on PATH — looked for: ${wanted}. Install one or pass --providers.`,
    );
  }

  // An explicit --default-provider must exist AND be detected — silently
  // substituting another provider would run tasks on a coding service the
  // operator did not select.
  const requestedDefault = stringFlag(flags, "default-provider");
  if (
    requestedDefault !== undefined &&
    !providers.includes(requestedDefault as HarnessProvider)
  ) {
    throw new Error(
      `--default-provider "${requestedDefault}" is not available; detected: ${providers.join(", ")}`,
    );
  }
  const defaultProvider =
    (requestedDefault as HarnessProvider | undefined) ??
    (providers[0] as HarnessProvider);

  const workspace = resolve(stringFlag(flags, "workspace") ?? process.cwd());
  const concurrency = positiveIntFlag(flags, "concurrency", DEFAULT_CONCURRENCY);
  const taskTimeoutMs = positiveIntFlag(
    flags,
    "task-timeout-ms",
    DEFAULT_TASK_TIMEOUT_MS,
  );
  const pollMs = positiveIntFlag(flags, "poll-ms", DEFAULT_POLL_MS);
  const maxPending = positiveIntFlag(flags, "max-pending", 16);
  const statusThrottleMs = numberFlag(flags, "status-throttle-ms");
  if (
    statusThrottleMs !== undefined &&
    (!Number.isInteger(statusThrottleMs) || statusThrottleMs < 0)
  ) {
    throw new Error(
      `--status-throttle-ms must be a non-negative integer (got ${statusThrottleMs})`,
    );
  }
  const model = stringFlag(flags, "model");
  // Opt-in: run claude workers with --dangerously-skip-permissions. OFF unless the
  // operator passes the flag, because the daemon auto-accepts contacts and executes
  // remote task text — unattended approval bypass must be an explicit choice.
  const skipPermissions = boolFlag(flags, "dangerously-skip-permissions");
  const opencodeAgent = stringFlag(flags, "opencode-agent");
  const handle = stringFlag(flags, "handle");
  const displayName = stringFlag(flags, "name");
  const extraSkills = listFlag(flags, "skills") ?? [];
  const once = boolFlag(flags, "once");

  const agent = Agent.fromClient(ctx.client, ctx.signer);
  const lock = createLock();

  let onboardSteps: DaemonSummary["onboard"];
  if (!boolFlag(flags, "no-onboard")) {
    const skills = Array.from(
      new Set(["coding-agent", ...providers, ...extraSkills]),
    );
    const result = await lock(() =>
      agent.onboard({
        ...(handle ? { handle } : {}),
        displayName: displayName ?? handle ?? `coding-agent daemon`,
        bio: `Headless coding-agent daemon serving ${providers.join(", ")} over tiny.place.`,
        skills,
      }),
    );
    onboardSteps = result.steps.map((step) => ({
      step: step.step,
      status: step.status,
      ...("error" in step && step.error ? { error: step.error } : {}),
    }));
    log(`onboarded ${agent.agentId} (skills: ${skills.join(", ")})`);
  }

  const runtime = new DaemonRuntime({
    providers,
    defaultProvider,
    workspace,
    env: ctx.env,
    taskTimeoutMs,
    concurrency,
    maxPending,
    ...(statusThrottleMs !== undefined ? { statusThrottleMs } : {}),
    ...(model ? { model } : {}),
    ...(skipPermissions ? { skipPermissions: true } : {}),
    ...(opencodeAgent ? { agent: opencodeAgent } : {}),
    send: (to, body) =>
      lock(async () => {
        try {
          await agent.sendMessage(to, body);
        } catch (error) {
          if (!isSessionError(error)) throw error;
          // Poisoned/desynced Signal ratchet — the relay rejects the ciphertext.
          // Drop the session so the retry re-runs X3DH from a fresh pre-key bundle.
          // Do NOT swallow a reset failure: retrying over an uncleared ratchet just
          // fails again and masks the cause, so let it propagate.
          log(`session error sending to ${to}, resetting: ${describe(error)}`);
          await agent.resetSession(to);
          await agent.sendMessage(to, body);
        }
      }),
    log,
  });

  const accepter = createContactAutoAccepter(agent, {
    lock,
    intervalMs: pollMs,
    onAccept: (agentId) => log(`accepted contact ${agentId}`),
    onError: (error) => log(`contact poll error: ${describe(error)}`),
  });
  const mailbox = createMailbox(agent, {
    lock,
    intervalMs: pollMs,
    onError: (error) => log(`inbox poll error: ${describe(error)}`),
  });
  mailbox.onMessage((from, message, frame) => {
    log(
      `message from ${from}${frame ? ` [${frame.kind} ${frame.taskId}]` : " [plain]"}`,
    );
    runtime.handleMessage(from, message, frame);
  });

  const summary = (mode: "once" | "served"): DaemonSummary => ({
    daemon: {
      agentId: agent.agentId,
      publicKey: agent.publicKey,
      ...(handle ? { handle } : {}),
      endpoint: ctx.baseUrl,
      workspace,
      providers,
      defaultProvider,
      mode,
    },
    ...(onboardSteps ? { onboard: onboardSteps } : {}),
  });

  if (once) {
    // Test/probe hook: accept pending contacts, drain the inbox once, wait for
    // every started task to settle (handlers are fire-and-forget), then exit.
    await accepterTick(agent, lock, log);
    await mailbox.tickOnce();
    await runtime.idle();
    log("--once complete");
    return summary("once");
  }

  log(
    `serving providers [${providers.join(", ")}] as ${agent.agentId} on ${ctx.baseUrl} (workspace: ${workspace})`,
  );
  accepter.start();
  mailbox.start();

  await new Promise<void>((resolveStop) => {
    const stop = (signal: NodeJS.Signals): void => {
      log(`received ${signal}, shutting down`);
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      accepter.stop();
      mailbox.stop();
      runtime.shutdown();
      resolveStop();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });

  return summary("served");
}

/** One-shot contact acceptance pass for `--once` (mirrors the accepter loop). */
async function accepterTick(
  agent: Agent,
  lock: ReturnType<typeof createLock>,
  log: (line: string) => void,
): Promise<void> {
  try {
    const { incoming } = await lock(() => agent.client.contacts.requests());
    for (const contact of incoming) {
      await lock(() => agent.client.contacts.accept(contact.agentId)).then(
        () => log(`accepted contact ${contact.agentId}`),
        (error) => log(`accept failed: ${describe(error)}`),
      );
    }
  } catch (error) {
    log(`contact poll error: ${describe(error)}`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A send failure that dropping the Signal session can actually fix: an explicit
 * stale-ratchet / decrypt / prekey / session fault. Deliberately NOT matched:
 * a not-yet-contact rejection (resetting won't accept the contact, and the retry
 * would leave an undelivered X3DH session that makes the next send undecryptable)
 * or a bare HTTP status, which says nothing about the ratchet.
 */
function isSessionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  const text = `${e?.code ?? ""} ${e?.message ?? ""}`.toLowerCase();
  return /ratchet|decrypt|prekey|pre-key|signal session|no session/.test(text);
}
