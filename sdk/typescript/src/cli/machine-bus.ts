// Machine-level session bus: one tiny.place wallet shared by every wrapped
// harness session on a machine.
//
// The wallet's Signal state cannot be used concurrently from two processes —
// the FileSessionStore is a read-modify-write of one JSON file and a double
// ratchet, and the relay inbox read is destructive — so N interactive wrapper
// terminals sharing one `TINYPLACE_CONFIG` need machine-local coordination.
// This module provides it with nothing but the filesystem (no daemon, no
// socket), anchored beside the wallet config:
//
//   <config-dir>/harness-bus/
//     wallet.lock                cross-process mutex around every Signal op
//     sessions/<wsid>.json       registry: one entry per wrapper session,
//                                live/inactive derived from PID liveness
//     inbox/<wsid>/*.json        spool: inbound DMs routed to their session
//     inbox/_default/*.json      untargeted inbound (plaintext DMs)
//
// Every wrapper process registers its session, wraps sends/reads in
// `withLock`, and routes each inbound DM it happens to read: a control frame
// naming another session lands in that session's spool; plaintext lands in the
// default spool, which only the PRIMARY session (earliest-started live one)
// consumes — preserving the single-terminal behavior exactly.

import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import { configPathFor } from "./context.js";
import { parseHarnessControlFrame } from "./harness-control.js";

/** One registered wrapper session on this machine's wallet. */
export interface BusSessionInfo {
  wrapperSessionId: string;
  /** The harness's own session id (codex rollout id, …) once discovered. */
  harnessSessionId?: string;
  provider: string;
  pid: number;
  cwd: string;
  startedAt: string;
  lastSeenAt: string;
  /** Marked on clean shutdown; a dead PID also reads as not live. */
  ended?: boolean;
  /** Computed on read: not ended and the recorded PID is a running process. */
  live: boolean;
}

/** One inbound DM spooled for a session to inject. */
export interface SpooledInbound {
  from: string;
  text: string;
  ts: string;
  /** The session id the sender addressed, when it came from a control frame. */
  sessionId?: string;
}

export interface MachineBus {
  readonly dir: string;
  /** Serialize a wallet-touching operation (send / inbox read / key publish)
   *  across every process on this machine. Reentrant use is NOT supported. */
  withLock<T>(fn: () => Promise<T>): Promise<T>;
  /** Upsert this process's session registry entry. */
  registerSession(): void;
  /** Refresh liveness; optionally record the discovered harness session id. */
  heartbeatSession(patch?: { harnessSessionId?: string }): void;
  /** Mark this session ended (kept on disk so it lists as inactive). */
  endSession(): void;
  /** All registry entries, newest-started first, with liveness computed. */
  listSessions(): Array<BusSessionInfo>;
  /** Route one inbound DM into the spool (by control-frame session id, else
   *  the default spool). */
  routeInbound(from: string, text: string): void;
  /** Drain this session's spool — plus the default spool when this session is
   *  the machine's primary — oldest first. */
  consumeInbound(): Array<SpooledInbound>;
}

export interface MachineBusOptions {
  env?: Record<string, string | undefined>;
  wrapperSessionId: string;
  provider: string;
  cwd: string;
  /** Override the bus directory (tests). Defaults beside the wallet config. */
  busDir?: string;
  /** Lock acquisition budget in ms before an operation fails (default 15s). */
  lockTimeoutMs?: number;
}

const LOCK_RETRY_MS = 30;
/** Registry entries older than this (and not live) are pruned on read. */
const REGISTRY_RETENTION_MS = 24 * 60 * 60 * 1000;

export function createMachineBus(options: MachineBusOptions): MachineBus {
  const env = options.env ?? process.env;
  const dir =
    options.busDir ?? join(dirname(configPathFor(env)), "harness-bus");
  const lockTimeoutMs = options.lockTimeoutMs ?? 15_000;
  const lockPath = join(dir, "wallet.lock");
  const sessionsDir = join(dir, "sessions");
  const inboxDir = join(dir, "inbox");
  const ownSpoolDir = join(inboxDir, sanitize(options.wrapperSessionId));
  const defaultSpoolDir = join(inboxDir, "_default");
  const sessionPath = join(
    sessionsDir,
    `${sanitize(options.wrapperSessionId)}.json`,
  );
  let lastRecordedHarnessSessionId: string | undefined;
  let lastEntryWriteMs = 0;
  /** Plain heartbeats are throttled — publish() fires one per envelope. */
  const HEARTBEAT_MIN_INTERVAL_MS = 5_000;

  function ensureDirs(): void {
    mkdirSync(sessionsDir, { recursive: true });
    mkdirSync(ownSpoolDir, { recursive: true });
    mkdirSync(defaultSpoolDir, { recursive: true });
  }

  function readOwnEntry(): Partial<BusSessionInfo> {
    try {
      return JSON.parse(readFileSync(sessionPath, "utf8")) as BusSessionInfo;
    } catch {
      return {};
    }
  }

  function writeOwnEntry(patch: Partial<BusSessionInfo>): void {
    ensureDirs();
    const existing = readOwnEntry();
    const now = new Date().toISOString();
    const entry = {
      wrapperSessionId: options.wrapperSessionId,
      provider: options.provider,
      pid: process.pid,
      cwd: options.cwd,
      startedAt: existing.startedAt ?? now,
      ...(existing.harnessSessionId
        ? { harnessSessionId: existing.harnessSessionId }
        : {}),
      ...(existing.ended ? { ended: existing.ended } : {}),
      ...patch,
      lastSeenAt: now,
    };
    atomicWrite(sessionPath, `${JSON.stringify(entry, undefined, 2)}\n`);
    lastEntryWriteMs = Date.now();
  }

  function listSessions(): Array<BusSessionInfo> {
    let files: Array<string>;
    try {
      files = readdirSync(sessionsDir).filter((name) =>
        name.endsWith(".json"),
      );
    } catch {
      return [];
    }
    const now = Date.now();
    const sessions: Array<BusSessionInfo> = [];
    for (const name of files) {
      const path = join(sessionsDir, name);
      let entry: BusSessionInfo;
      try {
        entry = JSON.parse(readFileSync(path, "utf8")) as BusSessionInfo;
      } catch {
        continue;
      }
      const live = !entry.ended && pidAlive(entry.pid);
      const lastSeen = Date.parse(entry.lastSeenAt);
      if (
        !live &&
        Number.isFinite(lastSeen) &&
        now - lastSeen > REGISTRY_RETENTION_MS
      ) {
        // Stale inactive entry — prune it (and its spool) best-effort.
        try {
          unlinkSync(path);
        } catch {
          // already gone
        }
        continue;
      }
      sessions.push({ ...entry, live });
    }
    sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return sessions;
  }

  /** The machine's primary session: the earliest-started live one. */
  function primarySessionId(): string | undefined {
    const live = listSessions().filter((session) => session.live);
    if (live.length === 0) {
      return undefined;
    }
    live.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return live[0]?.wrapperSessionId;
  }

  function spoolDirFor(sessionId: string | undefined): string {
    if (!sessionId) {
      return defaultSpoolDir;
    }
    // Match by wrapper session id OR the harness's own session id.
    const target = listSessions().find(
      (session) =>
        session.wrapperSessionId === sessionId ||
        session.harnessSessionId === sessionId,
    );
    return target
      ? join(inboxDir, sanitize(target.wrapperSessionId))
      : defaultSpoolDir;
  }

  function drainSpool(spoolDir: string): Array<SpooledInbound> {
    let files: Array<string>;
    try {
      files = readdirSync(spoolDir)
        .filter((name) => name.endsWith(".json"))
        .sort();
    } catch {
      return [];
    }
    const drained: Array<SpooledInbound> = [];
    for (const name of files) {
      const path = join(spoolDir, name);
      let entry: SpooledInbound;
      try {
        entry = JSON.parse(readFileSync(path, "utf8")) as SpooledInbound;
      } catch {
        try {
          unlinkSync(path);
        } catch {
          // already consumed by a racing process
        }
        continue;
      }
      try {
        unlinkSync(path);
      } catch {
        continue; // another process consumed it first — skip, don't duplicate
      }
      drained.push(entry);
    }
    return drained;
  }

  return {
    dir,

    async withLock<T>(fn: () => Promise<T>): Promise<T> {
      mkdirSync(dir, { recursive: true });
      const deadline = Date.now() + lockTimeoutMs;
      for (;;) {
        if (tryLock(lockPath)) {
          break;
        }
        if (isStaleLock(lockPath)) {
          stealStaleLock(lockPath);
          continue;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `timed out waiting for the machine wallet lock at ${lockPath}`,
          );
        }
        await delay(LOCK_RETRY_MS);
      }
      try {
        return await fn();
      } finally {
        try {
          unlinkSync(lockPath);
        } catch {
          // released by a stale-steal — nothing to do
        }
      }
    },

    registerSession(): void {
      writeOwnEntry({});
    },

    heartbeatSession(patch): void {
      if (
        patch?.harnessSessionId &&
        patch.harnessSessionId !== lastRecordedHarnessSessionId
      ) {
        lastRecordedHarnessSessionId = patch.harnessSessionId;
        writeOwnEntry({ harnessSessionId: patch.harnessSessionId });
        return;
      }
      if (Date.now() - lastEntryWriteMs < HEARTBEAT_MIN_INTERVAL_MS) {
        return;
      }
      writeOwnEntry({});
    },

    endSession(): void {
      writeOwnEntry({ ended: true });
    },

    listSessions,

    routeInbound(from, text): void {
      ensureDirs();
      const frame = parseHarnessControlFrame(text);
      const entry: SpooledInbound = {
        from,
        text: frame ? frame.text : text,
        ts: new Date().toISOString(),
        ...(frame?.session_id ? { sessionId: frame.session_id } : {}),
      };
      const spoolDir = spoolDirFor(frame?.session_id);
      mkdirSync(spoolDir, { recursive: true });
      const name = `${Date.now().toString().padStart(15, "0")}-${randomUUID().slice(0, 8)}.json`;
      atomicWrite(join(spoolDir, name), JSON.stringify(entry));
    },

    consumeInbound(): Array<SpooledInbound> {
      ensureDirs();
      const own = drainSpool(ownSpoolDir);
      const isPrimary = primarySessionId() === options.wrapperSessionId;
      const shared = isPrimary ? drainSpool(defaultSpoolDir) : [];
      return [...own, ...shared].sort((a, b) => a.ts.localeCompare(b.ts));
    },
  };
}

function atomicWrite(path: string, body: string): void {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`;
  writeFileSync(temporary, body, "utf8");
  renameSync(temporary, path);
}

function tryLock(path: string): boolean {
  let fd: number;
  try {
    fd = openSync(path, "wx"); // create-exclusive: at most one winner
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  }
  try {
    writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
  } finally {
    closeSync(fd);
  }
  return true;
}

function isStaleLock(path: string): boolean {
  let pid: unknown;
  try {
    pid = (JSON.parse(readFileSync(path, "utf8")) as { pid?: unknown }).pid;
  } catch {
    return true; // unreadable / vanished → reclaimable
  }
  if (typeof pid !== "number") {
    return true;
  }
  return !pidAlive(pid);
}

/** Steal a stale lock atomically: rename-aside wins for exactly one contender. */
function stealStaleLock(path: string): void {
  const aside = `${path}.stale-${process.pid}`;
  try {
    renameSync(path, aside);
  } catch {
    return; // lost the steal race — the next tryLock decides
  }
  try {
    unlinkSync(aside);
  } catch {
    // best-effort cleanup
  }
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM = alive but not ours. Anything else (ESRCH = gone, EINVAL/ERANGE =
    // impossible pid) reads as dead so a corrupt lock never wedges the wallet.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function sanitize(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9._-]/g, "_");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
