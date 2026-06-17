import { boolFlag, parseArgs } from "./args.js";
import { CLI_GUIDES, HARNESS_CLI_COMMANDS, buildHelp, rawCommands } from "./commands.js";
import { makeContext } from "./context.js";
import { formatResult, redactSecrets, resolveFormat } from "./format.js";
import { runKeygen } from "./keygen.js";
import { cliVersionInfo, selfUpdate } from "./maintenance.js";
import { dispatchRaw } from "./raw.js";
import type { CliContext, ParsedArgs, TinyPlaceCliOptions, TinyPlaceCliResult } from "./types.js";
import { discoverFlow, fundInfo, initFlow, statusFlow, whoami } from "./workflows.js";

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
  if (!parsed.command || parsed.command === "help" || parsed.command === "--help") {
    return { code: 0, stdout: HELP, stderr: "" };
  }

  try {
    const ctx = await makeContext(options);
    const result = await dispatchTop(ctx, parsed);
    const format = resolveFormat(parsed.flags);
    const raw = boolFlag(parsed.flags, "raw");
    return { code: 0, stdout: formatResult(result, format, raw), stderr: "" };
  } catch (error) {
    const detail = error as { status?: number; body?: unknown; paymentRequired?: unknown };
    return {
      code: 1,
      stdout: "",
      stderr: `${JSON.stringify(redactSecrets({
        error: error instanceof Error ? error.message : String(error),
        ...(detail.status ? { status: detail.status } : {}),
        ...(detail.body !== undefined ? { body: detail.body } : {}),
        ...(detail.paymentRequired ? { paymentRequired: detail.paymentRequired } : {}),
      }), null, 2)}\n`,
    };
  }
}

async function dispatchTop(ctx: CliContext, parsed: ParsedArgs): Promise<unknown> {
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
    case "discover":
      return discoverFlow(ctx, flags);
    case "whoami":
      return whoami(ctx);
    case "fund":
      return fundInfo(ctx, flags);
    // Maintenance.
    case "keygen":
      return runKeygen(ctx, flags);
    case "update":
    case "upgrade":
      return selfUpdate(flags);
    case "version":
      return cliVersionInfo(ctx, flags);
    case "commands":
      return { commands: HARNESS_CLI_COMMANDS, guides: CLI_GUIDES };
    // Back-compat: a bare granular command behaves like `raw <command>`.
    default:
      return dispatchRaw(ctx, parsed);
  }
}
