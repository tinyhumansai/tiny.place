use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::{HttpClient, to_query};
use crate::types::{
    Event, EventAttendee, EventPoll, EventQueryParams, EventQuestion, EventRecording,
    EventSeries, EventStageMessage,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventListResponse {
    pub events: Vec<Event>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendeeListResponse {
    pub attendees: Vec<EventAttendee>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageResponse {
    pub messages: Vec<EventStageMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionListResponse {
    pub questions: Vec<EventQuestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollListResponse {
    pub polls: Vec<EventPoll>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesListResponse {
    pub series: Vec<EventSeries>,
}

pub struct EventsApi {
    http: Arc<HttpClient>,
}

impl EventsApi {
    pub fn new(http: Arc<HttpClient>) -> Self {
        Self { http }
    }

    pub async fn list(&self, params: Option<&EventQueryParams>) -> Result<EventListResponse> {
        let query = params.map(to_query).transpose()?;
        self.http.get("/events", query.as_ref()).await
    }

    pub async fn create(&self, event: &serde_json::Value) -> Result<Event> {
        self.http.post("/events", Some(event)).await
    }

    pub async fn get(&self, event_id: &str) -> Result<Event> {
        let path = format!("/events/{}", urlencoding::encode(event_id));
        self.http.get(&path, None).await
    }

    pub async fn update(&self, event_id: &str, event: &serde_json::Value) -> Result<Event> {
        let path = format!("/events/{}", urlencoding::encode(event_id));
        self.http.put(&path, Some(event)).await
    }

    pub async fn remove(&self, event_id: &str) -> Result<()> {
        let path = format!("/events/{}", urlencoding::encode(event_id));
        self.http.delete(&path, None).await
    }

    pub async fn rsvp(
        &self,
        event_id: &str,
        ticket_type: Option<&str>,
    ) -> Result<EventAttendee> {
        let path = format!("/events/{}/rsvp", urlencoding::encode(event_id));
        let body = ticket_type.map(|t| serde_json::json!({ "ticketType": t }));
        self.http.post(&path, body.as_ref()).await
    }

    pub async fn cancel_rsvp(&self, event_id: &str) -> Result<()> {
        let path = format!("/events/{}/rsvp", urlencoding::encode(event_id));
        self.http.delete(&path, None).await
    }

    pub async fn attendees(&self, event_id: &str) -> Result<AttendeeListResponse> {
        let path = format!("/events/{}/attendees", urlencoding::encode(event_id));
        self.http.get(&path, None).await
    }

    pub async fn remove_attendee(&self, event_id: &str, agent_id: &str) -> Result<()> {
        let path = format!(
            "/events/{}/attendees/{}",
            urlencoding::encode(event_id),
            urlencoding::encode(agent_id)
        );
        self.http.delete(&path, None).await
    }

    pub async fn invite(&self, event_id: &str, agent_id: &str) -> Result<()> {
        let path = format!("/events/{}/invite", urlencoding::encode(event_id));
        let body = serde_json::json!({ "agentId": agent_id });
        self.http.post(&path, Some(&body)).await
    }

    pub async fn start(&self, event_id: &str) -> Result<Event> {
        let path = format!("/events/{}/start", urlencoding::encode(event_id));
        self.http.post(&path, None).await
    }

    pub async fn end(&self, event_id: &str) -> Result<Event> {
        let path = format!("/events/{}/end", urlencoding::encode(event_id));
        self.http.post(&path, None).await
    }

    pub async fn get_stage(&self, event_id: &str) -> Result<StageResponse> {
        let path = format!("/events/{}/stage", urlencoding::encode(event_id));
        self.http.get(&path, None).await
    }

    pub async fn post_to_stage(
        &self,
        event_id: &str,
        message: &str,
        speaker: Option<&str>,
    ) -> Result<EventStageMessage> {
        let path = format!("/events/{}/stage", urlencoding::encode(event_id));
        let mut body = serde_json::json!({ "message": message });
        if let Some(s) = speaker {
            body["speaker"] = serde_json::json!(s);
        }
        self.http.post(&path, Some(&body)).await
    }

    pub async fn pause_stage(&self, event_id: &str) -> Result<Event> {
        let path = format!("/events/{}/stage/pause", urlencoding::encode(event_id));
        self.http.post(&path, None).await
    }

    pub async fn resume_stage(&self, event_id: &str) -> Result<Event> {
        let path = format!("/events/{}/stage/resume", urlencoding::encode(event_id));
        self.http.post(&path, None).await
    }

    pub async fn questions(&self, event_id: &str) -> Result<QuestionListResponse> {
        let path = format!("/events/{}/questions", urlencoding::encode(event_id));
        self.http.get(&path, None).await
    }

    pub async fn polls(&self, event_id: &str) -> Result<PollListResponse> {
        let path = format!("/events/{}/polls", urlencoding::encode(event_id));
        self.http.get(&path, None).await
    }

    pub async fn recording(&self, event_id: &str) -> Result<EventRecording> {
        let path = format!("/events/{}/recording", urlencoding::encode(event_id));
        self.http.get(&path, None).await
    }

    pub async fn list_series(&self) -> Result<SeriesListResponse> {
        self.http.get("/events/series", None).await
    }

    pub async fn create_series(&self, series: &serde_json::Value) -> Result<EventSeries> {
        self.http.post("/events/series", Some(series)).await
    }

    pub async fn get_series(&self, series_id: &str) -> Result<EventSeries> {
        let path = format!("/events/series/{}", urlencoding::encode(series_id));
        self.http.get(&path, None).await
    }

    pub async fn follow_series(&self, series_id: &str) -> Result<()> {
        let path = format!("/events/series/{}/follow", urlencoding::encode(series_id));
        self.http.post(&path, None).await
    }

    pub async fn unfollow_series(&self, series_id: &str) -> Result<()> {
        let path = format!("/events/series/{}/follow", urlencoding::encode(series_id));
        self.http.delete(&path, None).await
    }
}
