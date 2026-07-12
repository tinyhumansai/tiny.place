export type HarnessProvider = "codex" | "claude" | "opencode";

export type HarnessMessageRole = "user" | "agent";

export type HarnessBucketUnit = "minute" | "hour" | "day";

export type HarnessEnvelopeScope = "folder" | "session";

export const SESSION_ENVELOPE_VERSION_V1 = "tinyplace.harness.session.v1";

export interface SessionEnvelopeV1 {
  envelope_version: typeof SESSION_ENVELOPE_VERSION_V1;
  version: 1;
  bucket: {
    unit: HarnessBucketUnit;
    start: string;
    end: string;
  };
  scope: {
    type: HarnessEnvelopeScope;
    key: string;
    cwd: string;
    wrapper_session_id: string;
    harness_session_id: string;
  };
  harness: {
    provider: HarnessProvider;
    command: string;
    argv: Array<string>;
  };
  message: {
    id: string;
    line: number;
    role: HarnessMessageRole;
    text: string;
    timestamp: string;
    phase?: string;
  };
  source: {
    path: string;
    record_type: string;
    source_role?: string;
  };
}

export type SessionEnvelope = SessionEnvelopeV1;

// ─────────────────────────────────────────────────────────────────────────────
// v2 — typed event stream (`tinyplace.harness.session.v2`)
//
// Additive over v1: reuses bucket/scope/harness verbatim, swaps only v1's
// `message` + `source` for a typed `event`. v1 and v2 coexist; consumers
// discriminate on `envelope_version`. Existing `SessionEnvelope` alias above is
// left pointing at v1 so no current importer changes behavior.
//
// Goal: the OpenHuman orchestrator tells apart tool_call · agent_message ·
// tool_result · status · lifecycle · everything-else from one field
// (`event.kind`) and picks a chat-bubble side from one field (`event.role`).
// ─────────────────────────────────────────────────────────────────────────────

// axis 1 — role (master-chat bubble side).
//   owner == v1 "user"  (human / OpenHuman master's prompt into the session)
//   agent == v1 "agent" (everything the session itself emits)
export type HarnessEventRole = "owner" | "agent";

// axis 2 — kind (content discriminator; the field the orchestrator switches on).
export type HarnessEventKind =
  | "session_info"
  | "user_prompt"
  | "agent_message"
  | "agent_thinking"
  | "approval_request"
  | "tool_call"
  | "tool_result"
  | "status"
  | "lifecycle"
  | "error"
  | "unknown";

// normalized tool family (raw harness name kept in tool_name).
export type HarnessToolKind =
  | "shell"
  | "file_read"
  | "file_write"
  | "edit"
  | "search"
  | "web"
  | "mcp"
  | "task"
  | "other";

// derived activity state (drives OpenHuman InstanceStatus + currentTask).
export type HarnessSessionState =
  | "running"
  | "running_tool"
  | "waiting_approval"
  | "idle"
  | "stopped"
  | "errored";

// `session_info` — the session intro/announce, emitted once a wrapped session is
// initialized (and a contact relationship with the owner exists). Thin by design:
// provider/cwd/session-ids ride on the envelope frame (scope/harness), so this
// payload carries only what the frame lacks — identity confirmation, UI metadata,
// advertised capabilities, and resume/idempotency signals.
export interface SessionInfoPayload {
  agent_address: string; // base58 wallet identity (confirms envelope.from)
  handle?: string; // @handle, if registered
  title?: string; // human-friendly session title for the UI header
  repo?: string; // git remote/slug, if in a repo
  branch?: string; // git branch
  model?: string; // active model (may also ride on event.model)
  harness_version?: string; // plugin/CLI version — compat gating
  capabilities: Array<HarnessEventKind>; // event kinds this session will emit (feature-gate UI)
  resumed: boolean; // false = fresh spawn, true = reconnect/resume (idempotency)
  started_at: string; // ISO-8601 session start
}

export interface UserPromptPayload {
  text: string;
  source: "human" | "openhuman_inject";
}

export interface AgentMessagePayload {
  text: string;
}

export interface AgentThinkingPayload {
  text: string;
}

export interface ToolCallPayload {
  call_id: string;
  tool_name: string; // raw harness name, e.g. "Bash"
  tool_kind: HarnessToolKind;
  display: string; // one-line human summary, e.g. "npm test"
  input: unknown; // bounded + redacted by the tailer before publish
}

export interface ToolResultPayload {
  call_id: string;
  ok: boolean;
  exit_code?: number;
  is_error: boolean;
  output: string; // truncated (~4KB cap); suffix marks elision
  output_bytes: number;
}

export interface ApprovalRequestPayload {
  call_id?: string;
  tool_name: string;
  display: string;
  reason?: string;
}

export interface StatusPayload {
  state: HarnessSessionState;
  detail: string; // -> SessionSummary.currentTask
  active_call_id?: string;
}

export interface LifecyclePayload {
  phase: "session_start" | "session_end" | "turn_start" | "turn_end" | "compact";
}

export interface ErrorPayload {
  message: string;
  fatal: boolean;
}

export interface UnknownPayload {
  raw: unknown; // bounded
}

// discriminated union: kind <-> payload, with the coarse role fixed per kind
// (owner iff kind === "user_prompt", else agent).
export type HarnessEvent =
  | { kind: "session_info"; role: "agent"; payload: SessionInfoPayload }
  | { kind: "user_prompt"; role: "owner"; payload: UserPromptPayload }
  | { kind: "agent_message"; role: "agent"; payload: AgentMessagePayload }
  | { kind: "agent_thinking"; role: "agent"; payload: AgentThinkingPayload }
  | { kind: "approval_request"; role: "agent"; payload: ApprovalRequestPayload }
  | { kind: "tool_call"; role: "agent"; payload: ToolCallPayload }
  | { kind: "tool_result"; role: "agent"; payload: ToolResultPayload }
  | { kind: "status"; role: "agent"; payload: StatusPayload }
  | { kind: "lifecycle"; role: "agent"; payload: LifecyclePayload }
  | { kind: "error"; role: "agent"; payload: ErrorPayload }
  | { kind: "unknown"; role: "agent"; payload: UnknownPayload };

export const SESSION_ENVELOPE_VERSION_V2 = "tinyplace.harness.session.v2";

export interface SessionEnvelopeV2 {
  envelope_version: typeof SESSION_ENVELOPE_VERSION_V2;
  version: 2;
  // reused verbatim from v1 — transport contract unchanged.
  bucket: {
    unit: HarnessBucketUnit;
    start: string;
    end: string;
  };
  scope: {
    type: HarnessEnvelopeScope;
    key: string;
    cwd: string;
    wrapper_session_id: string;
    harness_session_id: string;
  };
  harness: {
    provider: HarnessProvider;
    command: string;
    argv: Array<string>;
  };
  // the only new surface (replaces v1 `message` + `source`).
  event: {
    id: string; // sha256(...) — idempotent, dedup on resend
    seq: number; // monotonic per session — ordering
    ts: string; // ISO-8601
    turn_id?: string;
    model?: string;
  } & HarnessEvent;
  source: {
    path: string;
    record_type: string; // origin, e.g. "jsonl:assistant" | "hook:PreToolUse"
  };
}

// Union for consumers that accept either version. Existing `SessionEnvelope`
// stays v1-only (above) on purpose, so current importers are untouched.
export type AnySessionEnvelope = SessionEnvelopeV1 | SessionEnvelopeV2;
