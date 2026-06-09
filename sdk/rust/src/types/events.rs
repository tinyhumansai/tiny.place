use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EventStatus {
    Scheduled,
    Live,
    Ended,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EventVisibility {
    Public,
    Unlisted,
    InviteOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EventEncryption {
    None,
    Envelope,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EventQuestionStatus {
    Pending,
    Promoted,
    Answered,
    Dismissed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EventPollStatus {
    Open,
    Closed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSchedule {
    pub start_at: String,
    pub end_at: String,
    pub timezone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventAgendaItem {
    pub time: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventTicketPrice {
    pub amount: String,
    pub asset: String,
    pub network: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventTicketTier {
    pub tier: String,
    pub amount: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capacity: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub perks: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventPaymentPolicy {
    #[serde(rename = "type")]
    pub policy_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticket: Option<EventTicketPrice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tiered: Option<Vec<EventTicketTier>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refund: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub event_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub event_type: String,
    pub host: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host_crypto_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speakers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub moderators: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub muted_speakers: Option<Vec<String>>,
    pub schedule: EventSchedule,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agenda: Option<Vec<EventAgendaItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_agenda_index: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capacity: Option<u64>,
    pub attendee_count: u64,
    pub status: EventStatus,
    pub visibility: EventVisibility,
    pub encryption: EventEncryption,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    pub recording: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recording_visibility: Option<EventVisibility>,
    pub stage_paused: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_policy: Option<EventPaymentPolicy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub series_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventQueryParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub q: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub event_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub series_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<EventStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<EventVisibility>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventAttendee {
    pub event_id: String,
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
    pub status: String,
    pub joined_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventStageMessage {
    pub message_id: String,
    pub event_id: String,
    pub sender: String,
    pub role: String,
    pub timestamp: String,
    pub content_type: String,
    pub body: String,
    pub pinned: bool,
    pub sequence: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventQuestion {
    pub question_id: String,
    pub event_id: String,
    pub asker: String,
    pub body: String,
    pub submitted_at: String,
    pub status: EventQuestionStatus,
    pub upvotes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventPoll {
    pub poll_id: String,
    pub event_id: String,
    pub question: String,
    pub options: Vec<String>,
    pub created_by: String,
    pub status: EventPollStatus,
    pub results: HashMap<String, u64>,
    pub total_votes: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRecording {
    pub event_id: String,
    pub title: String,
    pub duration: String,
    pub messages: Vec<EventStageMessage>,
    pub questions: Vec<EventQuestion>,
    pub polls: Vec<EventPoll>,
    pub attendee_peak: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRecurrence {
    pub frequency: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub day: Option<String>,
    pub time: String,
    pub timezone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSeries {
    pub series_id: String,
    pub title: String,
    pub host: String,
    pub recurrence: EventRecurrence,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub followers: Option<Vec<String>>,
    pub created_at: String,
    pub updated_at: String,
}
