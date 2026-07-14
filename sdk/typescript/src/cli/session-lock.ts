import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

/**
 * Per-session mutual exclusion for the home resume flow.
 *
 * Resuming a session pins a *stable* OpenHuman thread id (`tp-<agent>-resume-
 * <sessionId>`) so re-resuming continues the same conversation. The hazard is
 * two `tinyplace` instances resuming the SAME session at once: sharing one
 * wallet + one thread key, they double-stream into one OpenHuman thread and two
 * `<agent> --resume <id>` processes scribble into the same session JSONL.
 *
 * The guard is mutual exclusion, not key-uniqueness (uniqueness would defeat the
 * resume continuity): a lockfile keyed on agent+sessionId, taken before launch.
 * A second instance sees it held and refuses. A dead holder's lock is reclaimed
 * via a PID-liveness probe, so a crashed session never wedges a resume forever.
 */

export interface AcquiredSessionLock {
  path: string;
}

/**
 * Try to claim the lock for `agent`/`sessionId`. Returns the handle on success,
 * or undefined when another *live* instance already holds it.
 */
export function acquireSessionLock(
  lockDir: string,
  agent: string,
  sessionId: string,
): AcquiredSessionLock | undefined {
  mkdirSync(lockDir, { recursive: true });
  const path = join(lockDir, `${agent}-${sanitize(sessionId)}.lock`);
  if (writeLock(path)) {
    return { path };
  }
  // Held — reclaim only if the recorded holder is gone, and do it atomically.
  // A plain unlink-then-create lets two contenders both delete the stale file
  // and race the re-create; worse, the second's unlink can wipe the FIRST's
  // fresh lock, leaving two holders. Instead, move the stale file aside with a
  // rename: renameSync is atomic and fails with ENOENT once the source is gone,
  // so only one contender wins the steal. The final claim is still an exclusive
  // `wx` create, which lets at most one winner publish the lock.
  if (isStale(path)) {
    const aside = `${path}.stale-${process.pid}`;
    try {
      renameSync(path, aside);
    } catch {
      // Lost the steal race (already moved/gone) — just try a clean create.
      return writeLock(path) ? { path } : undefined;
    }
    try {
      unlinkSync(aside);
    } catch {
      // Best-effort cleanup of the moved-aside stale file.
    }
    if (writeLock(path)) {
      return { path };
    }
  }
  return undefined;
}

/** Release a previously acquired lock. Best-effort; a missing file is fine. */
export function releaseSessionLock(lock: AcquiredSessionLock): void {
  try {
    unlinkSync(lock.path);
  } catch {
    // Already gone (manual cleanup / reclaimed as stale) — nothing to do.
  }
}

/** Exclusively create the lock file, stamping our pid. False if it exists. */
function writeLock(path: string): boolean {
  let fd: number;
  try {
    fd = openSync(path, "wx"); // wx = create, fail if present (atomic)
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

/** True when the lock's recorded holder is no longer a running process. */
function isStale(path: string): boolean {
  let pid: unknown;
  try {
    pid = JSON.parse(readFileSync(path, "utf8")).pid;
  } catch {
    return true; // unreadable / corrupt / vanished → reclaimable
  }
  if (typeof pid !== "number") {
    return true;
  }
  if (pid === process.pid) {
    return true; // our own leftover from an earlier run in this process
  }
  try {
    process.kill(pid, 0); // signal 0 = liveness probe, no signal delivered
    return false; // alive → genuinely held
  } catch (error) {
    // ESRCH = no such process → dead → stale. EPERM = alive but not ours → held.
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

function sanitize(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9._-]/g, "_");
}
