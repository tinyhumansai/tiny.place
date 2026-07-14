// Derived session-status state machine for the v2 harness stream.
//
// The transcript never states "the agent is idle" — it only records events.
// OpenHuman's Master Session needs a live "what is it doing right now" signal
// (the InstanceStatus dot + SessionSummary.currentTask). This module derives
// that signal from the typed event stream, plus a heartbeat/idle tick so the
// signal stays trustworthy when no events arrive.
//
// Pure and caller-driven: no timers held here. The tailer feeds each semantic
// event to `reduceStatus`, and calls `tickStatus(now)` on an interval to age a
// silent session into `idle` and refresh the heartbeat. Both return an optional
// StatusPayload that should be emitted only when present (change-gated).

import type {
  HarnessSessionState,
  StatusPayload,
} from "../types/harness.js";
import type { HarnessSemanticEvent } from "./harness-events.js";

export interface SessionStatusState {
  state: HarnessSessionState;
  detail: string;
  activeCallId?: string;
  /** timestamp of the last event that moved the machine (ms since epoch). */
  lastEventAtMs: number;
}

export interface StatusStep {
  next: SessionStatusState;
  /** present only when the caller should publish a status event. */
  emit?: StatusPayload;
}

/** Default: session exists but nothing has happened yet. */
export function initialStatus(nowMs = 0): SessionStatusState {
  return { state: "idle", detail: "idle", lastEventAtMs: nowMs };
}

const DETAIL_CAP = 120;

export function reduceStatus(
  prev: SessionStatusState,
  event: HarnessSemanticEvent,
): StatusStep {
  const atMs = timeToMs(event.timestamp, prev.lastEventAtMs);
  const derived = deriveFromEvent(event);
  if (!derived) {
    // event carries no status signal (e.g. an unknown record); keep state,
    // but advance the activity clock so heartbeat/idle timing stays honest.
    return { next: { ...prev, lastEventAtMs: atMs } };
  }
  const next: SessionStatusState = {
    state: derived.state,
    detail: derived.detail,
    ...(derived.activeCallId !== undefined
      ? { activeCallId: derived.activeCallId }
      : {}),
    lastEventAtMs: atMs,
  };
  return changed(prev, next)
    ? { next, emit: toPayload(next) }
    : { next };
}

/**
 * Age a silent session. If more than `idleAfterMs` has passed since the last
 * event while the machine is in an active state, transition to `idle`.
 * Otherwise, when `heartbeat` is true, re-emit the current status unchanged so
 * downstream "last updated" stays fresh. Returns no emit when nothing is due.
 */
export function tickStatus(
  prev: SessionStatusState,
  nowMs: number,
  options: { idleAfterMs: number; heartbeat?: boolean } = { idleAfterMs: 30_000 },
): StatusStep {
  const stale = nowMs - prev.lastEventAtMs >= options.idleAfterMs;
  const active = isActive(prev.state);
  if (stale && active) {
    const next: SessionStatusState = {
      state: "idle",
      detail: "idle",
      lastEventAtMs: prev.lastEventAtMs,
    };
    return { next, emit: toPayload(next) };
  }
  if (options.heartbeat) {
    return { next: prev, emit: toPayload(prev) };
  }
  return { next: prev };
}

interface Derived {
  state: HarnessSessionState;
  detail: string;
  activeCallId?: string;
}

function deriveFromEvent(event: HarnessSemanticEvent): Derived | undefined {
  const inner = event.event;
  switch (inner.kind) {
    case "tool_call":
      return {
        state: "running_tool",
        detail: cap(
          `running ${inner.payload.tool_name}: ${inner.payload.display}`,
        ),
        activeCallId: inner.payload.call_id || undefined,
      };
    case "tool_result":
      return { state: "running", detail: "processing", activeCallId: undefined };
    case "approval_request":
      return {
        state: "waiting_approval",
        detail: cap(`awaiting approval: ${inner.payload.display}`),
        activeCallId: inner.payload.call_id ?? undefined,
      };
    case "agent_thinking":
      return { state: "running", detail: "thinking", activeCallId: undefined };
    case "agent_message":
      return { state: "running", detail: "replying", activeCallId: undefined };
    case "user_prompt":
      return { state: "running", detail: "working", activeCallId: undefined };
    case "error":
      return {
        state: inner.payload.fatal ? "errored" : "running",
        detail: cap(inner.payload.message),
      };
    case "lifecycle":
      return lifecycleStatus(inner.payload.phase);
    case "status":
      return {
        state: inner.payload.state,
        detail: inner.payload.detail,
        activeCallId: inner.payload.active_call_id ?? undefined,
      };
    default:
      return undefined;
  }
}

function lifecycleStatus(phase: string): Derived | undefined {
  switch (phase) {
    case "session_start":
    case "turn_start":
      return { state: "running", detail: "working" };
    case "turn_end":
      return { state: "idle", detail: "idle" };
    case "compact":
      // Context compaction is active background work (emitted by the hook mapper
      // for a "compact" SessionStart); surface it rather than leaving a stale
      // status, but keep it distinct from a fresh turn's "working".
      return { state: "running", detail: "compacting" };
    case "session_end":
      return { state: "stopped", detail: "stopped" };
    default:
      return undefined;
  }
}

function toPayload(state: SessionStatusState): StatusPayload {
  return {
    state: state.state,
    detail: state.detail,
    ...(state.activeCallId ? { active_call_id: state.activeCallId } : {}),
  };
}

function changed(a: SessionStatusState, b: SessionStatusState): boolean {
  return (
    a.state !== b.state ||
    a.detail !== b.detail ||
    a.activeCallId !== b.activeCallId
  );
}

function isActive(state: HarnessSessionState): boolean {
  return (
    state === "running" ||
    state === "running_tool" ||
    state === "waiting_approval"
  );
}

function cap(value: string): string {
  const line = value.split("\n", 1)[0] ?? value;
  return line.length > DETAIL_CAP ? `${line.slice(0, DETAIL_CAP - 1)}…` : line;
}

function timeToMs(timestamp: Date, fallback: number): number {
  const ms = timestamp.getTime();
  return Number.isNaN(ms) || ms === 0 ? fallback : ms;
}
