import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  encodeHarnessControlFrame,
  parseHarnessControlFrame,
} from "../src/cli/harness-control.js";
import { createMachineBus, type MachineBus } from "../src/cli/machine-bus.js";

describe("harness control frames", () => {
  it("round-trips a session-addressed input frame", () => {
    const wire = encodeHarnessControlFrame("run the tests", {
      sessionId: "0199a-codex-rollout",
    });
    const frame = parseHarnessControlFrame(wire);
    expect(frame).toEqual({
      control_version: "tinyplace.harness.control.v1",
      kind: "input",
      session_id: "0199a-codex-rollout",
      text: "run the tests",
    });
  });

  it("omits session_id when unaddressed (primary-session semantics)", () => {
    const frame = parseHarnessControlFrame(
      encodeHarnessControlFrame("hello"),
    );
    expect(frame?.session_id).toBeUndefined();
    expect(frame?.text).toBe("hello");
  });

  it("rejects plaintext, foreign JSON, and malformed frames", () => {
    expect(parseHarnessControlFrame("just a prompt")).toBeUndefined();
    expect(
      parseHarnessControlFrame(JSON.stringify({ envelope_version: "x" })),
    ).toBeUndefined();
    expect(
      parseHarnessControlFrame(
        JSON.stringify({
          control_version: "tinyplace.harness.control.v1",
          kind: "input",
        }),
      ),
    ).toBeUndefined();
    expect(parseHarnessControlFrame("{not json")).toBeUndefined();
  });
});

describe("machine session bus", () => {
  let busDir: string;

  beforeEach(() => {
    busDir = mkdtempSync(join(tmpdir(), "tp-machine-bus-"));
  });

  afterEach(() => {
    rmSync(busDir, { force: true, recursive: true });
  });

  function makeBus(wrapperSessionId: string, startedAtOffset = 0): MachineBus {
    const bus = createMachineBus({
      busDir,
      cwd: "/work",
      env: {},
      provider: "codex",
      wrapperSessionId,
    });
    bus.registerSession();
    // Session ordering is by startedAt; tests register in call order and the
    // ISO timestamps of two immediate registrations can collide, so nudge via
    // a heartbeat when an explicit ordering matters.
    if (startedAtOffset > 0) {
      bus.heartbeatSession();
    }
    return bus;
  }

  it("registers sessions and lists them with liveness", () => {
    const bus = makeBus("session-a");
    const sessions = bus.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      wrapperSessionId: "session-a",
      provider: "codex",
      pid: process.pid,
      live: true,
    });
  });

  it("records the harness session id from a heartbeat patch", () => {
    const bus = makeBus("session-a");
    bus.heartbeatSession({ harnessSessionId: "rollout-123" });
    expect(bus.listSessions()[0]?.harnessSessionId).toBe("rollout-123");
  });

  it("marks an ended session inactive but keeps it listed", () => {
    const bus = makeBus("session-a");
    bus.endSession();
    const sessions = bus.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.live).toBe(false);
    expect(sessions[0]?.ended).toBe(true);
  });

  it("routes a session-addressed control frame to that session's spool", () => {
    const first = makeBus("session-a");
    const second = makeBus("session-b");
    second.heartbeatSession({ harnessSessionId: "rollout-b" });

    first.routeInbound(
      "owner",
      encodeHarnessControlFrame("for b, by wrapper id", {
        sessionId: "session-b",
      }),
    );
    first.routeInbound(
      "owner",
      encodeHarnessControlFrame("for b, by harness id", {
        sessionId: "rollout-b",
      }),
    );

    expect(first.consumeInbound().map((item) => item.text)).toEqual([]);
    expect(second.consumeInbound().map((item) => item.text)).toEqual([
      "for b, by wrapper id",
      "for b, by harness id",
    ]);
    // Drained — a second consume returns nothing (no double injection).
    expect(second.consumeInbound()).toEqual([]);
  });

  it("delivers plaintext to the primary (earliest-started live) session only", () => {
    const first = makeBus("session-a");
    // Ensure a strictly later startedAt for the second session.
    const before = Date.now();
    while (Date.now() - before < 5) {
      // busy-wait a few ms so ISO startedAt differs
    }
    const second = makeBus("session-b");

    second.routeInbound("owner", "plain prompt");
    expect(second.consumeInbound()).toEqual([]); // not primary
    const drained = first.consumeInbound();
    expect(drained.map((item) => item.text)).toEqual(["plain prompt"]);
    expect(drained[0]?.sessionId).toBeUndefined();
  });

  it("falls back to the default spool when a frame names an unknown session", () => {
    const bus = makeBus("session-a");
    bus.routeInbound(
      "owner",
      encodeHarnessControlFrame("ghost", { sessionId: "no-such-session" }),
    );
    const drained = bus.consumeInbound();
    expect(drained.map((item) => item.text)).toEqual(["ghost"]);
    expect(drained[0]?.sessionId).toBe("no-such-session");
  });

  it("serializes concurrent withLock sections", async () => {
    const bus = makeBus("session-a");
    const order: Array<string> = [];
    await Promise.all([
      bus.withLock(async () => {
        order.push("a-start");
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
        order.push("a-end");
      }),
      bus.withLock(async () => {
        order.push("b-start");
        order.push("b-end");
      }),
    ]);
    // Whichever section starts first must finish before the other starts.
    const firstEnd = order.indexOf(`${order[0]?.charAt(0)}-end`);
    expect(firstEnd).toBe(1);
    expect(order).toHaveLength(4);
  });

  it("reclaims a stale lock left by a dead process", async () => {
    const bus = makeBus("session-a");
    // Simulate a dead holder: a lock file naming the PID of an already-exited
    // child process (freshly reaped, so it cannot be a live process).
    const deadPid = spawnSync("true").pid ?? 2 ** 30;
    mkdirSync(busDir, { recursive: true });
    writeFileSync(
      join(busDir, "wallet.lock"),
      JSON.stringify({ pid: deadPid, at: Date.now() }),
      "utf8",
    );
    const result = await bus.withLock(async () => "ran");
    expect(result).toBe("ran");
  });
});
