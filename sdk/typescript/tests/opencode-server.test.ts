import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import {
  startOpenCodeServer,
  type SseConnect,
} from "../src/cli/opencode-source.js";

// Unit-tests startOpenCodeServer with an injected spawn (a fake child) and an
// injected SSE connect — no real `opencode` binary, no network.

class FakeChild extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();
  public exitCode: number | null = null;
  public signalCode: string | null = null;
  public readonly signals: Array<string> = [];
  public kill(signal?: string): boolean {
    this.signals.push(signal ?? "SIGTERM");
    // A real SIGTERM ends the process; emit exit so killChild resolves.
    this.exitCode = 0;
    queueMicrotask(() => this.emit("exit", 0, signal ?? "SIGTERM"));
    return true;
  }
}

interface Spawned {
  child: FakeChild;
  bin: string;
  args: Array<string>;
}

function fakeSpawn(): {
  spawn: (bin: string, args: Array<string>) => FakeChild;
  last: () => Spawned | undefined;
} {
  let last: Spawned | undefined;
  return {
    spawn: (bin: string, args: Array<string>): FakeChild => {
      const child = new FakeChild();
      last = { child, bin, args };
      return child;
    },
    last: () => last,
  };
}

/** Connect that yields the server.connected frame immediately, then idles. */
const connectReady: SseConnect = async function* (_url, signal) {
  yield JSON.stringify({ type: "server.connected" });
  await new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
};

/** Connect that never yields — readiness must come from the stdout line. */
const connectNever: SseConnect = (_url, signal) => ({
  async *[Symbol.asyncIterator]() {
    await new Promise<void>((resolve) => {
      if (signal.aborted) return resolve();
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  },
});

describe("startOpenCodeServer", () => {
  it("spawns `opencode serve` on a free port and resolves on server.connected", async () => {
    const s = fakeSpawn();
    const handle = await startOpenCodeServer({
      bin: "opencode",
      cwd: "/work/proj",
      env: {},
      spawn: s.spawn as never,
      connect: connectReady,
    });
    const spawned = s.last();
    expect(spawned?.bin).toBe("opencode");
    expect(spawned?.args[0]).toBe("serve");
    expect(spawned?.args).toContain("--port");
    expect(spawned?.args).toContain("--hostname");
    // The resolved url embeds the chosen port and is loopback-only.
    expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(handle.url.endsWith(String(handle.port))).toBe(true);
    await handle.stop();
  });

  it("falls back to the stdout 'listening on' line for readiness", async () => {
    const s = fakeSpawn();
    const pending = startOpenCodeServer({
      bin: "opencode",
      cwd: "/work/proj",
      env: {},
      spawn: s.spawn as never,
      connect: connectNever,
    });
    // Emit the listening banner once the child exists.
    await new Promise((resolve) => setTimeout(resolve, 10));
    s.last()?.child.stdout.emit(
      "data",
      "opencode server listening on http://127.0.0.1:9",
    );
    const handle = await pending;
    expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    await handle.stop();
  });

  it("stop() terminates the child", async () => {
    const s = fakeSpawn();
    const handle = await startOpenCodeServer({
      bin: "opencode",
      cwd: "/work/proj",
      env: {},
      spawn: s.spawn as never,
      connect: connectReady,
    });
    await handle.stop();
    expect(s.last()?.child.signals).toContain("SIGTERM");
  });

  it("rejects when the child keeps exiting before readiness", async () => {
    // Every spawned child exits immediately — the port-race retry fires once,
    // then the second failure propagates.
    let spawns = 0;
    const autoExitSpawn = (): FakeChild => {
      spawns += 1;
      const child = new FakeChild();
      queueMicrotask(() => {
        child.exitCode = 1;
        child.emit("exit", 1, null);
      });
      return child;
    };
    await expect(
      startOpenCodeServer({
        bin: "opencode",
        cwd: "/work/proj",
        env: {},
        spawn: autoExitSpawn as never,
        connect: connectNever,
        readyTimeoutMs: 1_000,
      }),
    ).rejects.toThrow(/exited before ready/i);
    expect(spawns).toBe(2); // one retry
  });
});
