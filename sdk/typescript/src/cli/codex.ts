import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  asCodexWrapperConfig,
  parseHarnessWrapperArgs,
  runHarnessCommand,
  type CodexWrapperConfig,
} from "./harness-wrapper.js";
import { makeContext } from "./context.js";
import { runTinyPlaceTui, type TinyVerseAgentKind } from "./tui.js";
import type { TinyPlaceCliOptions, TinyPlaceCliResult } from "./types.js";

/** Prod endpoint the SDK falls back to (mirrors `context.ts`). */
const DEFAULT_ENDPOINT = "https://api.tiny.place";

/**
 * `tinyplace codex` has three mutually-exclusive modes per invocation:
 *
 * - default: the **tiny.place TUI** — a visible wrapper showing the active
 *   session + OpenHuman connection, which launches codex inside itself and runs
 *   the real bidirectional bridge (publish keys, stream turns, inject inbound).
 * - `--raw`: the **transparent harness wrapper** — spawn codex with no UI, tail
 *   `~/.codex/sessions`, and bridge to OpenHuman underneath (same bridge, no
 *   chrome). Used by embedders/tests.
 * - `--agent`: boot a first-class **agent** session via the unified tiny.place
 *   plugin launcher (`sdk/plugin-tinyplace`, `--harness codex`): the session gets
 *   its own wallet + MCP tools and can DM peers bidirectionally.
 *
 * `--agent` and the wrapper are exclusive because the plugin isolates
 * `CODEX_HOME` (which would blind the wrapper's tailer) and DMs from a different
 * identity than the wrapper.
 */
export async function runCodexCommand(
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  return runHarnessAgentCommand("codex", argv, options);
}

/**
 * `tinyplace claude` mirrors `tinyplace codex` exactly — same three
 * mutually-exclusive modes so both agents get the identical onboarding:
 *
 * - default: the **tiny.place TUI** — visible wrapper that surfaces the
 *   OpenHuman connection ("[ Connect with OpenHuman ]"), prompts for the owner,
 *   and runs the real bidirectional bridge while claude runs inside it.
 * - `--raw`: the **transparent harness wrapper** (headless; used by
 *   embedders/tests/smoke).
 * - `--agent`: a first-class **agent** session via the plugin launcher
 *   (`--harness claude`) with its own wallet + MCP tools.
 *
 * Previously bare `tinyplace claude` went straight to the headless wrapper, so
 * claude never got the connect-to-OpenHuman step codex users saw. Routing it
 * through the same dispatch closes that gap.
 */
export async function runClaudeCommand(
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  return runHarnessAgentCommand("claude", argv, options);
}

/**
 * Shared codex/claude dispatch:
 * - `--agent` → plugin launcher
 * - `--raw` → transparent wrapper
 * - **bare** (no args) → interactive TUI onboarding
 * - **args present** → transparent wrapper
 *
 * The last rule matters: the TUI builds the command + OpenHuman owner from env
 * only, so if the caller passed wrapper flags or a `-- <agent-args>` tail (e.g.
 * `tinyplace claude --tinyplace-dm-to @owner -- --model opus`), opening the TUI
 * would silently drop the requested recipient/model. Any explicit args mean the
 * caller wants to wrap a specific session, so route to the wrapper and honor
 * them; the TUI is reserved for the argument-free onboarding entry.
 */
/**
 * `tinyplace opencode` mirrors `tinyplace codex`/`claude` — the same three modes.
 * opencode has no per-session transcript files, so its bridge observes the live
 * session over the local server's SSE bus (`opencode serve` + `opencode attach`)
 * rather than tailing files; the mode dispatch is identical.
 */
export async function runOpencodeCommand(
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  return runHarnessAgentCommand("opencode", argv, options);
}

async function runHarnessAgentCommand(
  harness: TinyVerseAgentKind,
  argv: Array<string>,
  options: TinyPlaceCliOptions,
): Promise<TinyPlaceCliResult> {
  if (wantsAgentMode(argv)) {
    return runAgentTui(harness, argv, options);
  }
  if (wantsRawMode(argv)) {
    return runHarnessCommand(harness, stripFlag(argv, "--raw"), options);
  }
  if (argv.length > 0) {
    return runHarnessCommand(harness, argv, options);
  }
  const ctx = await makeContext(options);
  return runTinyPlaceTui(ctx, options, harness);
}

export function parseCodexWrapperArgs(
  argv: Array<string>,
  env: Record<string, string | undefined> = process.env,
): CodexWrapperConfig {
  return asCodexWrapperConfig(parseHarnessWrapperArgs("codex", argv, env));
}

// ── Agent (TUI) mode ─────────────────────────────────────────────────────────

/** Args after the first `--` are forwarded verbatim; our flags live before it. */
function splitAtForward(argv: Array<string>): { pre: Array<string>; post: Array<string> } {
  const at = argv.indexOf("--");
  if (at === -1) return { pre: argv, post: [] };
  return { pre: argv.slice(0, at), post: argv.slice(at + 1) };
}

/** `--agent` before any `--` selects the plugin launcher (agent mode). */
export function wantsAgentMode(argv: Array<string>): boolean {
  return splitAtForward(argv).pre.some((a) => a === "--agent");
}

/** `--raw` before any `--` selects the transparent harness wrapper (no TUI). */
export function wantsRawMode(argv: Array<string>): boolean {
  return splitAtForward(argv).pre.some((a) => a === "--raw");
}

/** Remove a bare flag from the pre-`--` portion, leaving forwarded args intact. */
function stripFlag(argv: Array<string>, flag: string): Array<string> {
  const { pre, post } = splitAtForward(argv);
  const kept = pre.filter((a) => a !== flag);
  return post.length > 0 || argv.includes("--") ? [...kept, "--", ...post] : kept;
}

/** The published launcher package + its bin subpath, resolved when installed. */
const PLUGIN_PACKAGE = "@tinyhumansai/tinyplace-plugin";
const PLUGIN_BIN_SUBPATH = "bin/tinyplace.mjs";

/**
 * Locate the unified plugin launcher, preferring an in-repo checkout and falling
 * back to an installed `@tinyhumansai/tinyplace-plugin` dependency. Returns null
 * when neither is present (e.g. a published SDK with the plugin not installed).
 *
 * Resolution ladder:
 *   1. In-repo: `codex.js` lives at `sdk/typescript/dist/cli/`, so the launcher
 *      sits at `sdk/plugin-tinyplace/bin/tinyplace.mjs` a few levels up. This is
 *      the path used by OpenHuman's vendored/submodule build.
 *   2. Installed dependency: resolve the package's launcher bin via Node
 *      resolution (works once the plugin is published and depended on).
 */
function resolveUnifiedLauncher(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, "plugin-tinyplace", "bin", "tinyplace.mjs");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  try {
    return createRequire(import.meta.url).resolve(`${PLUGIN_PACKAGE}/${PLUGIN_BIN_SUBPATH}`);
  } catch {
    return null;
  }
}

function resolveBaseUrl(env: Record<string, string | undefined>): string {
  return (
    env.TINYPLACE_ENDPOINT ??
    env.TINYPLACE_API_URL ??
    env.NEXT_PUBLIC_API_URL ??
    DEFAULT_ENDPOINT
  );
}

export interface AgentInvocation {
  wallet: string | undefined;
  autorespond: boolean;
  passthrough: Array<string>;
  forwarded: Array<string>;
}

/** Strip our own flags from `pre`, keep the rest as launcher passthrough. */
export function parseAgentArgs(argv: Array<string>): AgentInvocation {
  const { pre, post } = splitAtForward(argv);
  const passthrough: Array<string> = [];
  let wallet: string | undefined;
  let autorespond = false;
  for (let i = 0; i < pre.length; i += 1) {
    const arg = pre[i];
    if (arg === "--agent" || arg === "--tui") continue;
    if (arg === "--autorespond") {
      autorespond = true;
      continue;
    }
    if (arg === "--wallet") {
      wallet = pre[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--wallet=")) {
      wallet = arg.slice("--wallet=".length);
      continue;
    }
    passthrough.push(arg);
  }
  return { wallet, autorespond, passthrough, forwarded: post };
}

async function runAgentTui(
  harness: TinyVerseAgentKind,
  argv: Array<string>,
  options: TinyPlaceCliOptions,
): Promise<TinyPlaceCliResult> {
  const launcher = resolveUnifiedLauncher();
  if (!launcher) {
    return failure(
      `tinyplace ${harness} --agent needs the unified plugin (${PLUGIN_PACKAGE}), which is not ` +
        "installed. Install it (npm i " +
        `${PLUGIN_PACKAGE}) and re-run, run from a tiny.place checkout, or launch the ` +
        `plugin directly: node sdk/plugin-tinyplace/bin/tinyplace.mjs --harness ${harness}`,
    );
  }
  // An installed dependency (resolved from node_modules) already has its deps;
  // only the in-repo checkout — a standalone package excluded from the workspace
  // — can be missing them, and would otherwise crash with ERR_MODULE_NOT_FOUND.
  // An injected `options.spawn` (tests) never really launches node, so skip the
  // real-launch precondition and let the dispatch/harness wiring be asserted.
  const isInstalledDependency = launcher.includes(`${sep}node_modules${sep}`);
  const pluginDir = dirname(dirname(launcher));
  if (
    options.spawn === undefined &&
    !isInstalledDependency &&
    !existsSync(join(pluginDir, "node_modules"))
  ) {
    return failure(
      `The tiny.place plugin at ${pluginDir} has no node_modules — it is a standalone ` +
        "package excluded from the workspace. Install its deps first: " +
        `(cd ${pluginDir} && pnpm install), then re-run tinyplace ${harness} --agent.`,
    );
  }

  const { wallet, autorespond, passthrough, forwarded } = parseAgentArgs(argv);
  const launcherArgs: Array<string> = [launcher, "--harness", harness];
  if (wallet) launcherArgs.push("--wallet", wallet);
  const forwardTail = [...passthrough, ...forwarded];
  if (forwardTail.length > 0) launcherArgs.push("--", ...forwardTail);

  // Env: make the launched session follow the CLI's environment (prod by
  // default) instead of the plugin's hardcoded staging default, and keep the
  // auto-responder OFF unless explicitly opted in — an unattended agent that
  // LLM-answers strangers should never be implicit.
  const baseEnv = options.env ?? process.env;
  const childEnv: NodeJS.ProcessEnv = { ...baseEnv };
  if (!childEnv.TINYPLACE_API_URL) childEnv.TINYPLACE_API_URL = resolveBaseUrl(baseEnv);
  if (!autorespond && childEnv.TINYPLACE_AUTORESPOND === undefined) {
    childEnv.TINYPLACE_AUTORESPOND = "off";
  }

  const code = await spawnInteractive("node", launcherArgs, childEnv, options.spawn);
  return { code, stdout: "", stderr: "" };
}

function failure(message: string): TinyPlaceCliResult {
  return { code: 1, stdout: "", stderr: `${JSON.stringify({ error: message }, null, 2)}\n` };
}

/**
 * Spawn the interactive launcher, inheriting the TTY; resolve its exit code. A
 * caller-supplied `spawn` (tests) is used instead of the real child_process
 * spawn — the injected form omits `stdio: "inherit"` (its type forbids it) since
 * the test child never touches a real TTY.
 */
function spawnInteractive(
  command: string,
  args: Array<string>,
  env: NodeJS.ProcessEnv,
  injectedSpawn?: TinyPlaceCliOptions["spawn"],
): Promise<number> {
  return new Promise((resolve) => {
    const child = injectedSpawn
      ? injectedSpawn(command, args, { env })
      : spawn(command, args, { stdio: "inherit", env });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 0));
  });
}
