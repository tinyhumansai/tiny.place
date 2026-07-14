#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

// Harness session-envelope types — the JSON payload a wrapped Codex / Claude
// session forwards *inside* an encrypted Signal DM body.
//
// Ported from the TypeScript SDK `src/types/harness.ts` (`SessionEnvelopeV1`).
//
// NOTE: the harness envelope wire format is **snake_case**, unlike the
// camelCase used by the rest of the API. The envelope is produced by the CLI
// wrapper as a literal snake_case object, so these structs intentionally omit
// `#[serde(rename_all = "camelCase")]`. Do not "normalize" them to camelCase —
// it will break decoding of real envelopes.

/// `envelope_version` discriminator for v1 envelopes.
pub const SESSION_ENVELOPE_VERSION_V1: &str = "tinyplace.harness.session.v1";

/// `"codex" | "claude"` in the TS SDK.
pub type HarnessProvider = String;

/// `"user" | "agent"` in the TS SDK.
pub type HarnessMessageRole = String;

/// `"minute" | "hour" | "day"` in the TS SDK.
pub type HarnessBucketUnit = String;

/// `"folder" | "session"` in the TS SDK.
pub type HarnessEnvelopeScope = String;

/// Rate/aggregation bucket the envelope belongs to.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HarnessBucket {
    #[serde(default)]
    pub unit: HarnessBucketUnit,
    #[serde(default)]
    pub start: String,
    #[serde(default)]
    pub end: String,
}

/// Where the wrapped session is anchored (folder- or session-scoped).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HarnessScope {
    #[serde(rename = "type", default)]
    pub scope_type: HarnessEnvelopeScope,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub wrapper_session_id: String,
    #[serde(default)]
    pub harness_session_id: String,
}

/// The wrapped harness process (provider + invocation).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HarnessInfo {
    #[serde(default)]
    pub provider: HarnessProvider,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub argv: Vec<String>,
}

/// A single semantic message from the wrapped session.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HarnessMessage {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub line: i64,
    #[serde(default)]
    pub role: HarnessMessageRole,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub phase: Option<String>,
}

/// Provenance of the message on the wrapper's disk.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HarnessSource {
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub record_type: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub source_role: Option<String>,
}

/// Mirror of the TS `SessionEnvelopeV1` interface — the versioned wire schema a
/// wrapped session forwards as an encrypted DM body.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SessionEnvelopeV1 {
    #[serde(default)]
    pub envelope_version: String,
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub bucket: HarnessBucket,
    #[serde(default)]
    pub scope: HarnessScope,
    #[serde(default)]
    pub harness: HarnessInfo,
    #[serde(default)]
    pub message: HarnessMessage,
    #[serde(default)]
    pub source: HarnessSource,
}

/// Alias matching the TS `export type SessionEnvelope = SessionEnvelopeV1`.
pub type SessionEnvelope = SessionEnvelopeV1;

impl SessionEnvelopeV1 {
    /// Well-formed v1 envelope: the version tag matches and a harness session id
    /// is present. Mirrors the guard a TS consumer applies before trusting the
    /// envelope's fields.
    pub fn is_valid_v1(&self) -> bool {
        self.envelope_version == SESSION_ENVELOPE_VERSION_V1
            && !self.scope.harness_session_id.is_empty()
    }

    /// Parse a DM body as a v1 session envelope. Returns `None` for any
    /// non-envelope payload (a plain DM) or a wrong/absent version, so callers
    /// can route those to their default surface.
    pub fn parse(body: &str) -> Option<Self> {
        let envelope: Self = serde_json::from_str(body).ok()?;
        envelope.is_valid_v1().then_some(envelope)
    }

    /// The single per-pair session id to bucket an inbound message under. Every
    /// message — whoever sent it — carries exactly one id: the shared
    /// conversation id in `scope.wrapper_session_id`. Both peers put the SAME id
    /// there for a given thread (the peer reuses it on reply), so it is the sole
    /// routing key. Falls back to `harness_session_id` only for a legacy
    /// envelope that predates the per-pair id.
    pub fn session_key(&self) -> String {
        if !self.scope.wrapper_session_id.is_empty() {
            return self.scope.wrapper_session_id.clone();
        }
        self.scope.harness_session_id.clone()
    }

    /// Build an outgoing v1 session envelope carrying `body` under `session_id`,
    /// so a compliant peer harness threads its reply under the same session.
    pub fn outgoing(session_id: &str, body: &str, message_id: &str, timestamp: &str) -> Self {
        SessionEnvelopeV1 {
            envelope_version: SESSION_ENVELOPE_VERSION_V1.to_string(),
            version: 1,
            scope: HarnessScope {
                scope_type: "session".to_string(),
                wrapper_session_id: session_id.to_string(),
                harness_session_id: session_id.to_string(),
                ..Default::default()
            },
            message: HarnessMessage {
                id: message_id.to_string(),
                role: "owner".to_string(),
                text: body.to_string(),
                timestamp: timestamp.to_string(),
                ..Default::default()
            },
            ..Default::default()
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// v2 — typed event stream (`tinyplace.harness.session.v2`)
//
// Additive over v1: reuses `bucket`/`scope`/`harness`/`source` verbatim, swaps
// only v1's single `message` object for a typed `event` carrying a `kind`
// discriminator + a per-kind `payload`. v1 and v2 coexist; consumers
// discriminate on `envelope_version`. The `SessionEnvelope` alias above stays
// pointed at v1 so no current importer changes behavior.
//
// Hand-rolled mirror of the TypeScript SDK `src/types/harness.ts` v2 section.
// Wire format is **snake_case** (the CLI wrapper emits a literal snake_case
// object) — these structs deliberately omit `#[serde(rename_all = "camelCase")]`.
// ─────────────────────────────────────────────────────────────────────────────

/// `"owner" | "agent"` in the TS SDK — the master-chat bubble side.
pub type HarnessEventRole = String;

/// `"shell" | "file_read" | "file_write" | "edit" | "search" | "web" | "mcp"
/// | "task" | "other"` in the TS SDK — the normalized tool family.
pub type HarnessToolKind = String;

/// `"running" | "running_tool" | "waiting_approval" | "idle" | "stopped"
/// | "errored"` in the TS SDK — the derived activity state.
pub type HarnessSessionState = String;

/// `envelope_version` discriminator for v2 harness envelopes.
pub const SESSION_ENVELOPE_VERSION_V2: &str = "tinyplace.harness.session.v2";

/// `user_prompt` payload.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct UserPromptPayload {
    #[serde(default)]
    pub text: String,
    /// `"human"` | `"openhuman_inject"`.
    #[serde(default)]
    pub source: String,
}

/// Shared payload for the text-only kinds (`agent_message`, `agent_thinking`).
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct TextPayload {
    #[serde(default)]
    pub text: String,
}

/// `tool_call` payload.
///
/// `tool_kind` is intentionally a `String` (not an enum) so an unrecognised
/// tool family does not fail the whole event decode.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ToolCallPayload {
    #[serde(default)]
    pub call_id: String,
    /// Raw harness name, e.g. `"Bash"`.
    #[serde(default)]
    pub tool_name: String,
    /// `shell|file_read|file_write|edit|search|web|mcp|task|other` — kept as a
    /// free `String` for forward-compatibility.
    #[serde(default)]
    pub tool_kind: String,
    /// One-line human summary, e.g. `"npm test"`.
    #[serde(default)]
    pub display: String,
    /// Bounded + redacted by the tailer before publish.
    #[serde(default)]
    pub input: serde_json::Value,
}

/// `tool_result` payload.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ToolResultPayload {
    #[serde(default)]
    pub call_id: String,
    #[serde(default)]
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i64>,
    #[serde(default)]
    pub is_error: bool,
    /// Truncated (~4KB cap); suffix marks elision.
    #[serde(default)]
    pub output: String,
    #[serde(default)]
    pub output_bytes: i64,
}

/// `approval_request` payload.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ApprovalRequestPayload {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub call_id: Option<String>,
    #[serde(default)]
    pub tool_name: String,
    #[serde(default)]
    pub display: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// `status` payload — the harness run-state.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct StatusPayload {
    /// `running|running_tool|waiting_approval|idle|stopped|errored`.
    #[serde(default)]
    pub state: String,
    /// Maps to `SessionSummary.currentTask`.
    #[serde(default)]
    pub detail: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_call_id: Option<String>,
}

/// `lifecycle` payload.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct LifecyclePayload {
    /// `session_start|session_end|turn_start|turn_end|compact`.
    #[serde(default)]
    pub phase: String,
}

/// `error` payload.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ErrorPayload {
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub fatal: bool,
}

/// `unknown` payload (`{ "raw": any }`).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct UnknownPayload {
    /// Bounded.
    #[serde(default)]
    pub raw: serde_json::Value,
}

/// The typed payload of a v2 `event`, keyed by `event.kind`. Adjacently tagged
/// on the wire's `kind` (discriminator) + `payload` (content) fields, decoded
/// via [`HarnessEvent::decoded`]. `snake_case` matches the wire kind strings.
///
/// Not `Eq`: [`ToolCallPayload::input`] and [`UnknownPayload::raw`] are
/// `serde_json::Value`, which is not `Eq`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "payload", rename_all = "snake_case")]
pub enum HarnessEventKind {
    UserPrompt(UserPromptPayload),
    AgentMessage(TextPayload),
    AgentThinking(TextPayload),
    ToolCall(ToolCallPayload),
    ToolResult(ToolResultPayload),
    ApprovalRequest(ApprovalRequestPayload),
    Status(StatusPayload),
    Lifecycle(LifecyclePayload),
    Error(ErrorPayload),
    /// `unknown` wire kind (`{ "raw": any }`) OR any forward-incompatible kind
    /// we cannot decode — folded here rather than hard-failing the parse.
    Unknown(UnknownPayload),
}

/// A v2 `event`: common envelope fields + the `kind`/`payload` pair. `kind` and
/// `payload` are kept raw here (a discriminator string + arbitrary JSON) and
/// decoded on demand by [`HarnessEvent::decoded`], so an unknown/garbled event
/// never fails the whole envelope parse (it folds to
/// [`HarnessEventKind::Unknown`]).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HarnessEvent {
    /// `sha256(...)` — idempotent, dedup on resend.
    #[serde(default)]
    pub id: String,
    /// Monotonic per session — ordering.
    #[serde(default)]
    pub seq: i64,
    /// ISO-8601.
    #[serde(default)]
    pub ts: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// `owner` (iff `kind == user_prompt`) else `agent`.
    #[serde(default)]
    pub role: HarnessEventRole,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

impl HarnessEvent {
    /// Decode `(kind, payload)` into a typed [`HarnessEventKind`]. Forward-safe:
    /// an unrecognised `kind` or a payload that fails its kind's schema folds to
    /// [`HarnessEventKind::Unknown`] carrying the raw payload, so a
    /// future/garbled event never hard-fails the parse.
    pub fn decoded(&self) -> HarnessEventKind {
        let tagged = serde_json::json!({ "kind": self.kind, "payload": self.payload });
        serde_json::from_value(tagged).unwrap_or_else(|_| {
            HarnessEventKind::Unknown(UnknownPayload {
                raw: self.payload.clone(),
            })
        })
    }
}

/// Mirror of the TS `SessionEnvelopeV2` interface. Shares the v1
/// `bucket`/`scope`/`harness`/`source` blocks; swaps v1's `message` for a typed
/// [`HarnessEvent`].
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SessionEnvelopeV2 {
    #[serde(default)]
    pub envelope_version: String,
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub bucket: HarnessBucket,
    #[serde(default)]
    pub scope: HarnessScope,
    #[serde(default)]
    pub harness: HarnessInfo,
    #[serde(default)]
    pub event: HarnessEvent,
    #[serde(default)]
    pub source: HarnessSource,
}

impl SessionEnvelopeV2 {
    /// Well-formed v2 envelope: the version tag matches and a harness session id
    /// is present. Mirrors the guard a TS consumer applies before trusting the
    /// envelope's fields.
    pub fn is_valid_v2(&self) -> bool {
        self.envelope_version == SESSION_ENVELOPE_VERSION_V2
            && !self.scope.harness_session_id.is_empty()
    }

    /// Parse a decrypted DM body as a v2 session envelope. Returns `None` for
    /// any non-v2 payload (a v1 envelope or a plain DM) so callers can fall
    /// through to v1 then their default surface. Discriminates purely on
    /// `envelope_version`, so a v1 body never matches here (and vice-versa).
    pub fn parse(body: &str) -> Option<Self> {
        let envelope: Self = serde_json::from_str(body).ok()?;
        envelope.is_valid_v2().then_some(envelope)
    }

    /// The per-pair routing key — identical semantics to v1: the shared
    /// `scope.wrapper_session_id`, falling back to `harness_session_id` for a
    /// legacy envelope with no per-pair id.
    pub fn session_key(&self) -> String {
        if !self.scope.wrapper_session_id.is_empty() {
            return self.scope.wrapper_session_id.clone();
        }
        self.scope.harness_session_id.clone()
    }
}

/// Either version of a harness session envelope, for consumers that accept
/// both. Mirrors the TS `AnySessionEnvelope` union. The `SessionEnvelope` alias
/// stays v1-only on purpose, so current importers are untouched.
///
/// Serialization is `untagged` (the inner envelope's own fields, verbatim).
/// Deserialization goes through [`AnySessionEnvelope::parse`], which
/// discriminates on `envelope_version` — a plain `serde` untagged decode would
/// be ambiguous here since both structs accept `{}` (every field is
/// `#[serde(default)]`).
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum AnySessionEnvelope {
    V2(SessionEnvelopeV2),
    V1(SessionEnvelopeV1),
}

impl AnySessionEnvelope {
    /// Parse a decrypted DM body as either envelope version. Tries v2 first
    /// (the richer schema), then v1; returns `None` for any non-envelope
    /// payload so callers route it to their default surface.
    pub fn parse(body: &str) -> Option<Self> {
        if let Some(v2) = SessionEnvelopeV2::parse(body) {
            return Some(AnySessionEnvelope::V2(v2));
        }
        SessionEnvelopeV1::parse(body).map(AnySessionEnvelope::V1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
        "envelope_version": "tinyplace.harness.session.v1",
        "version": 1,
        "bucket": { "unit": "hour", "start": "s", "end": "e" },
        "scope": { "type": "session", "key": "k", "cwd": "/repo",
                   "wrapper_session_id": "w1", "harness_session_id": "h1" },
        "harness": { "provider": "claude", "command": "claude", "argv": ["-p"] },
        "message": { "id": "m1", "line": 3, "role": "agent", "text": "hi",
                     "timestamp": "2026-07-02T00:00:00Z" },
        "source": { "path": "p", "record_type": "assistant" }
    }"#;

    #[test]
    fn parses_and_round_trips_v1() {
        let env = SessionEnvelopeV1::parse(SAMPLE).expect("valid v1 envelope");
        assert_eq!(env.scope.harness_session_id, "h1");
        assert_eq!(env.scope.scope_type, "session");
        assert_eq!(env.message.role, "agent");
        assert_eq!(env.harness.provider, "claude");
        assert_eq!(env.message.line, 3);

        // snake_case must round-trip — regression guard against a camelCase rename.
        let json = serde_json::to_string(&env).unwrap();
        assert!(json.contains("\"harness_session_id\""));
        assert!(json.contains("\"envelope_version\""));
        assert!(json.contains("\"record_type\""));
    }

    #[test]
    fn rejects_unknown_version_and_plain_dm() {
        assert!(SessionEnvelopeV1::parse(
            r#"{"envelope_version":"other","scope":{"harness_session_id":"h"}}"#
        )
        .is_none());
        assert!(SessionEnvelopeV1::parse("just a normal message").is_none());
        assert!(SessionEnvelopeV1::parse(
            r#"{"envelope_version":"tinyplace.harness.session.v1","scope":{"harness_session_id":""}}"#
        )
        .is_none());
    }

    #[test]
    fn v1_session_key_is_the_shared_wrapper_id_then_harness_fallback() {
        // The single per-pair id lives in `wrapper_session_id`.
        assert_eq!(
            SessionEnvelopeV1::parse(SAMPLE).unwrap().session_key(),
            "w1"
        );
        // Legacy envelope with no per-pair id: fall back to the harness id.
        let env = SessionEnvelopeV1::parse(
            r#"{
                "envelope_version": "tinyplace.harness.session.v1",
                "scope": { "harness_session_id": "h-only" }
            }"#,
        )
        .expect("valid v1");
        assert_eq!(env.session_key(), "h-only");
    }

    #[test]
    fn v1_outgoing_builds_a_parseable_envelope() {
        let env = SessionEnvelopeV1::outgoing("h9", "reply body", "m9", "2026-07-04T00:00:00Z");
        let wire = serde_json::to_string(&env).expect("encode");
        let parsed = SessionEnvelopeV1::parse(&wire).expect("valid v1");
        assert_eq!(parsed.scope.harness_session_id, "h9");
        assert_eq!(parsed.scope.wrapper_session_id, "h9");
        assert_eq!(parsed.message.text, "reply body");
        assert_eq!(parsed.message.role, "owner");
    }

    // ── v2 envelope ─────────────────────────────────────────────────────────

    /// Build a v2 envelope wire string with the given `kind` + `payload` JSON.
    fn v2_wire(kind: &str, payload: &str) -> String {
        format!(
            r#"{{
                "envelope_version": "tinyplace.harness.session.v2",
                "version": 2,
                "bucket": {{ "unit": "minute", "start": "s", "end": "e" }},
                "scope": {{ "type": "folder", "key": "repo", "cwd": "/w",
                           "wrapper_session_id": "w2", "harness_session_id": "h2" }},
                "harness": {{ "provider": "claude", "command": "claude", "argv": [] }},
                "event": {{ "id": "e1", "seq": 4, "ts": "2026-07-05T00:00:00Z",
                           "turn_id": "t1", "model": "opus", "role": "agent",
                           "kind": "{kind}", "payload": {payload} }},
                "source": {{ "path": "p", "record_type": "assistant" }}
            }}"#
        )
    }

    #[test]
    fn parses_valid_v2_envelope_and_common_event_fields() {
        let wire = v2_wire("agent_message", r#"{ "text": "hi there" }"#);
        let env = SessionEnvelopeV2::parse(&wire).expect("valid v2");
        assert_eq!(env.envelope_version, SESSION_ENVELOPE_VERSION_V2);
        assert_eq!(env.version, 2);
        assert_eq!(env.scope.wrapper_session_id, "w2");
        assert_eq!(env.harness.provider, "claude");
        assert_eq!(env.event.id, "e1");
        assert_eq!(env.event.seq, 4);
        assert_eq!(env.event.turn_id.as_deref(), Some("t1"));
        assert_eq!(env.event.model.as_deref(), Some("opus"));
        assert_eq!(env.event.role, "agent");
        assert_eq!(env.session_key(), "w2");

        // snake_case must round-trip — regression guard against a camelCase rename.
        let json = serde_json::to_string(&env).unwrap();
        assert!(json.contains("\"harness_session_id\""));
        assert!(json.contains("\"envelope_version\""));
        assert!(json.contains("\"record_type\""));
    }

    #[test]
    fn v2_decodes_every_event_kind() {
        use HarnessEventKind::*;

        let up = SessionEnvelopeV2::parse(&v2_wire(
            "user_prompt",
            r#"{ "text": "do it", "source": "human" }"#,
        ))
        .unwrap();
        assert_eq!(
            up.event.decoded(),
            UserPrompt(UserPromptPayload {
                text: "do it".into(),
                source: "human".into()
            })
        );

        let am =
            SessionEnvelopeV2::parse(&v2_wire("agent_message", r#"{ "text": "ok" }"#)).unwrap();
        assert_eq!(
            am.event.decoded(),
            AgentMessage(TextPayload { text: "ok".into() })
        );

        let th =
            SessionEnvelopeV2::parse(&v2_wire("agent_thinking", r#"{ "text": "hmm" }"#)).unwrap();
        assert_eq!(
            th.event.decoded(),
            AgentThinking(TextPayload { text: "hmm".into() })
        );

        let tc = SessionEnvelopeV2::parse(&v2_wire(
            "tool_call",
            r#"{ "call_id": "c1", "tool_name": "Bash", "tool_kind": "shell",
                 "display": "ls -la", "input": { "cmd": "ls" } }"#,
        ))
        .unwrap();
        match tc.event.decoded() {
            ToolCall(p) => {
                assert_eq!(p.call_id, "c1");
                assert_eq!(p.tool_name, "Bash");
                assert_eq!(p.tool_kind, "shell");
                assert_eq!(p.display, "ls -la");
                assert_eq!(p.input["cmd"], "ls");
            }
            other => panic!("expected tool_call, got {other:?}"),
        }

        let tr = SessionEnvelopeV2::parse(&v2_wire(
            "tool_result",
            r#"{ "call_id": "c1", "ok": true, "exit_code": 0, "is_error": false,
                 "output": "done", "output_bytes": 4 }"#,
        ))
        .unwrap();
        assert_eq!(
            tr.event.decoded(),
            ToolResult(ToolResultPayload {
                call_id: "c1".into(),
                ok: true,
                exit_code: Some(0),
                is_error: false,
                output: "done".into(),
                output_bytes: 4,
            })
        );

        let ar = SessionEnvelopeV2::parse(&v2_wire(
            "approval_request",
            r#"{ "call_id": "c9", "tool_name": "rm", "display": "rm -rf x", "reason": "destructive" }"#,
        ))
        .unwrap();
        assert_eq!(
            ar.event.decoded(),
            ApprovalRequest(ApprovalRequestPayload {
                call_id: Some("c9".into()),
                tool_name: "rm".into(),
                display: "rm -rf x".into(),
                reason: Some("destructive".into()),
            })
        );

        let st = SessionEnvelopeV2::parse(&v2_wire(
            "status",
            r#"{ "state": "running_tool", "detail": "compiling", "active_call_id": "c1" }"#,
        ))
        .unwrap();
        assert_eq!(
            st.event.decoded(),
            Status(StatusPayload {
                state: "running_tool".into(),
                detail: "compiling".into(),
                active_call_id: Some("c1".into()),
            })
        );

        let lc = SessionEnvelopeV2::parse(&v2_wire("lifecycle", r#"{ "phase": "session_end" }"#))
            .unwrap();
        assert_eq!(
            lc.event.decoded(),
            Lifecycle(LifecyclePayload {
                phase: "session_end".into()
            })
        );

        let er =
            SessionEnvelopeV2::parse(&v2_wire("error", r#"{ "message": "boom", "fatal": true }"#))
                .unwrap();
        assert_eq!(
            er.event.decoded(),
            Error(ErrorPayload {
                message: "boom".into(),
                fatal: true
            })
        );

        let uk = SessionEnvelopeV2::parse(&v2_wire("unknown", r#"{ "raw": { "x": 1 } }"#)).unwrap();
        match uk.event.decoded() {
            Unknown(p) => assert_eq!(p.raw["x"], 1),
            other => panic!("expected unknown, got {other:?}"),
        }
    }

    #[test]
    fn v2_unrecognised_kind_folds_to_unknown_not_a_parse_error() {
        // A future kind the receiver doesn't model must not fail the envelope
        // parse (which would silently route the DM elsewhere); it folds to
        // Unknown carrying the raw payload.
        let env = SessionEnvelopeV2::parse(&v2_wire("quantum_teleport", r#"{ "flux": 42 }"#))
            .expect("still a valid v2 envelope");
        match env.event.decoded() {
            HarnessEventKind::Unknown(p) => assert_eq!(p.raw["flux"], 42),
            other => panic!("expected unknown fold, got {other:?}"),
        }
    }

    #[test]
    fn v1_and_v2_bodies_do_not_cross_parse() {
        // A v1 envelope must NOT parse as v2 (discriminated on envelope_version).
        assert!(SessionEnvelopeV2::parse(SAMPLE).is_none());
        assert!(SessionEnvelopeV2::parse("a plain message").is_none());
        // Right shape, wrong version string.
        assert!(SessionEnvelopeV2::parse(
            r#"{"envelope_version":"tinyplace.harness.session.v3","scope":{"harness_session_id":"h"}}"#
        )
        .is_none());
        // Correct version but empty harness id → invalid.
        assert!(SessionEnvelopeV2::parse(
            r#"{"envelope_version":"tinyplace.harness.session.v2","scope":{"harness_session_id":""}}"#
        )
        .is_none());
        // Conversely a v2 body is not a v1 envelope.
        let v2 = v2_wire("agent_message", r#"{ "text": "x" }"#);
        assert!(SessionEnvelopeV1::parse(&v2).is_none());
    }

    #[test]
    fn v2_session_key_falls_back_to_harness_id() {
        let env = SessionEnvelopeV2::parse(
            r#"{
                "envelope_version": "tinyplace.harness.session.v2",
                "scope": { "harness_session_id": "h-only" },
                "event": { "kind": "agent_message", "payload": { "text": "x" } }
            }"#,
        )
        .expect("valid v2");
        assert_eq!(env.session_key(), "h-only");
    }

    #[test]
    fn any_session_envelope_parses_both_versions() {
        match AnySessionEnvelope::parse(SAMPLE) {
            Some(AnySessionEnvelope::V1(env)) => assert_eq!(env.session_key(), "w1"),
            other => panic!("expected V1, got {other:?}"),
        }

        let v2 = v2_wire("agent_message", r#"{ "text": "hi" }"#);
        match AnySessionEnvelope::parse(&v2) {
            Some(AnySessionEnvelope::V2(env)) => {
                assert_eq!(env.session_key(), "w2");
                assert_eq!(
                    env.event.decoded(),
                    HarnessEventKind::AgentMessage(TextPayload { text: "hi".into() })
                );
            }
            other => panic!("expected V2, got {other:?}"),
        }

        assert!(AnySessionEnvelope::parse("a plain DM").is_none());
    }
}
