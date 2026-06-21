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
  /**
   * A persisted `siws:` Sign-In With Solana proof. The CLI mints this once from
   * the identity key and reuses it across invocations (until it expires) as the
   * preferred auth credential, rather than re-signing a sign-in message per run.
   */
  siwsToken?: string;
}

export interface CliContext {
  client: TinyPlaceClient;
  signer?: LocalSigner;
  env: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  /** Resolved API endpoint — lets a command rebuild the client around a new key. */
  baseUrl: string;
  /** True when makeContext auto-generated the identity key on this invocation. */
  generated?: boolean;
  /**
   * The hex-encoded 32-byte Ed25519 seed backing {@link signer}, when one is
   * available. Commands that must settle a transaction on-chain (e.g. the paid
   * handle registration) need the raw secret to sign the Solana transfer — the
   * LocalSigner only exposes detached message signing.
   */
  secretKey?: string;
}

export interface TinyPlaceCliResult {
  code: number;
  stdout: string;
  stderr: string;
}
