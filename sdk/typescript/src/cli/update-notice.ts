import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { configPathFor } from "./context.js";
import { readCliVersion } from "./maintenance.js";
import { PACKAGE_NAME } from "./types.js";

/**
 * Passive "you're running an old build" nudge. Most CLI invocations are made by
 * autonomous agents that will happily run a stale SDK forever, so on every
 * normal command we cheaply compare the installed version against npm's
 * `latest` and, when behind, append a one-paragraph notice to stderr telling
 * both the agent and the human operator exactly which command upgrades them.
 *
 * It is deliberately unobtrusive: the registry is probed at most once a day
 * (result cached next to the config), the lookup is time-boxed so a slow or
 * offline network never delays the command, every failure mode degrades to "no
 * notice", and `TINYPLACE_NO_UPDATE_NOTICE` / `NO_UPDATE_NOTIFIER` silence it.
 * It only ever writes to stderr, leaving the machine-readable stdout untouched.
 */

/** How long a cached `latest` lookup stays fresh before we re-probe npm. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Cap the registry probe so a slow/offline network never stalls a command. */
const FETCH_TIMEOUT_MS = 1500;

const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;

interface UpdateCache {
  latest: string;
  checkedAt: number;
}

export interface UpdateNoticeOptions {
  env: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  /** Injectable clock for tests; defaults to wall-clock time. */
  now?: number;
}

/**
 * Resolve the upgrade notice for the current invocation, or `""` when none is
 * warranted (already current, opted out, version unknown, or any error). Never
 * throws — callers can append the result to stderr unconditionally.
 */
export async function updateNotice(options: UpdateNoticeOptions): Promise<string> {
  const { env } = options;
  if (isTruthy(env.TINYPLACE_NO_UPDATE_NOTICE) || isTruthy(env.NO_UPDATE_NOTIFIER)) {
    return "";
  }
  try {
    const current = await readCliVersion();
    if (current === "unknown") {
      return "";
    }
    const latest = await resolveLatest(options);
    if (!latest || !isNewer(latest, current)) {
      return "";
    }
    return formatNotice(current, latest);
  } catch {
    return "";
  }
}

/**
 * Return the newest published version, served from the daily cache when fresh
 * and otherwise re-probed from npm. A failed probe falls back to a stale cached
 * value (so offline runs still nudge), and `null` when nothing is known.
 */
async function resolveLatest(options: UpdateNoticeOptions): Promise<string | null> {
  const now = options.now ?? Date.now();
  const cachePath = cachePathFor(options.env);
  const cached = await readCache(cachePath);
  if (cached && now - cached.checkedAt < CHECK_INTERVAL_MS) {
    return cached.latest;
  }
  const latest = await fetchLatest(options.fetch);
  if (latest) {
    await writeCache(cachePath, { latest, checkedAt: now });
    return latest;
  }
  return cached?.latest ?? null;
}

async function fetchLatest(fetchImpl?: typeof globalThis.fetch): Promise<string | null> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await doFetch(REGISTRY_URL, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { version?: unknown };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function cachePathFor(env: Record<string, string | undefined>): string {
  return join(dirname(configPathFor(env)), "update-check.json");
}

async function readCache(path: string): Promise<UpdateCache | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as UpdateCache).latest === "string" &&
      typeof (parsed as UpdateCache).checkedAt === "number"
    ) {
      return parsed as UpdateCache;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCache(path: string, cache: UpdateCache): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
  } catch {
    // Best-effort: a read-only home dir just means we re-probe next time.
  }
}

/**
 * True when `latest` is a strictly higher release than `current`, comparing
 * major.minor.patch numerically. Prerelease suffixes are ignored, and any
 * unparseable input falls back to plain string inequality so we err toward
 * surfacing (rather than hiding) a mismatch.
 */
function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) {
    return latest !== current;
  }
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) {
      return true;
    }
    if (a[index] < b[index]) {
      return false;
    }
  }
  return false;
}

function parseVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function formatNotice(current: string, latest: string): string {
  return [
    "",
    `╭─ Update available for ${PACKAGE_NAME}: ${current} → ${latest}`,
    "│  Upgrade with:  tinyplace update",
    `│  or directly:   npm install -g ${PACKAGE_NAME}@latest`,
    "╰─ Silence this with TINYPLACE_NO_UPDATE_NOTICE=1",
    "",
  ].join("\n");
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}
