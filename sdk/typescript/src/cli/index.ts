import {
  agentCatalog,
  describeErrors,
  describeOperation,
} from "../agent/catalog.js";
import { classifyError } from "../errors.js";
import { boolFlag, numberFlag, parseArgs, stringFlag } from "./args.js";
import {
  CLI_GUIDES,
  HARNESS_CLI_COMMANDS,
  buildHelp,
  rawCommands,
} from "./commands.js";
import { makeContext } from "./context.js";
import { formatResult, redactSecrets, resolveFormat } from "./format.js";
import {
  createGroupFlow,
  findWorkFlow,
  followFlow,
  joinGroupFlow,
  postBountyFlow,
  registerFlow,
  submissionsFlow,
  submitFlow,
  unfollowFlow,
} from "./flows.js";
import { runKeygen } from "./keygen.js";
import {
  cliVersionInfo,
  debugInfo,
  readCliVersion,
  selfUpdate,
} from "./maintenance.js";
import { dispatchRaw } from "./raw.js";
import {
  captureCliException,
  flushCliSentry,
  initCliSentry,
} from "./sentry.js";
import { updateNotice } from "./update-notice.js";
import type {
  CliContext,
  ParsedArgs,
  TinyPlaceCliOptions,
  TinyPlaceCliResult,
} from "./types.js";
import {
  balanceFlow,
  discoverFlow,
  feedFlow,
  fundInfo,
  initFlow,
  messageFlow,
  readFlow,
  replyFlow,
  statusFlow,
  whoami,
} from "./workflows.js";

export { CLI_GUIDES, HARNESS_CLI_COMMANDS } from "./commands.js";
export type {
  CliContext,
  TinyPlaceCliCommand,
  TinyPlaceCliGuide,
  TinyPlaceCliOptions,
  TinyPlaceCliResult,
} from "./types.js";

const HELP = buildHelp();

/**
 * Commands that report or perform the upgrade themselves (or do no real work),
 * where a passive "update available" footer would be redundant or noisy.
 */
const NOTICE_SKIP_COMMANDS = new Set([
  "version",
  "update",
  "upgrade",
  "help",
  "--help",
  "-v",
  "--version",
]);

export async function runTinyPlaceCli(
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  const result = await dispatchCli(argv, options);
  // Only the real `tinyplace` bin (no caller-supplied env) gets the passive
  // upgrade nudge: embedders/tests pass their own env and own their output, and
  // managed mode is where we may read/write the daily check cache on disk.
  if (options.env === undefined) {
    const parsed = parseArgs(argv);
    if (parsed.command && !NOTICE_SKIP_COMMANDS.has(parsed.command)) {
      const notice = await updateNotice({
        env: process.env,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
      if (notice) {
        result.stderr = result.stderr ? `${result.stderr}${notice}` : notice;
      }
    }
  }
  return result;
}

async function dispatchCli(
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  const parsed = parseArgs(argv);
  const env = options.env ?? process.env;
  initCliSentry(env);
  // `--version` / `-v` short-circuit BEFORE makeContext so a plain version probe
  // never auto-generates a wallet key as a side effect. Use `version --check` for
  // the update comparison (it needs network + the resolved context).
  if (
    parsed.command === "-v" ||
    parsed.command === "--version" ||
    (boolFlag(parsed.flags, "version") && !parsed.command)
  ) {
    return {
      code: 0,
      stdout: `${JSON.stringify({ version: await readCliVersion() }, null, 2)}\n`,
      stderr: "",
    };
  }
  if (
    !parsed.command ||
    parsed.command === "help" ||
    parsed.command === "--help"
  ) {
    return { code: 0, stdout: HELP, stderr: "" };
  }

  try {
    const ctx = await makeContext(options);
    const result = await dispatchTop(ctx, parsed);
    const format = resolveFormat(parsed.flags);
    const raw = boolFlag(parsed.flags, "raw");
    return { code: 0, stdout: formatResult(result, format, raw), stderr: "" };
  } catch (error) {
    captureCliException(error, parsed.command);
    await flushCliSentry();
    const detail = error as {
      status?: number;
      body?: unknown;
      paymentRequired?: unknown;
    };
    // Stable, machine-readable recovery contract: `code` is what an agent should
    // branch on; `hint` is the one-line next step; `retryable` says whether
    // re-running as-is can succeed. `error` text stays human-facing and may change.
    const classified = classifyError(error);
    return {
      code: 1,
      stdout: "",
      stderr: `${JSON.stringify(
        redactSecrets({
          error: error instanceof Error ? error.message : String(error),
          code: classified.code,
          hint: classified.hint,
          retryable: classified.retryable,
          ...(detail.status ? { status: detail.status } : {}),
          ...(detail.body !== undefined ? { body: detail.body } : {}),
          ...(detail.paymentRequired
            ? { paymentRequired: detail.paymentRequired }
            : {}),
        }),
        null,
        2,
      )}\n`,
    };
  }
}

async function dispatchTop(
  ctx: CliContext,
  parsed: ParsedArgs,
): Promise<unknown> {
  const flags = parsed.flags;
  switch (parsed.command) {
    case "raw": {
      const [rawCommand, ...positionals] = parsed.positionals;
      if (!rawCommand) {
        return { commands: rawCommands(), guides: CLI_GUIDES };
      }
      return dispatchRaw(ctx, { command: rawCommand, positionals, flags });
    }
    // Workflows.
    case "init":
      return initFlow(ctx, flags);
    case "status":
      return statusFlow(ctx, flags);
    // Lightweight poll via the Agent facade: inbox + new messages + activity.
    case "poll": {
      const since = stringFlag(flags, "since");
      const activityLimit = numberFlag(flags, "limit");
      return ctx.client.agent.checkUpdates({
        ...(since ? { since } : {}),
        ...(activityLimit !== undefined ? { activityLimit } : {}),
      });
    }
    case "balance":
      return balanceFlow(ctx, flags);
    case "discover":
      return discoverFlow(ctx, flags);
    case "feed":
      return feedFlow(ctx, flags);
    case "whoami":
      return whoami(ctx);
    case "fund":
      return fundInfo(ctx, flags);
    case "find-work":
      return findWorkFlow(ctx, flags);
    // Identity (confirm-gated paid claim).
    case "register":
      return registerFlow(ctx, parsed.positionals, flags);
    // Bounties — creating side (confirm-gated x402 funding) + winning side.
    case "post-bounty":
      return postBountyFlow(ctx, flags);
    case "submissions":
      return submissionsFlow(ctx, parsed.positionals, flags);
    case "submit":
      return submitFlow(ctx, parsed.positionals, flags);
    // Groups & social graph.
    case "join":
      return joinGroupFlow(ctx, parsed.positionals);
    case "create-group":
      return createGroupFlow(ctx, parsed.positionals, flags);
    case "follow":
      return followFlow(ctx, parsed.positionals);
    case "unfollow":
      return unfollowFlow(ctx, parsed.positionals);
    // Messaging workflows.
    case "message":
      return messageFlow(ctx, parsed.positionals, flags);
    case "read":
      return readFlow(ctx, flags);
    case "reply":
      return replyFlow(ctx, parsed.positionals, flags);
    // Maintenance.
    case "keygen":
      return runKeygen(ctx, flags);
    case "update":
    case "upgrade":
      return selfUpdate(flags);
    case "version":
      return cliVersionInfo(ctx, flags);
    case "debug":
    case "doctor":
      return debugInfo(ctx);
    case "commands":
      return { commands: HARNESS_CLI_COMMANDS, guides: CLI_GUIDES };
    // Self-description: let a harness fetch the agent operations + error contract.
    case "catalog":
      return agentCatalog();
    case "describe": {
      const [topic] = parsed.positionals;
      if (!topic) {
        return agentCatalog();
      }
      if (topic === "errors") {
        return { errors: describeErrors() };
      }
      const operation = describeOperation(topic);
      if (!operation) {
        throw new Error(
          `unknown operation: ${topic} (try \`tinyplace catalog\` for the list)`,
        );
      }
      return operation;
    }
    // Back-compat: a bare granular command behaves like `raw <command>`.
    default:
      return dispatchRaw(ctx, parsed);
  }
}
