import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { FileSessionStore } from "../node/index.js";
import { boolFlag, stringFlag } from "./args.js";
import { configPathFor, signalDirFor } from "./context.js";
import { PACKAGE_NAME } from "./types.js";
import type { CliContext, Flags } from "./types.js";

const execFileAsync = promisify(execFile);

export async function selfUpdate(flags: Flags): Promise<unknown> {
  const packageManager = stringFlag(flags, "pm") ?? "npm";
  const target = `${PACKAGE_NAME}@${stringFlag(flags, "tag") ?? "latest"}`;
  const args = installArgs(packageManager, target);
  const command = `${packageManager} ${args.join(" ")}`;
  if (boolFlag(flags, "dry-run")) {
    return { command, dryRun: true };
  }
  try {
    const { stdout, stderr } = await execFileAsync(packageManager, args, { timeout: 180_000 });
    return { command, ok: true, stdout: stdout.trim(), ...(stderr.trim() ? { stderr: stderr.trim() } : {}) };
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string; message?: string };
    throw Object.assign(new Error(`update failed: ${detail.stderr?.trim() || detail.message}`), {
      body: { command, stdout: detail.stdout?.trim(), stderr: detail.stderr?.trim() },
    });
  }
}

function installArgs(packageManager: string, target: string): Array<string> {
  switch (packageManager) {
    case "pnpm":
      return ["add", "-g", target];
    case "yarn":
      return ["global", "add", target];
    case "bun":
      return ["add", "-g", target];
    default:
      return ["install", "-g", target];
  }
}

export async function cliVersionInfo(ctx: CliContext, flags: Flags): Promise<unknown> {
  const version = await readCliVersion();
  if (!boolFlag(flags, "check")) {
    return { version };
  }
  const latest = await fetchLatestVersion(ctx.fetch);
  return { version, latest, updateAvailable: latest !== null && latest !== version };
}

/**
 * Diagnostics dump: where the CLI is pointed and where it reads/writes state —
 * server/RPC URLs, the resolved config + Signal paths, the active identity, and
 * the env vars that drive resolution. Safe to share: the identity secret is
 * never included, only its source and the derived public address. Use it to
 * debug "wrong server / wrong key / wrong file" problems.
 */
export async function debugInfo(ctx: CliContext): Promise<unknown> {
  const env = ctx.env;
  const version = await readCliVersion();
  const configPath = configPathFor(env);
  const signalDir = signalDirFor(env);

  // Mirror the endpoint precedence in makeContext so the source is reported.
  const endpointSource = env.TINYPLACE_ENDPOINT
    ? "env:TINYPLACE_ENDPOINT"
    : env.TINYPLACE_API_URL
      ? "env:TINYPLACE_API_URL"
      : env.NEXT_PUBLIC_API_URL
        ? "env:NEXT_PUBLIC_API_URL"
        : (await configHasEndpoint(configPath))
          ? `config:${configPath}`
          : "default";

  const secretSource = env.TINYPLACE_SECRET_KEY
    ? "env:TINYPLACE_SECRET_KEY"
    : ctx.generated
      ? "generated"
      : ctx.secretKey
        ? `config:${configPath}`
        : "none";

  const publicKey = ctx.signer?.publicKeyBase64;
  const identity = ctx.signer
    ? {
        agentId: ctx.signer.agentId,
        publicKey,
        source: secretSource,
        generatedThisRun: Boolean(ctx.generated),
      }
    : { source: secretSource };

  return {
    version,
    server: {
      baseUrl: ctx.baseUrl,
      source: endpointSource,
      // The CLI's Solana RPC defaults to the backend's proxy; override per
      // command with --rpc-url.
      rpcUrl: `${ctx.baseUrl.replace(/\/+$/, "")}/solana/rpc`,
    },
    identity,
    paths: {
      config: configPath,
      configExists: await fileExists(configPath),
      signalDir,
      ...(publicKey
        ? { signalStore: FileSessionStore.defaultPath(publicKey, signalDir) }
        : {}),
    },
    // URL/config resolution inputs only. The secret is never echoed here; where
    // the active key came from is reported by `identity.source` instead.
    env: {
      TINYPLACE_ENDPOINT: env.TINYPLACE_ENDPOINT ?? null,
      TINYPLACE_API_URL: env.TINYPLACE_API_URL ?? null,
      NEXT_PUBLIC_API_URL: env.NEXT_PUBLIC_API_URL ?? null,
      TINYPLACE_CONFIG: env.TINYPLACE_CONFIG ?? null,
    },
    runtime: {
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      managed: env === process.env,
    },
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function configHasEndpoint(configPath: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { endpoint?: unknown }).endpoint === "string"
    );
  } catch {
    return false;
  }
}

export async function readCliVersion(): Promise<string> {
  try {
    // src/cli/maintenance.ts and dist/cli/maintenance.js are both two levels
    // below the package root, so ../../package.json resolves in source and build.
    const packageUrl = new URL("../../package.json", import.meta.url);
    const pkg = JSON.parse(await readFile(packageUrl, "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function fetchLatestVersion(fetchImpl?: typeof globalThis.fetch): Promise<string | null> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  try {
    const response = await doFetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`);
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { version?: unknown };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}
