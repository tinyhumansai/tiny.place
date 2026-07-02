import {
  asCodexWrapperConfig,
  parseHarnessWrapperArgs,
  runHarnessCommand,
  type CodexWrapperConfig,
} from "./harness-wrapper.js";
import type { TinyPlaceCliOptions, TinyPlaceCliResult } from "./types.js";

export async function runCodexCommand(
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  return runHarnessCommand("codex", argv, options);
}

export async function runClaudeCommand(
  argv: Array<string>,
  options: TinyPlaceCliOptions = {},
): Promise<TinyPlaceCliResult> {
  return runHarnessCommand("claude", argv, options);
}

export function parseCodexWrapperArgs(
  argv: Array<string>,
  env: Record<string, string | undefined> = process.env,
): CodexWrapperConfig {
  return asCodexWrapperConfig(parseHarnessWrapperArgs("codex", argv, env));
}
