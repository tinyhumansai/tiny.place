#[allow(unused_imports)]
use super::*;
use serde::{Deserialize, Serialize}; // sibling types share a flat namespace, like the TS barrel

pub type EventStatus = String;
pub type EventVisibility = String;
pub type EventEncryption = String;
pub type EventQuestionStatus = String;
pub type EventPollStatus = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSchedule {
    #[serde(default)]
    pub start_at: String,
    #[serde(default)]
    pub end_at: String,
    #[serde(default)]
    pub timezone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventAgendaItem {
    #[serde(default)]
    pub time: String,
    #[serde(default)]
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub speaker: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventTicketPrice {
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub asset: String,
    #[serde(default)]
    pub network: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventTicketTier {
    #[serde(default)]
    pub tier: String,
    #[serde(default)]
    pub amount: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub capacity: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub perks: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventPaymentPolicy {
    #[serde(rename = "type", default)]
    pub type_: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ticket: Option<EventTicketPrice>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tiered: Option<Vec<EventTicketTier>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub refund: Option<std::collections::HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub meta: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    #[serde(default)]
    pub event_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(rename = "type", default)]
    pub type_: String,
    #[serde(default)]
    pub host: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub host_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub speakers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub moderators: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub muted_speakers: Option<Vec<String>>,
    pub schedule: EventSchedule,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agenda: Option<Vec<EventAgendaItem>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub current_agenda_index: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub capacity: Option<i64>,
    #[serde(default)]
    pub attendee_count: i64,
    #[serde(default)]
    pub status: EventStatus,
    #[serde(default)]
    pub visibility: EventVisibility,
    #[serde(default)]
    pub encryption: EventEncryption,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub recording: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub recording_visibility: Option<EventVisibility>,
    #[serde(default)]
    pub stage_paused: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_policy: Option<EventPaymentPolicy>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub series_id: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cancelled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventQueryParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub q: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none", default)]
    pub type_: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub series_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<EventStatus>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub visibility: Option<EventVisibility>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventAttendee {
    #[serde(default)]
    pub event_id: String,
    #[serde(default)]
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tier: Option<String>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub joined_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventStageMessage {
    #[serde(default)]
    pub message_id: String,
    #[serde(default)]
    pub event_id: String,
    #[serde(default)]
    pub sender: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub timestamp: String,
    #[serde(default)]
    pub content_type: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub sequence: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventQuestion {
    #[serde(default)]
    pub question_id: String,
    #[serde(default)]
    pub event_id: String,
    #[serde(default)]
    pub asker: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub submitted_at: String,
    #[serde(default)]
    pub status: EventQuestionStatus,
    #[serde(default)]
    pub upvotes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventPoll {
    #[serde(default)]
    pub poll_id: String,
    #[serde(default)]
    pub event_id: String,
    #[serde(default)]
    pub question: String,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub created_by: String,
    #[serde(default)]
    pub status: EventPollStatus,
    #[serde(default)]
    pub results: std::collections::HashMap<String, i64>,
    #[serde(default)]
    pub total_votes: i64,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRecording {
    #[serde(default)]
    pub event_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub duration: String,
    #[serde(default)]
    pub messages: Vec<EventStageMessage>,
    #[serde(default)]
    pub questions: Vec<EventQuestion>,
    #[serde(default)]
    pub polls: Vec<EventPoll>,
    #[serde(default)]
    pub attendee_peak: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRecurrence {
    #[serde(default)]
    pub frequency: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub day: Option<String>,
    #[serde(default)]
    pub time: String,
    #[serde(default)]
    pub timezone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSeries {
    #[serde(default)]
    pub series_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub host: String,
    pub recurrence: EventRecurrence,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub next_event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub followers: Option<Vec<String>>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}
