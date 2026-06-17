import type { TinyPlaceClient } from "../client.js";
import type { LocalSigner } from "../local-signer.js";

export type Flags = Record<string, string | boolean | Array<string>>;
export type JsonObject = Record<string, unknown>;
export type OutputFormat = "json" | "md";

export const PACKAGE_NAME = "@tinyhumansai/tinyplace";

export interface ParsedArgs {
  command?: string;
  positionals: Array<string>;
  flags: Flags;
}

export interface TinyPlaceCliCommand {
  name: string;
  capability: string;
  description: string;
  /**
   * Argument signature shown by `tinyplace help` and emitted by
   * `tinyplace commands`. `<positional>` is required, `[--flag]` optional. Lets
   * the CLI self-document its surface so callers don't memorize it elsewhere.
   */
  usage?: string;
}

/**
 * A short conceptual note surfaced by `tinyplace help` / `tinyplace commands`.
 * These carry the cross-command knowledge (lifecycles, payments, encryption)
 * that would otherwise live in external onboarding docs.
 */
export interface TinyPlaceCliGuide {
  topic: string;
  body: string;
}

export interface TinyPlaceCliOptions {
  env?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
}

export interface TinyPlaceCliConfig {
  endpoint?: string;
  secretKey?: string;
}

export interface CliContext {
  client: TinyPlaceClient;
  signer?: LocalSigner;
  env: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
}

export interface TinyPlaceCliResult {
  code: number;
  stdout: string;
  stderr: string;
}
