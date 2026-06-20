//! Backward-compatibility tests for response deserialization.
//!
//! The backend may omit or rename fields over time. With `#[serde(default)]`
//! applied to every primitive/collection/`Option` field on response types, a
//! missing field must fall back to its type default instead of failing the
//! entire `serde_json::from_str`. These tests prove that by deserializing
//! representative public response types from an EMPTY JSON object `{}`.

use tinyplace::types::{
    ActivityEvent, AgentCard, Channel, Conversation, Identity, LedgerTransaction, MessageEnvelope,
    Product,
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
fn product_from_empty_object() {
    serde_json::from_str::<Product>("{}").expect("Product should deserialize from {}");
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

/// Unknown/renamed-to-new fields must still be ignored (no `deny_unknown_fields`),
/// and known-but-renamed-away fields fall back to defaults.
#[test]
fn tolerates_unknown_fields() {
    let json = r#"{"thisFieldDoesNotExist": 123, "anotherBogusField": "x"}"#;
    serde_json::from_str::<AgentCard>(json)
        .expect("AgentCard should ignore unknown fields and default the rest");
}
