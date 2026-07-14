// Builds a v2 SessionEnvelope from a parsed semantic event.
//
// Kept separate from the tailer so it is pure and unit-testable, and so it does
// not collide with the in-flight bridge/tui work in `harness-wrapper.ts`. The
// tailer already assembles these exact context fields for the v1 envelope; this
// builder mirrors them, so wiring it in later is close to a 1:1 swap of the
// `message`+`source` block for the typed `event` block.

import { createHash } from "node:crypto";
import type {
  HarnessBucketUnit,
  HarnessEnvelopeScope,
  HarnessProvider,
  SessionEnvelopeV2,
} from "../types/harness.js";
import {
  SESSION_ENVELOPE_VERSION_V2,
} from "../types/harness.js";
import type { HarnessSemanticEvent } from "./harness-events.js";

export interface EnvelopeContext {
  provider: HarnessProvider;
  command: string;
  argv: Array<string>;
  scopeType: HarnessEnvelopeScope;
  scopeKey: string;
  cwd: string;
  wrapperSessionId: string;
  harnessSessionId: string;
  bucketUnit: HarnessBucketUnit;
  /** transcript file the event was read from (for source.path). */
  sourcePath: string;
  turnId?: string;
  model?: string;
}

export function buildEventEnvelopeV2(
  ctx: EnvelopeContext,
  semantic: HarnessSemanticEvent,
  seq: number,
): SessionEnvelopeV2 {
  const at = usableDate(semantic.timestamp);
  const start = floorBucket(at, ctx.bucketUnit);
  const end = addBucket(start, ctx.bucketUnit);
  const id = stableEventId(
    ctx.wrapperSessionId,
    semantic.recordType,
    seq,
    semantic.event.kind,
  );

  return {
    envelope_version: SESSION_ENVELOPE_VERSION_V2,
    version: 2,
    bucket: {
      unit: ctx.bucketUnit,
      start: start.toISOString(),
      end: end.toISOString(),
    },
    scope: {
      type: ctx.scopeType,
      key: ctx.scopeKey,
      cwd: ctx.cwd,
      wrapper_session_id: ctx.wrapperSessionId,
      harness_session_id: ctx.harnessSessionId,
    },
    harness: {
      provider: ctx.provider,
      command: ctx.command,
      argv: ctx.argv,
    },
    event: {
      id,
      seq,
      ts: at.toISOString(),
      ...(ctx.turnId ? { turn_id: ctx.turnId } : {}),
      ...(ctx.model ? { model: ctx.model } : {}),
      ...semantic.event,
    },
    source: {
      path: ctx.sourcePath,
      record_type: semantic.recordType,
    },
  };
}

// Deterministic id scoped to (wrapperSessionId, recordType, seq, kind) — NOT a
// content hash of the payload. It is stable for a given event within one wrapper
// run (so a resend carries the same id and the consumer dedups), and unique
// across runs because wrapperSessionId is freshly minted per process — so seq
// restarting at 0 after a relaunch cannot collide with a prior run's ids.
function stableEventId(
  wrapperSessionId: string,
  recordType: string,
  seq: number,
  kind: string,
): string {
  return createHash("sha256")
    .update(`${wrapperSessionId}\0${recordType}\0${seq}\0${kind}`)
    .digest("hex");
}

function usableDate(value: Date): Date {
  const ms = value.getTime();
  return Number.isNaN(ms) || ms === 0 ? new Date() : value;
}

function floorBucket(value: Date, unit: HarnessBucketUnit): Date {
  const out = new Date(value);
  out.setUTCSeconds(0, 0);
  if (unit === "minute") {
    return out;
  }
  out.setUTCMinutes(0, 0, 0);
  if (unit === "hour") {
    return out;
  }
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function addBucket(value: Date, unit: HarnessBucketUnit): Date {
  const out = new Date(value);
  if (unit === "minute") {
    out.setUTCMinutes(out.getUTCMinutes() + 1);
  } else if (unit === "hour") {
    out.setUTCHours(out.getUTCHours() + 1);
  } else {
    out.setUTCDate(out.getUTCDate() + 1);
  }
  return out;
}
