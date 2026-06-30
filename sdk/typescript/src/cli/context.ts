import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { TinyPlaceClient } from "../client.js";
import { LocalSigner } from "../local-signer.js";
import { FileSessionStore } from "../node/index.js";
import { bytesToHex, hexToBytes } from "./args.js";
import type {
  CliContext,
  TinyPlaceCliConfig,
  TinyPlaceCliOptions,
} from "./types.js";

const DEFAULT_ENDPOINT = "https://api-v2.tiny.place";

export async function makeContext(
  options: TinyPlaceCliOptions,
): Promise<CliContext> {
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
  // Adopt the persisted SIWS proof when one is stored; LocalSigner ignores it if
  // it is stale or belongs to a different key and mints a fresh one instead.
  const signer = seed
    ? await LocalSigner.fromSeed(hexToBytes(seed), {
        ...(config.siwsToken ? { siwsToken: config.siwsToken } : {}),
      })
    : undefined;
  // Persist the SIWS proof the signer settled on (a freshly minted or rotated
  // token) so the next managed-CLI run reuses it instead of re-minting. Skipped
  // for embedder/test env (the CLI never writes a key/token on their behalf).
  if (managed && signer) {
    const token = signer.persistableSiwsToken();
    if (token && token !== config.siwsToken) {
      await persistConfig(env, {
        ...config,
        ...(seed ? { secretKey: seed } : {}),
        siwsToken: token,
      });
    }
  }

  // Transparent Signal E2E: persist ratchet/pre-key state next to the identity key
  // (~/.tinyplace/signal/<address>.json). The X25519 identity is derived from the
  // same seed, so it never needs to be written to disk.
  const encryption = signer
    ? { store: await signalStoreFor(env, signer) }
    : undefined;

  const client = new TinyPlaceClient({
    baseUrl,
    ...(signer ? { signer } : {}),
    ...(encryption ? { encryption } : {}),
    fetch: options.fetch,
  });
  return {
    client,
    signer,
    env,
    fetch: options.fetch,
    baseUrl,
    generated,
    ...(seed ? { secretKey: seed } : {}),
  };
}

/**
 * Build the filesystem-backed Signal store for an identity, persisting alongside
 * the wallet config (`<config-dir>/signal/<address>.json`). Shared by makeContext
 * and the vanity-grind path so a freshly minted wallet is immediately E2E-capable.
 */
export async function signalStoreFor(
  env: Record<string, string | undefined>,
  signer: LocalSigner,
): Promise<FileSessionStore> {
  const signalDir = join(dirname(configPathFor(env)), "signal");
  return new FileSessionStore(
    FileSessionStore.defaultPath(signer.publicKeyBase64, signalDir),
    await signer.getX25519KeyPair(),
  );
}

/** Absolute path of the CLI config/key file (overridable via TINYPLACE_CONFIG). */
export function configPathFor(env: Record<string, string | undefined>): string {
  return env.TINYPLACE_CONFIG ?? join(homedir(), ".tinyplace", "config.json");
}

/** Directory holding the persisted Signal ratchet/pre-key state. */
export function signalDirFor(env: Record<string, string | undefined>): string {
  return join(dirname(configPathFor(env)), "signal");
}

function randomSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(seed);
  return seed;
}

async function loadCliConfig(
  env: Record<string, string | undefined>,
): Promise<TinyPlaceCliConfig> {
  try {
    const parsed = JSON.parse(
      await readFile(configPathFor(env), "utf8"),
    ) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const config = parsed as Record<string, unknown>;
    return {
      ...(typeof config.endpoint === "string"
        ? { endpoint: config.endpoint }
        : {}),
      ...(typeof config.secretKey === "string"
        ? { secretKey: config.secretKey }
        : {}),
      ...(typeof config.siwsToken === "string"
        ? { siwsToken: config.siwsToken }
        : {}),
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
  await persistConfig(env, { ...config, secretKey });
}

/** Best-effort write of the CLI config (key + SIWS proof) at mode 0600. */
async function persistConfig(
  env: Record<string, string | undefined>,
  config: TinyPlaceCliConfig,
): Promise<void> {
  const configPath = configPathFor(env);
  try {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
      mode: 0o600,
    });
  } catch {
    // Read-only home or similar — keep using the in-memory key/token this run.
  }
}
