/**
 * The `medulla-tinyplace/1` task wire protocol.
 *
 * medulla's orchestrator delegates work to remote coding agents over Signal
 * E2E DMs using this small JSON frame. The daemon speaks the peer side: it
 * accepts `task`/`input` frames and answers with `ack`/`status`/`reply`/`error`.
 * Frames are correlated by `taskId` (cycle-scoped) and, when present, an opaque
 * `correlationId` (globally unique per dispatch) — the daemon echoes both back
 * verbatim so late replies can never cross-talk between cycles. Every response
 * frame also carries the `harness` provider (claude|codex|opencode) that ran the
 * task, so medulla can label the lane it delegated to.
 */
import type { HarnessProvider } from "../../types/harness.js";

/** Wire version tag stamped on every frame body. */
export const TINYPLACE_PROTO = "medulla-tinyplace/1";

/** The frame kinds the daemon ↔ orchestrator loop exchanges. */
export type TaskFrameKind =
  | "task"
  | "input"
  | "status"
  | "reply"
  | "error"
  | "ack";

/**
 * A decoded protocol frame. `taskId` is the cycle-scoped correlation key;
 * `correlationId` (when present) is the globally-unique dispatch key medulla
 * assigns and the daemon must echo verbatim on every response. `harness` names
 * the provider — set on responses, optional on inbound. `provider` is an
 * inbound-only hint: which coding agent the orchestrator wants to run the task.
 */
export interface TaskFrame {
  proto: typeof TINYPLACE_PROTO;
  kind: TaskFrameKind;
  taskId: string;
  text: string;
  ts: string;
  correlationId?: string;
  harness?: HarnessProvider;
  provider?: HarnessProvider;
}

export interface EncodeFrameInput {
  kind: TaskFrameKind;
  taskId: string;
  text: string;
  correlationId?: string;
  harness?: HarnessProvider;
  provider?: HarnessProvider;
}

/** Serialize a frame for the encrypted message body. */
export function encodeTaskFrame(input: EncodeFrameInput): string {
  const frame: TaskFrame = {
    proto: TINYPLACE_PROTO,
    kind: input.kind,
    taskId: input.taskId,
    text: input.text,
    ts: new Date().toISOString(),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.harness ? { harness: input.harness } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
  };
  return JSON.stringify(frame);
}

const FRAME_KINDS: ReadonlySet<string> = new Set<TaskFrameKind>([
  "task",
  "input",
  "status",
  "reply",
  "error",
  "ack",
]);

const PROVIDERS: ReadonlySet<string> = new Set<HarnessProvider>([
  "claude",
  "codex",
  "opencode",
]);

function asProvider(value: unknown): HarnessProvider | undefined {
  return typeof value === "string" && PROVIDERS.has(value)
    ? (value as HarnessProvider)
    : undefined;
}

/**
 * Parse a decrypted body into a {@link TaskFrame}, or `undefined` when it is not
 * one of ours (plain chatter, another protocol) so the caller can fall back to
 * plain-text handling rather than mis-routing it.
 */
export function decodeTaskFrame(body: string): TaskFrame | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  if (record.proto !== TINYPLACE_PROTO) {
    return undefined;
  }
  const kind = record.kind;
  const taskId = record.taskId;
  const text = record.text;
  if (
    typeof kind !== "string" ||
    !FRAME_KINDS.has(kind) ||
    typeof taskId !== "string" ||
    typeof text !== "string"
  ) {
    return undefined;
  }
  const ts =
    typeof record.ts === "string" ? record.ts : new Date().toISOString();
  const correlationId =
    typeof record.correlationId === "string" ? record.correlationId : undefined;
  const harness = asProvider(record.harness);
  const provider = asProvider(record.provider);
  return {
    proto: TINYPLACE_PROTO,
    kind: kind as TaskFrameKind,
    taskId,
    text,
    ts,
    ...(correlationId ? { correlationId } : {}),
    ...(harness ? { harness } : {}),
    ...(provider ? { provider } : {}),
  };
}
