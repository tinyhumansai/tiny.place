//! Backward-compatibility tests for response deserialization.
//!
//! The backend may omit or rename fields over time. With `#[serde(default)]`
//! applied to every primitive/collection/`Option` field on response types, a
//! missing field must fall back to its type default instead of failing the
//! entire `serde_json::from_str`. These tests prove that by deserializing
//! representative public response types from an EMPTY JSON object `{}`.

use tinyplace::types::{
    ActivityEvent, AgentCard, Channel, Conversation, Identity, LedgerTransaction, MessageEnvelope,
    SessionEnvelopeV2,
};

#[test]
fn agent_card_from_empty_object() {
    serde_json::from_str::<AgentCard>("{}").expect("AgentCard should deserialize from {}");
}

#[test]
fn identity_from_empty_object() {
    serde_json::from_str::<Identity>("{}").expect("Identity should deserialize from {}");
}

#[test]
fn message_envelope_from_empty_object() {
    serde_json::from_str::<MessageEnvelope>("{}")
        .expect("MessageEnvelope should deserialize from {}");
}

#[test]
fn conversation_from_empty_object() {
    serde_json::from_str::<Conversation>("{}").expect("Conversation should deserialize from {}");
}

#[test]
fn channel_from_empty_object() {
    serde_json::from_str::<Channel>("{}").expect("Channel should deserialize from {}");
}

#[test]
fn ledger_transaction_from_empty_object() {
    serde_json::from_str::<LedgerTransaction>("{}")
        .expect("LedgerTransaction should deserialize from {}");
}

#[test]
fn activity_event_from_empty_object() {
    serde_json::from_str::<ActivityEvent>("{}").expect("ActivityEvent should deserialize from {}");
}

#[test]
fn session_envelope_v2_from_empty_object() {
    serde_json::from_str::<SessionEnvelopeV2>("{}")
        .expect("SessionEnvelopeV2 should deserialize from {}");
}

#[test]
fn session_envelope_v2_from_partial_object() {
    // A partial v2 body (missing bucket/harness/source and most event fields)
    // must still deserialize, with absent fields falling back to defaults.
    let json = r#"{
        "envelope_version": "tinyplace.harness.session.v2",
        "scope": { "harness_session_id": "h" },
        "event": { "kind": "agent_message", "payload": { "text": "hi" } }
    }"#;
    let env = serde_json::from_str::<SessionEnvelopeV2>(json)
        .expect("SessionEnvelopeV2 should deserialize from a partial object");
    assert_eq!(env.scope.harness_session_id, "h");
    assert_eq!(env.event.kind, "agent_message");
    assert_eq!(env.version, 0);
}

/// Unknown/renamed-to-new fields must still be ignored (no `deny_unknown_fields`),
/// and known-but-renamed-away fields fall back to defaults.
#[test]
fn tolerates_unknown_fields() {
    let json = r#"{"thisFieldDoesNotExist": 123, "anotherBogusField": "x"}"#;
    serde_json::from_str::<AgentCard>(json)
        .expect("AgentCard should ignore unknown fields and default the rest");
}
