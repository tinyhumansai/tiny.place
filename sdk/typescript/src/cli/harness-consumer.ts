// Consumer side of the v2 harness stream.
//
// The wrapper publishes SessionEnvelopeV2 packets over Signal DM; a receiver
// (OpenHuman's Master Session, or any consumer) needs to fold that stream back
// into live per-session state: what provider it is, what it's doing right now,
// which tools ran, and a capped transcript feed. This module is that fold —
// pure and framework-agnostic, so the receiver just parses each DM body and
// applies it. UI/rendering lives downstream; this only maintains state.

import {
  SESSION_ENVELOPE_VERSION_V1,
  SESSION_ENVELOPE_VERSION_V2,
  type AnySessionEnvelope,
  type HarnessProvider,
  type HarnessSessionState,
  type HarnessToolKind,
  type SessionEnvelopeV2,
} from "../types/harness.js";

/** Safely decode a DM body into a typed envelope, or undefined if it is not one. */
export function parseSessionEnvelope(
  body: unknown,
): AnySessionEnvelope | undefined {
  const record =
    typeof body === "string" ? tryParse(body) : (body as unknown);
  if (!record || typeof record !== "object") {
    return undefined;
  }
  const version = (record as { envelope_version?: unknown }).envelope_version;
  // Inbound Signal DMs are untrusted: a version-tagged body with a missing or
  // malformed `event` must be DROPPED, not cast through — otherwise the seq
  // reads in applySessionEnvelope/foldSessionEnvelopes throw on `event.seq` and
  // take down the whole fold. Shape-check the v2 event before trusting it.
  if (version === SESSION_ENVELOPE_VERSION_V2) {
    return hasUsableV2Event(record) ? (record as AnySessionEnvelope) : undefined;
  }
  if (version === SESSION_ENVELOPE_VERSION_V1) {
    return record as AnySessionEnvelope;
  }
  return undefined;
}

/**
 * A v2 envelope is only foldable if it carries an `event` with a numeric `seq`
 * and a string `id` — the two fields the fold reads. Both the parser and the
 * fold path gate on this so a malformed body is dropped rather than throwing,
 * whether it arrives via parseSessionEnvelope or is passed in pre-parsed.
 */
function hasUsableV2Event(envelope: unknown): boolean {
  if (
    envelope === null ||
    typeof envelope !== "object" ||
    (envelope as { envelope_version?: unknown }).envelope_version !==
      SESSION_ENVELOPE_VERSION_V2
  ) {
    return false;
  }
  const event = (envelope as { event?: { seq?: unknown; id?: unknown } }).event;
  return (
    !!event && typeof event.seq === "number" && typeof event.id === "string"
  );
}

export function isV2(
  envelope: AnySessionEnvelope,
): envelope is SessionEnvelopeV2 {
  return envelope.envelope_version === SESSION_ENVELOPE_VERSION_V2;
}

/** One tool invocation and (once it lands) its result. */
export interface ToolActivity {
  callId: string;
  toolName: string;
  toolKind: HarnessToolKind;
  display: string;
  startedSeq: number;
  done: boolean;
  ok?: boolean;
  isError?: boolean;
  outputBytes?: number;
}

/** One entry in the capped human-readable feed. */
export interface FeedEntry {
  seq: number;
  ts: string;
  role: "owner" | "agent";
  kind: string;
  text: string;
}

/** Live state for a single agent session — the Master Session's per-instance row. */
export interface SessionView {
  provider?: HarnessProvider;
  wrapperSessionId?: string;
  harnessSessionId?: string;
  cwd?: string;
  status: HarnessSessionState;
  currentTask: string;
  lastSeq: number;
  lastEventId?: string;
  lastActivityTs?: string;
  /** most-recent tool activity, newest last, capped. */
  tools: Array<ToolActivity>;
  /** most-recent feed entries, newest last, capped. */
  feed: Array<FeedEntry>;
}

export interface SessionViewLimits {
  tools: number;
  feed: number;
}

const DEFAULT_LIMITS: SessionViewLimits = { tools: 50, feed: 200 };

export function initialSessionView(): SessionView {
  return {
    status: "idle",
    currentTask: "idle",
    lastSeq: -1,
    tools: [],
    feed: [],
  };
}

/**
 * Fold one envelope into the view. Ignores v1 (no typed events), out-of-order /
 * duplicate packets (seq must advance), and returns the SAME reference when
 * nothing changed so consumers can cheaply skip re-render.
 */
export function applySessionEnvelope(
  view: SessionView,
  envelope: AnySessionEnvelope,
  limits: SessionViewLimits = DEFAULT_LIMITS,
): SessionView {
  if (!isV2(envelope) || !hasUsableV2Event(envelope)) {
    return view;
  }
  const { event } = envelope;
  if (event.seq <= view.lastSeq) {
    return view; // duplicate or out-of-order resend
  }

  const next: SessionView = {
    ...view,
    provider: envelope.harness.provider,
    wrapperSessionId: envelope.scope.wrapper_session_id,
    harnessSessionId: envelope.scope.harness_session_id,
    cwd: envelope.scope.cwd,
    lastSeq: event.seq,
    lastEventId: event.id,
    lastActivityTs: event.ts,
    tools: view.tools,
    feed: view.feed,
  };

  applyEvent(next, envelope, limits);
  return next;
}

/** Convenience: fold a batch (applied in seq order defensively). */
export function foldSessionEnvelopes(
  envelopes: Array<AnySessionEnvelope>,
  limits: SessionViewLimits = DEFAULT_LIMITS,
): SessionView {
  return [...envelopes]
    .filter(isV2)
    .filter(hasUsableV2Event)
    .sort((a, b) => a.event.seq - b.event.seq)
    .reduce(
      (view, envelope) => applySessionEnvelope(view, envelope, limits),
      initialSessionView(),
    );
}

function applyEvent(
  view: SessionView,
  envelope: SessionEnvelopeV2,
  limits: SessionViewLimits,
): void {
  const { event } = envelope;
  switch (event.kind) {
    case "tool_call": {
      const activity: ToolActivity = {
        callId: event.payload.call_id,
        toolName: event.payload.tool_name,
        toolKind: event.payload.tool_kind,
        display: event.payload.display,
        startedSeq: event.seq,
        done: false,
      };
      view.tools = capEnd([...view.tools, activity], limits.tools);
      view.status = "running_tool";
      view.currentTask = `${event.payload.tool_name}: ${event.payload.display}`;
      pushFeed(view, envelope, event.payload.display, limits.feed);
      break;
    }
    case "tool_result": {
      view.tools = view.tools.map((tool) =>
        tool.callId === event.payload.call_id && !tool.done
          ? {
              ...tool,
              done: true,
              ok: event.payload.ok,
              isError: event.payload.is_error,
              outputBytes: event.payload.output_bytes,
            }
          : tool,
      );
      pushFeed(
        view,
        envelope,
        event.payload.is_error ? "error" : "ok",
        limits.feed,
      );
      break;
    }
    case "status": {
      view.status = event.payload.state;
      view.currentTask = event.payload.detail;
      break;
    }
    case "approval_request": {
      view.status = "waiting_approval";
      view.currentTask = `approval: ${event.payload.display}`;
      pushFeed(view, envelope, event.payload.display, limits.feed);
      break;
    }
    case "error": {
      if (event.payload.fatal) {
        view.status = "errored";
      }
      pushFeed(view, envelope, event.payload.message, limits.feed);
      break;
    }
    case "lifecycle": {
      if (event.payload.phase === "session_end") {
        view.status = "stopped";
        view.currentTask = "stopped";
      }
      break;
    }
    case "user_prompt":
    case "agent_message":
    case "agent_thinking": {
      pushFeed(view, envelope, event.payload.text, limits.feed);
      break;
    }
    default:
      break;
  }
}

function pushFeed(
  view: SessionView,
  envelope: SessionEnvelopeV2,
  text: string,
  cap: number,
): void {
  const entry: FeedEntry = {
    seq: envelope.event.seq,
    ts: envelope.event.ts,
    role: envelope.event.role,
    kind: envelope.event.kind,
    text,
  };
  view.feed = capEnd([...view.feed, entry], cap);
}

function capEnd<T>(items: Array<T>, cap: number): Array<T> {
  return items.length > cap ? items.slice(items.length - cap) : items;
}

function tryParse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}
