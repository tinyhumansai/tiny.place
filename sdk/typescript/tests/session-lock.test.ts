import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  acquireSessionLock,
  releaseSessionLock,
} from "../src/cli/session-lock.js";

async function lockDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "tp-lock-"));
}

// A deterministically-dead pid: spawn a process that exits immediately and wait
// for its exit, so `process.kill(pid, 0)` reliably throws ESRCH. Beats a fixed
// high number (which can collide with a real pid on some hosts).
async function reapedPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  const pid = child.pid as number;
  await new Promise<void>((resolveExit) =>
    child.on("exit", () => resolveExit()),
  );
  return pid;
}

describe("acquireSessionLock", () => {
  it("grants the lock and writes a pid stamp", async () => {
    const dir = await lockDir();
    const lock = acquireSessionLock(dir, "claude", "sess-1");
    expect(lock).toBeDefined();
    expect(existsSync(lock!.path)).toBe(true);
    const stamped = JSON.parse(await readFile(lock!.path, "utf8"));
    expect(stamped.pid).toBe(process.pid);
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses a second holder while a LIVE process holds it", async () => {
    const dir = await lockDir();
    // Simulate another live instance: stamp the lock with our parent's pid
    // (a different, running process), so the liveness probe reports "held".
    const path = join(dir, "claude-sess-1.lock");
    await writeFile(
      path,
      JSON.stringify({ pid: process.ppid, at: Date.now() }),
    );

    expect(acquireSessionLock(dir, "claude", "sess-1")).toBeUndefined();
    await rm(dir, { recursive: true, force: true });
  });

  it("reclaims a corrupt / unreadable lock", async () => {
    const dir = await lockDir();
    const path = join(dir, "claude-sess-1.lock");
    await writeFile(path, "not json");

    const lock = acquireSessionLock(dir, "claude", "sess-1");
    expect(lock).toBeDefined();
    await rm(dir, { recursive: true, force: true });
  });

  it("reclaims a lock whose holder process is dead", async () => {
    const dir = await lockDir();
    const path = join(dir, "claude-sess-1.lock");
    // A reaped pid → process.kill(pid, 0) throws ESRCH, exercising the primary
    // isStale liveness branch (not the corrupt path).
    const dead = await reapedPid();
    await writeFile(path, JSON.stringify({ pid: dead, at: Date.now() }));

    const lock = acquireSessionLock(dir, "claude", "sess-1");
    expect(lock).toBeDefined();
    const stamped = JSON.parse(await readFile(lock!.path, "utf8"));
    expect(stamped.pid).toBe(process.pid);
    await rm(dir, { recursive: true, force: true });
  });

  it("re-grants after release", async () => {
    const dir = await lockDir();
    const first = acquireSessionLock(dir, "codex", "sess-2");
    expect(first).toBeDefined();
    releaseSessionLock(first!);
    expect(existsSync(first!.path)).toBe(false);

    const second = acquireSessionLock(dir, "codex", "sess-2");
    expect(second).toBeDefined();
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps different sessions independent", async () => {
    const dir = await lockDir();
    const a = acquireSessionLock(dir, "claude", "sess-a");
    const b = acquireSessionLock(dir, "claude", "sess-b");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.path).not.toBe(b!.path);
    await rm(dir, { recursive: true, force: true });
  });
});
