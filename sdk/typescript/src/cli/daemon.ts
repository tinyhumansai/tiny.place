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
const DEFAULT_TASK_TIMEOUT_MS = 600_000;
const DEFAULT_POLL_MS = 2_000;

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

  const requestedDefault = stringFlag(flags, "default-provider") as
    | HarnessProvider
    | undefined;
  const defaultProvider =
    requestedDefault && providers.includes(requestedDefault)
      ? requestedDefault
      : (providers[0] as HarnessProvider);

  const workspace = resolve(stringFlag(flags, "workspace") ?? process.cwd());
  const concurrency = numberFlag(flags, "concurrency") ?? DEFAULT_CONCURRENCY;
  const taskTimeoutMs =
    numberFlag(flags, "task-timeout-ms") ?? DEFAULT_TASK_TIMEOUT_MS;
  const pollMs = numberFlag(flags, "poll-ms") ?? DEFAULT_POLL_MS;
  const statusThrottleMs = numberFlag(flags, "status-throttle-ms");
  const model = stringFlag(flags, "model");
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
    ...(statusThrottleMs !== undefined ? { statusThrottleMs } : {}),
    ...(model ? { model } : {}),
    ...(opencodeAgent ? { agent: opencodeAgent } : {}),
    send: (to, body) => lock(() => agent.sendMessage(to, body)).then(() => {}),
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
    // Test/probe hook: accept pending contacts, drain the inbox once, then exit.
    await accepterTick(agent, lock, log);
    await mailbox.tickOnce();
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
