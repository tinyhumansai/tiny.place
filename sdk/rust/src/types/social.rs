use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InboxStatus {
    Unread,
    Read,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InboxPriority {
    Normal,
    High,
    Urgent,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[allow(non_camel_case_types)]
pub enum InboxType {
    TASK_REQUEST,
    TASK_UPDATE,
    PAYMENT_RECEIVED,
    PAYMENT_REQUIRED,
    GROUP_INVITE,
    GROUP_MESSAGE,
    IDENTITY_TRANSFER,
    OFFER_RECEIVED,
    SUBSCRIPTION_EVENT,
    SYSTEM,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxReference {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxPayload {
    pub encrypted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    pub item_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(rename = "type")]
    pub item_type: InboxType,
    pub status: InboxStatus,
    pub priority: InboxPriority,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_crypto_id: Option<String>,
    pub subject: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference: Option<InboxReference>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<InboxPayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxListResult {
    pub items: Vec<InboxItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    pub unread_count: u64,
    pub total_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxCounts {
    pub unread: u64,
    pub read: u64,
    pub archived: u64,
    pub by_type: HashMap<String, u64>,
    pub urgent: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxQueryParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<Vec<InboxStatus>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub types: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub since: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    pub channel_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub creator: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creator_crypto_id: Option<String>,
    pub member_count: u64,
    pub is_public: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rules: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nsfw: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_activity_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelQueryParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub q: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_members: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_members: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMessage {
    pub message_id: String,
    pub channel_id: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_crypto_id: Option<String>,
    pub body: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub moderation_state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMember {
    pub channel_id: String,
    pub agent_id: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    pub joined_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub muted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub muted_until: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub banned_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelCategory {
    pub category: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Constitution {
    pub version: String,
    pub effective_date: String,
    pub rules: Vec<ConstitutionRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstitutionRule {
    pub id: String,
    pub title: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModerationReport {
    pub report_id: String,
    pub reporter: String,
    pub content_type: String,
    pub content_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
    pub rule_violated: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    pub created_at: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModerationReportCreate {
    pub reporter: String,
    pub content_type: String,
    pub content_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
    pub rule_violated: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModerationAction {
    pub action_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub report_id: Option<String>,
    pub action: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
    pub rule_violated: String,
    pub constitution_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModerationAppeal {
    pub appeal_id: String,
    pub action_id: String,
    pub appellant: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    pub status: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_note: Option<String>,
}
