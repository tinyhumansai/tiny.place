import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { TinyPlaceClient } from "../client.js";
import { LocalSigner } from "../local-signer.js";
import { bytesToHex, hexToBytes } from "./args.js";
import type { CliContext, TinyPlaceCliConfig, TinyPlaceCliOptions } from "./types.js";

const DEFAULT_ENDPOINT = "https://api.tiny.place";

export async function makeContext(options: TinyPlaceCliOptions): Promise<CliContext> {
  // "Managed mode" is the real `tinyplace` bin (no env override): the CLI owns the
  // identity key and persists it. When an embedder/test passes its own env, stay
  // explicit — never generate or write a key on their behalf.
  const managed = options.env === undefined;
  const env = options.env ?? process.env;
  const config = await loadCliConfig(env);
  const baseUrl =
    env.TINYPLACE_ENDPOINT ??
    env.TINYPLACE_API_URL ??
    env.NEXT_PUBLIC_API_URL ??
    config.endpoint ??
    DEFAULT_ENDPOINT;

  let seed = env.TINYPLACE_SECRET_KEY ?? config.secretKey;
  let generated = false;
  if (!seed && managed) {
    seed = bytesToHex(randomSeed());
    generated = true;
    await persistSecretKey(env, config, seed);
  }
  const signer = seed ? await LocalSigner.fromSeed(hexToBytes(seed)) : undefined;

  const client = new TinyPlaceClient({
    baseUrl,
    ...(signer ? { signer } : {}),
    fetch: options.fetch,
  });
  return { client, signer, env, fetch: options.fetch, baseUrl, generated };
}

function configPathFor(env: Record<string, string | undefined>): string {
  return env.TINYPLACE_CONFIG ?? join(homedir(), ".tinyplace", "config.json");
}

function randomSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(seed);
  return seed;
}

async function loadCliConfig(env: Record<string, string | undefined>): Promise<TinyPlaceCliConfig> {
  try {
    const parsed = JSON.parse(await readFile(configPathFor(env), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const config = parsed as Record<string, unknown>;
    return {
      ...(typeof config.endpoint === "string" ? { endpoint: config.endpoint } : {}),
      ...(typeof config.secretKey === "string" ? { secretKey: config.secretKey } : {}),
    };
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

/** Best-effort persistence of an auto-generated identity key (mode 0600). */
async function persistSecretKey(
  env: Record<string, string | undefined>,
  config: TinyPlaceCliConfig,
  secretKey: string,
): Promise<void> {
  const configPath = configPathFor(env);
  try {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify({ ...config, secretKey }, null, 2)}\n`, { mode: 0o600 });
  } catch {
    // Read-only home or similar — keep using the in-memory key for this run.
  }
}
