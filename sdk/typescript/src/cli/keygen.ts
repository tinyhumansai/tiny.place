import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { availableParallelism, homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { ed25519 } from "@noble/curves/ed25519.js";
import { TinyPlaceClient } from "../client.js";
import { publicKeyToSolanaAddress } from "../crypto.js";
import { LocalSigner } from "../local-signer.js";
import {
  boolFlag,
  bytesToHex,
  hexToBytes,
  numberFlag,
  requiredFlag,
} from "./args.js";
import { signalStoreFor } from "./context.js";
import type { CliContext, Flags } from "./types.js";

// A tiny.place wallet address is the base58 Solana address (== signer.agentId).
// Matching is case-insensitive, so a base58 address lowercases to [1-9a-z]: any
// letter or a digit 1-9 is a valid prefix character (only "0" is impossible).
const VALID_PREFIX_CHARS = "123456789abcdefghijklmnopqrstuvwxyz";
const MAX_TIMEOUT_SECONDS = 60;

export interface VanityHit {
  seedHex: string;
  address: string;
  attempts: number;
}

export interface VanityWallet extends VanityHit {
  matched: boolean;
}

export function validateVanityPrefix(prefix: string): void {
  if (!prefix) {
    throw new Error("usage: --vanity <prefix>");
  }
  for (const char of prefix.toLowerCase()) {
    if (!VALID_PREFIX_CHARS.includes(char)) {
      throw new Error(
        `'${char}' can never appear in a wallet address — base58 has no "0" (zero) and no symbols. ` +
          "Use letters or digits 1-9.",
      );
    }
  }
}

function randomSeed(): Uint8Array {
  // Fresh CSPRNG bytes every attempt — the grind is fully randomized.
  const seed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(seed);
  return seed;
}

function addressForSeed(seed: Uint8Array): string {
  return publicKeyToSolanaAddress(ed25519.getPublicKey(seed));
}

/** Grinds random keypairs until the address starts (case-insensitively) with `prefix`, or the budget runs out. */
export function grindVanity(
  prefix: string,
  options: { timeoutMs: number; now: () => number },
): VanityHit | null {
  const needle = prefix.toLowerCase();
  const deadline = options.now() + options.timeoutMs;
  let attempts = 0;
  while (options.now() < deadline) {
    // Batch so we don't read the clock every iteration.
    for (let index = 0; index < 5000; index += 1) {
      attempts += 1;
      const seed = randomSeed();
      const address = addressForSeed(seed);
      if (address.slice(0, prefix.length).toLowerCase() === needle) {
        return { seedHex: bytesToHex(seed), address, attempts };
      }
    }
  }
  return null;
}

/** Grinds for a vanity prefix within the budget; on timeout, returns a fresh random wallet. */
export function generateVanityWallet(
  prefix: string,
  options: { timeoutMs: number; now: () => number },
): VanityWallet {
  const hit = grindVanity(prefix, options);
  if (hit) {
    return { ...hit, matched: true };
  }
  const seed = randomSeed();
  return {
    seedHex: bytesToHex(seed),
    address: addressForSeed(seed),
    attempts: 0,
    matched: false,
  };
}

/** How many grind workers to spawn by default — every core, leaving one for the main thread. */
export function defaultWorkerCount(): number {
  return Math.max(1, availableParallelism() - 1);
}

/**
 * Multi-threaded grind: fans the search across `workers` threads (default: one per
 * spare CPU core) and returns the first hit, or null when the budget elapses. Falls
 * back to the single-threaded {@link grindVanity} when only one worker is requested
 * or the compiled worker file is absent (e.g. under the test runner's source view),
 * so behaviour is identical — just faster — wherever real workers can't run.
 */
export async function grindVanityParallel(
  prefix: string,
  options: { timeoutMs: number; workers?: number },
): Promise<VanityHit | null> {
  const needle = prefix.toLowerCase();
  const workerCount = Math.max(
    1,
    Math.floor(options.workers ?? defaultWorkerCount()),
  );
  const workerUrl = new URL("./keygen-worker.js", import.meta.url);
  if (workerCount === 1 || !existsSync(fileURLToPath(workerUrl))) {
    return grindVanity(prefix, {
      timeoutMs: options.timeoutMs,
      now: () => Date.now(),
    });
  }

  return new Promise<VanityHit | null>((resolve) => {
    const workers: Array<Worker> = [];
    let settled = false;
    let errored = 0;

    const cleanup = (): void => {
      for (const worker of workers) {
        void worker.terminate();
      }
    };
    const settle = (hit: VanityHit | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(hit);
    };
    const timer = setTimeout(() => settle(null), options.timeoutMs);

    for (let index = 0; index < workerCount; index += 1) {
      let worker: Worker;
      try {
        worker = new Worker(workerUrl, {
          workerData: { needle, prefixLength: prefix.length },
        });
      } catch {
        // Couldn't spawn — if none of them can, drop to the single-threaded grind.
        errored += 1;
        if (errored === workerCount && !settled) {
          settle(
            grindVanity(prefix, {
              timeoutMs: options.timeoutMs,
              now: () => Date.now(),
            }),
          );
        }
        continue;
      }
      workers.push(worker);
      worker.on("message", (hit: VanityHit) => settle(hit));
      worker.on("error", () => {
        // A dead worker shouldn't abort the others; only give up if all die.
        errored += 1;
        if (errored === workerCount && !settled) {
          settle(
            grindVanity(prefix, {
              timeoutMs: options.timeoutMs,
              now: () => Date.now(),
            }),
          );
        }
      });
    }
  });
}

/** Async, multi-threaded counterpart to {@link generateVanityWallet}. */
export async function generateVanityWalletParallel(
  prefix: string,
  options: { timeoutMs: number; workers?: number },
): Promise<VanityWallet> {
  const hit = await grindVanityParallel(prefix, options);
  if (hit) {
    return { ...hit, matched: true };
  }
  const seed = randomSeed();
  return {
    seedHex: bytesToHex(seed),
    address: addressForSeed(seed),
    attempts: 0,
    matched: false,
  };
}

/** Clamps a requested grind budget to the supported [1, 60]s window. */
export function clampTimeoutSeconds(requested: number | undefined): number {
  return Math.min(
    MAX_TIMEOUT_SECONDS,
    Math.max(1, requested ?? MAX_TIMEOUT_SECONDS),
  );
}

export interface VanityIdentity {
  signer: LocalSigner;
  client: TinyPlaceClient;
  address: string;
  prefix: string;
  matched: boolean;
  attempts: number;
  seconds: number;
  workers: number;
}

/**
 * Grinds a vanity wallet (case-insensitive prefix, ≤60s, random fallback on
 * timeout), persists it as the identity key, and returns a signer + client rebuilt
 * around it. Shared by `keygen` and the `init` workflow so both grind identically.
 * The grind fans out across CPU cores; pass `workers` to override the default.
 */
export async function grindVanityIdentity(
  ctx: CliContext,
  prefix: string,
  timeoutSeconds: number,
  workers?: number,
  force = false,
): Promise<VanityIdentity> {
  validateVanityPrefix(prefix);
  const timeoutMs = clampTimeoutSeconds(timeoutSeconds) * 1000;
  const workerCount = Math.max(1, Math.floor(workers ?? defaultWorkerCount()));
  const startedAt = Date.now();
  const wallet = await generateVanityWalletParallel(prefix, {
    timeoutMs,
    workers: workerCount,
  });
  const seconds = Math.round((Date.now() - startedAt) / 100) / 10;
  await persistSecretKey(ctx.env, wallet.seedHex, { force });
  const signer = await LocalSigner.fromSeed(hexToBytes(wallet.seedHex));
  const client = new TinyPlaceClient({
    baseUrl: ctx.baseUrl,
    signer,
    encryption: { store: await signalStoreFor(ctx.env, signer) },
    fetch: ctx.fetch,
  });
  return {
    signer,
    client,
    address: wallet.address,
    prefix,
    matched: wallet.matched,
    attempts: wallet.attempts,
    seconds,
    workers: workerCount,
  };
}

export async function runKeygen(
  ctx: CliContext,
  flags: Flags,
): Promise<unknown> {
  const prefix = requiredFlag(flags, "vanity");
  validateVanityPrefix(prefix);
  const timeoutSeconds = clampTimeoutSeconds(numberFlag(flags, "timeout"));
  const timeoutMs = timeoutSeconds * 1000;
  const workers = Math.max(
    1,
    Math.floor(numberFlag(flags, "workers") ?? defaultWorkerCount()),
  );

  // Never silently destroy a real wallet: persist refuses to overwrite an
  // existing saved key unless --force, or unless the on-disk key is the throwaway
  // this run just auto-generated (ctx.generated).
  const force = boolFlag(flags, "force") || Boolean(ctx.generated);

  const startedAt = Date.now();
  const wallet = await generateVanityWalletParallel(prefix, {
    timeoutMs,
    workers,
  });
  const seconds = Math.round((Date.now() - startedAt) / 100) / 10;

  await persistSecretKey(ctx.env, wallet.seedHex, { force });
  return {
    wallet: wallet.address,
    prefix,
    matched: wallet.matched,
    ...(wallet.matched
      ? { attempts: wallet.attempts }
      : { fallbackRandom: true }),
    seconds,
    workers,
    saved: true,
    previousWallet: ctx.signer?.agentId,
    note: wallet.matched
      ? `Vanity wallet saved as your identity (ground across ${workers} core(s)). Back up ~/.tinyplace/config.json — losing it loses the wallet.`
      : `No '${prefix}' wallet found within ${timeoutSeconds}s across ${workers} core(s) — saved a random wallet instead. ` +
        "Back up ~/.tinyplace/config.json — losing it loses the wallet.",
  };
}

/**
 * Thrown when persisting a freshly generated key would overwrite an existing
 * saved wallet and `--force` was not given. Surfaced to the user as a CLI error.
 */
export class WalletExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletExistsError";
  }
}

/**
 * Persists the identity key to the CLI config. By default it REFUSES to
 * overwrite an existing, different saved key — overwriting would permanently
 * destroy that wallet (and its @handles/funds). Callers pass `force` only when
 * the user explicitly asked (`--force`) or when the on-disk key is the throwaway
 * the same invocation just auto-generated (`ctx.generated`). Re-running `keygen`
 * or `init --vanity` on a real wallet therefore fails loudly instead of
 * silently clobbering it (the incident this guards against).
 */
async function persistSecretKey(
  env: Record<string, string | undefined>,
  secretKey: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const configPath =
    env.TINYPLACE_CONFIG ?? join(homedir(), ".tinyplace", "config.json");
  let existing: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  } catch {
    // No existing config — start fresh.
  }

  const current = existing.secretKey;
  if (
    !options.force &&
    typeof current === "string" &&
    current.trim() !== "" &&
    current !== secretKey
  ) {
    let wallet = "";
    try {
      wallet = addressForSeed(hexToBytes(current));
    } catch {
      // Can't derive the address (unexpected key format) — still refuse; show the path.
    }
    throw new WalletExistsError(
      `Refusing to overwrite the existing wallet${wallet ? ` (${wallet})` : ""} saved at ${configPath}. ` +
        "Replacing it would PERMANENTLY destroy that key — and any @handles or funds it holds. " +
        "Back up that file first, then re-run with --force to replace it.",
    );
  }

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify({ ...existing, secretKey }, null, 2)}\n`,
    { mode: 0o600 },
  );
}
