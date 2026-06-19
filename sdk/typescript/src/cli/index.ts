import { boolFlag, parseArgs } from "./args.js";
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

export async function runTinyPlaceCli(
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
    return {
      code: 1,
      stdout: "",
      stderr: `${JSON.stringify(
        redactSecrets({
          error: error instanceof Error ? error.message : String(error),
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
    // Back-compat: a bare granular command behaves like `raw <command>`.
    default:
      return dispatchRaw(ctx, parsed);
  }
}
