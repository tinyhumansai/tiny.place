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
}
