//! Events API. Mirrors `sdk/typescript/src/api/events.ts`.

use rand::RngCore as _;
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::http::HttpClient;
use crate::types::{
    Event, EventAttendee, EventPoll, EventQueryParams, EventQuestion, EventRecording, EventSeries,
    EventStageMessage, EventVisibility,
};
use crate::util::encode;

/// RSVP request body. Mirrors the TS `EventRsvpRequest`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRsvpRequest {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment: Option<crate::x402::X402PaymentMap>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub payment_authorization: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tier: Option<String>,
}

/// Wrapper for the `{ events: [...] }` list response.
#[derive(Debug, Clone, Deserialize)]
pub struct EventListResponse {
    pub events: Vec<Event>,
}

/// Wrapper for the `{ attendees: [...] }` response.
#[derive(Debug, Clone, Deserialize)]
pub struct EventAttendeesResponse {
    pub attendees: Vec<EventAttendee>,
}

/// Wrapper for the `{ messages: [...] }` stage response.
#[derive(Debug, Clone, Deserialize)]
pub struct EventStageResponse {
    pub messages: Vec<EventStageMessage>,
}

/// Wrapper for the `{ questions: [...] }` response.
#[derive(Debug, Clone, Deserialize)]
pub struct EventQuestionsResponse {
    pub questions: Vec<EventQuestion>,
}

/// Wrapper for the `{ polls: [...] }` response.
#[derive(Debug, Clone, Deserialize)]
pub struct EventPollsResponse {
    pub polls: Vec<EventPoll>,
}

/// Wrapper for the `{ series: [...] }` response.
#[derive(Debug, Clone, Deserialize)]
pub struct EventSeriesListResponse {
    pub series: Vec<EventSeries>,
}

/// Body accepted by [`EventsApi::post_to_stage`].
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventStagePost {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub speaker: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sender: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub body: Option<String>,
}

/// Body accepted by [`EventsApi::update_recording`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRecordingUpdate {
    pub visibility: EventVisibility,
}

#[derive(Clone)]
pub struct EventsApi {
    http: HttpClient,
}

impl EventsApi {
    pub(crate) fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn list(&self, params: Option<&EventQueryParams>) -> Result<EventListResponse> {
        let query = events_query(params);
        self.http.get("/events", &query).await
    }

    pub async fn create(&self, event: serde_json::Value, host_id: Option<&str>) -> Result<Event> {
        // `hostId = event.host` by default in the TS signature.
        let resolved_host = host_id.map(str::to_string).or_else(|| {
            event
                .get("host")
                .and_then(|v| v.as_str())
                .map(str::to_string)
        });
        let mut body = event;
        if let Some(obj) = body.as_object_mut() {
            if !obj.get("eventId").map(|v| v.is_string()).unwrap_or(false) {
                obj.insert(
                    "eventId".to_string(),
                    serde_json::Value::String(next_client_id("evt")),
                );
            }
        }
        match resolved_host.as_deref() {
            Some(host) => {
                self.http
                    .post_directory_auth_as("/events", host, Some(&body))
                    .await
            }
            None => self.http.post_directory_auth("/events", Some(&body)).await,
        }
    }

    pub async fn get(&self, event_id: &str) -> Result<Event> {
        let path = format!("/events/{}", encode(event_id));
        self.http.get(&path, &[]).await
    }

    pub async fn update(
        &self,
        event_id: &str,
        event: serde_json::Value,
        host_id: Option<&str>,
    ) -> Result<Event> {
        let path = format!("/events/{}", encode(event_id));
        if let Some(host) = host_id {
            self.http
                .put_directory_auth_as(&path, host, Some(&event))
                .await
        } else {
            self.http.put_directory_auth(&path, Some(&event)).await
        }
    }

    pub async fn remove(&self, event_id: &str, host_id: Option<&str>) -> Result<()> {
        let path = format!("/events/{}", encode(event_id));
        if let Some(host) = host_id {
            self.http
                .delete_directory_auth_as(&path, host, None::<&serde_json::Value>)
                .await
        } else {
            self.http
                .delete_directory_auth(&path, None::<&serde_json::Value>)
                .await
        }
    }

    pub async fn rsvp(
        &self,
        event_id: &str,
        request: Option<EventRsvpRequest>,
        agent_id_override: Option<&str>,
    ) -> Result<EventAttendee> {
        let normalized = request.unwrap_or_default();
        // Strip agentId out of the body; it only drives actor selection.
        let request_agent_id = normalized.agent_id.clone();
        let mut body = serde_json::to_value(&normalized)?;
        if let Some(obj) = body.as_object_mut() {
            obj.remove("agentId");
        }
        let agent_id = agent_id_override.map(str::to_string).or(request_agent_id);
        if let (Some(agent_id), Some(obj)) = (&agent_id, body.as_object_mut()) {
            obj.insert(
                "agentId".to_string(),
                serde_json::Value::String(agent_id.clone()),
            );
        }
        // payload is undefined when the body has no keys.
        let payload = match body.as_object() {
            Some(obj) if !obj.is_empty() => Some(&body),
            _ => None,
        };
        let path = format!("/events/{}/rsvp", encode(event_id));
        match &agent_id {
            Some(agent_id) => {
                self.http
                    .post_directory_auth_as(&path, agent_id, payload)
                    .await
            }
            None => self.http.post_directory_auth(&path, payload).await,
        }
    }

    pub async fn cancel_rsvp(&self, event_id: &str, agent_id: Option<&str>) -> Result<()> {
        let path = match agent_id {
            Some(id) => format!("/events/{}/rsvp?agentId={}", encode(event_id), encode(id)),
            None => format!("/events/{}/rsvp", encode(event_id)),
        };
        if let Some(id) = agent_id {
            self.http
                .delete_directory_auth_as(&path, id, None::<&serde_json::Value>)
                .await
        } else {
            self.http
                .delete_directory_auth(&path, None::<&serde_json::Value>)
                .await
        }
    }

    pub async fn attendees(
        &self,
        event_id: &str,
        actor_id: Option<&str>,
    ) -> Result<EventAttendeesResponse> {
        let path = format!("/events/{}/attendees", encode(event_id));
        if let Some(actor) = actor_id {
            self.http.get_directory_auth_as(&path, actor, &[]).await
        } else {
            self.http.get_directory_auth(&path, &[]).await
        }
    }

    pub async fn remove_attendee(
        &self,
        event_id: &str,
        agent_id: &str,
        moderator_id: Option<&str>,
    ) -> Result<()> {
        let path = format!(
            "/events/{}/attendees/{}",
            encode(event_id),
            encode(agent_id)
        );
        if let Some(moderator) = moderator_id {
            self.http
                .delete_directory_auth_as(&path, moderator, None::<&serde_json::Value>)
                .await
        } else {
            self.http
                .delete_directory_auth(&path, None::<&serde_json::Value>)
                .await
        }
    }

    pub async fn invite(
        &self,
        event_id: &str,
        agent_id: &str,
        host_id: Option<&str>,
    ) -> Result<()> {
        let path = format!("/events/{}/invite", encode(event_id));
        let body = serde_json::json!({ "agentId": agent_id });
        if let Some(host) = host_id {
            self.http
                .post_directory_auth_as(&path, host, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn start(&self, event_id: &str, host_id: Option<&str>) -> Result<Event> {
        let path = format!("/events/{}/start", encode(event_id));
        if let Some(host) = host_id {
            self.http
                .post_directory_auth_as(&path, host, None::<&serde_json::Value>)
                .await
        } else {
            self.http
                .post_directory_auth(&path, None::<&serde_json::Value>)
                .await
        }
    }

    pub async fn end(&self, event_id: &str, host_id: Option<&str>) -> Result<Event> {
        let path = format!("/events/{}/end", encode(event_id));
        if let Some(host) = host_id {
            self.http
                .post_directory_auth_as(&path, host, None::<&serde_json::Value>)
                .await
        } else {
            self.http
                .post_directory_auth(&path, None::<&serde_json::Value>)
                .await
        }
    }

    pub async fn get_stage(&self, event_id: &str) -> Result<EventStageResponse> {
        let path = format!("/events/{}/stage", encode(event_id));
        self.http.get(&path, &[]).await
    }

    pub async fn post_to_stage(
        &self,
        event_id: &str,
        body: EventStagePost,
        actor_id: Option<&str>,
    ) -> Result<EventStageMessage> {
        // `actorId = body.sender ?? body.speaker` by default.
        let resolved = actor_id
            .map(str::to_string)
            .or_else(|| body.sender.clone())
            .or_else(|| body.speaker.clone());
        let path = format!("/events/{}/stage", encode(event_id));
        match resolved.as_deref() {
            Some(actor) => {
                self.http
                    .post_directory_auth_as(&path, actor, Some(&body))
                    .await
            }
            None => self.http.post_directory_auth(&path, Some(&body)).await,
        }
    }

    pub async fn pause_stage(&self, event_id: &str, moderator_id: Option<&str>) -> Result<Event> {
        let path = format!("/events/{}/stage/pause", encode(event_id));
        self.post_optional(&path, moderator_id).await
    }

    pub async fn resume_stage(&self, event_id: &str, moderator_id: Option<&str>) -> Result<Event> {
        let path = format!("/events/{}/stage/resume", encode(event_id));
        self.post_optional(&path, moderator_id).await
    }

    pub async fn pin_stage_message(
        &self,
        event_id: &str,
        message_id: &str,
        body: Option<serde_json::Value>,
        moderator_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let path = format!(
            "/events/{}/stage/{}/pin",
            encode(event_id),
            encode(message_id)
        );
        self.post_with_optional_body(&path, body, moderator_id)
            .await
    }

    pub async fn unpin_stage_message(
        &self,
        event_id: &str,
        message_id: &str,
        body: Option<serde_json::Value>,
        moderator_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let path = format!(
            "/events/{}/stage/{}/unpin",
            encode(event_id),
            encode(message_id)
        );
        self.post_with_optional_body(&path, body, moderator_id)
            .await
    }

    pub async fn add_speaker(
        &self,
        event_id: &str,
        speaker_id: &str,
        moderator_id: Option<&str>,
    ) -> Result<Event> {
        let path = format!(
            "/events/{}/speakers/{}",
            encode(event_id),
            encode(speaker_id)
        );
        self.post_optional(&path, moderator_id).await
    }

    pub async fn remove_speaker(
        &self,
        event_id: &str,
        speaker_id: &str,
        moderator_id: Option<&str>,
    ) -> Result<Event> {
        let path = format!(
            "/events/{}/speakers/{}",
            encode(event_id),
            encode(speaker_id)
        );
        if let Some(moderator) = moderator_id {
            self.http
                .delete_directory_auth_as(&path, moderator, None::<&serde_json::Value>)
                .await
        } else {
            self.http
                .delete_directory_auth(&path, None::<&serde_json::Value>)
                .await
        }
    }

    pub async fn mute_speaker(
        &self,
        event_id: &str,
        speaker_id: &str,
        body: Option<serde_json::Value>,
        moderator_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let path = format!(
            "/events/{}/speakers/{}/mute",
            encode(event_id),
            encode(speaker_id)
        );
        self.post_with_optional_body(&path, body, moderator_id)
            .await
    }

    pub async fn unmute_speaker(
        &self,
        event_id: &str,
        speaker_id: &str,
        body: Option<serde_json::Value>,
        moderator_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let path = format!(
            "/events/{}/speakers/{}/unmute",
            encode(event_id),
            encode(speaker_id)
        );
        self.post_with_optional_body(&path, body, moderator_id)
            .await
    }

    pub async fn activate_agenda_item(
        &self,
        event_id: &str,
        agenda_item_id: &str,
        body: Option<serde_json::Value>,
        moderator_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let path = format!(
            "/events/{}/agenda/{}/activate",
            encode(event_id),
            encode(agenda_item_id)
        );
        self.post_with_optional_body(&path, body, moderator_id)
            .await
    }

    pub async fn questions(&self, event_id: &str) -> Result<EventQuestionsResponse> {
        let path = format!("/events/{}/questions", encode(event_id));
        self.http.get(&path, &[]).await
    }

    pub async fn post_question(
        &self,
        event_id: &str,
        question: serde_json::Value,
        asker_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        // `askerId = typeof question.asker === "string" ? question.asker : undefined`.
        let resolved = asker_id.map(str::to_string).or_else(|| {
            question
                .get("asker")
                .and_then(|v| v.as_str())
                .map(str::to_string)
        });
        let path = format!("/events/{}/questions", encode(event_id));
        match resolved.as_deref() {
            Some(asker) => {
                self.http
                    .post_directory_auth_as(&path, asker, Some(&question))
                    .await
            }
            None => self.http.post_directory_auth(&path, Some(&question)).await,
        }
    }

    pub async fn upvote_question(
        &self,
        event_id: &str,
        question_id: &str,
        body: Option<serde_json::Value>,
        voter_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let path = format!(
            "/events/{}/questions/{}/upvote",
            encode(event_id),
            encode(question_id)
        );
        self.post_with_optional_body(&path, body, voter_id).await
    }

    pub async fn promote_question(
        &self,
        event_id: &str,
        question_id: &str,
        body: Option<serde_json::Value>,
        moderator_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let path = format!(
            "/events/{}/questions/{}/promote",
            encode(event_id),
            encode(question_id)
        );
        self.post_with_optional_body(&path, body, moderator_id)
            .await
    }

    pub async fn dismiss_question(
        &self,
        event_id: &str,
        question_id: &str,
        body: Option<serde_json::Value>,
        moderator_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let path = format!(
            "/events/{}/questions/{}/dismiss",
            encode(event_id),
            encode(question_id)
        );
        self.post_with_optional_body(&path, body, moderator_id)
            .await
    }

    pub async fn mark_question_answered(
        &self,
        event_id: &str,
        question_id: &str,
        body: Option<serde_json::Value>,
        moderator_id: Option<&str>,
    ) -> Result<EventQuestion> {
        let path = format!(
            "/events/{}/questions/{}/answered",
            encode(event_id),
            encode(question_id)
        );
        if let Some(moderator) = moderator_id {
            self.http
                .post_directory_auth_as(&path, moderator, body.as_ref())
                .await
        } else {
            self.http.post_directory_auth(&path, body.as_ref()).await
        }
    }

    pub async fn polls(&self, event_id: &str) -> Result<EventPollsResponse> {
        let path = format!("/events/{}/polls", encode(event_id));
        self.http.get(&path, &[]).await
    }

    pub async fn create_poll(
        &self,
        event_id: &str,
        poll: serde_json::Value,
        actor_id: Option<&str>,
    ) -> Result<EventPoll> {
        // `actorId = poll.createdBy` by default.
        let resolved = actor_id.map(str::to_string).or_else(|| {
            poll.get("createdBy")
                .and_then(|v| v.as_str())
                .map(str::to_string)
        });
        let path = format!("/events/{}/polls", encode(event_id));
        match resolved.as_deref() {
            Some(actor) => {
                self.http
                    .post_directory_auth_as(&path, actor, Some(&poll))
                    .await
            }
            None => self.http.post_directory_auth(&path, Some(&poll)).await,
        }
    }

    pub async fn vote_poll(
        &self,
        event_id: &str,
        poll_id: &str,
        option: &str,
        voter_id: Option<&str>,
    ) -> Result<EventPoll> {
        let path = format!(
            "/events/{}/polls/{}/vote",
            encode(event_id),
            encode(poll_id)
        );
        let body = serde_json::json!({ "option": option });
        if let Some(voter) = voter_id {
            self.http
                .post_directory_auth_as(&path, voter, Some(&body))
                .await
        } else {
            self.http.post_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn close_poll(
        &self,
        event_id: &str,
        poll_id: &str,
        actor_id: Option<&str>,
    ) -> Result<EventPoll> {
        let path = format!(
            "/events/{}/polls/{}/close",
            encode(event_id),
            encode(poll_id)
        );
        self.post_optional(&path, actor_id).await
    }

    pub async fn recording(&self, event_id: &str) -> Result<EventRecording> {
        let path = format!("/events/{}/recording", encode(event_id));
        self.http.get(&path, &[]).await
    }

    pub async fn update_recording(
        &self,
        event_id: &str,
        body: EventRecordingUpdate,
        host_id: Option<&str>,
    ) -> Result<Event> {
        let path = format!("/events/{}/recording", encode(event_id));
        if let Some(host) = host_id {
            self.http
                .put_directory_auth_as(&path, host, Some(&body))
                .await
        } else {
            self.http.put_directory_auth(&path, Some(&body)).await
        }
    }

    pub async fn list_series(&self) -> Result<EventSeriesListResponse> {
        self.http.get("/events/series", &[]).await
    }

    pub async fn create_series(
        &self,
        series: serde_json::Value,
        host_id: Option<&str>,
    ) -> Result<EventSeries> {
        // `hostId = series.host` by default in the TS signature.
        let resolved = host_id.map(str::to_string).or_else(|| {
            series
                .get("host")
                .and_then(|v| v.as_str())
                .map(str::to_string)
        });
        match resolved.as_deref() {
            Some(host) => {
                self.http
                    .post_directory_auth_as("/events/series", host, Some(&series))
                    .await
            }
            None => {
                self.http
                    .post_directory_auth("/events/series", Some(&series))
                    .await
            }
        }
    }

    pub async fn get_series(&self, series_id: &str) -> Result<EventSeries> {
        let path = format!("/events/series/{}", encode(series_id));
        self.http.get(&path, &[]).await
    }

    pub async fn follow_series(&self, series_id: &str, agent_id: Option<&str>) -> Result<()> {
        let path = format!("/events/series/{}/follow", encode(series_id));
        self.post_optional(&path, agent_id).await
    }

    pub async fn unfollow_series(&self, series_id: &str, agent_id: Option<&str>) -> Result<()> {
        let path = format!("/events/series/{}/follow", encode(series_id));
        if let Some(agent) = agent_id {
            self.http
                .delete_directory_auth_as(&path, agent, None::<&serde_json::Value>)
                .await
        } else {
            self.http
                .delete_directory_auth(&path, None::<&serde_json::Value>)
                .await
        }
    }

    // --- shared helpers --------------------------------------------------------

    /// POST with no body, optionally as an actor (directory auth).
    async fn post_optional<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        actor: Option<&str>,
    ) -> Result<T> {
        match actor {
            Some(actor) => {
                self.http
                    .post_directory_auth_as(path, actor, None::<&serde_json::Value>)
                    .await
            }
            None => {
                self.http
                    .post_directory_auth(path, None::<&serde_json::Value>)
                    .await
            }
        }
    }

    /// POST with an optional JSON body, optionally as an actor (directory auth).
    async fn post_with_optional_body<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: Option<serde_json::Value>,
        actor: Option<&str>,
    ) -> Result<T> {
        match actor {
            Some(actor) => {
                self.http
                    .post_directory_auth_as(path, actor, body.as_ref())
                    .await
            }
            None => self.http.post_directory_auth(path, body.as_ref()).await,
        }
    }

    /// Stream an event's live stage over WebSocket. Signed with directory auth
    /// when an `agent_id` is supplied.
    pub fn stream(
        &self,
        event_id: &str,
        agent_id: Option<&str>,
    ) -> crate::websocket::TinyPlaceWebSocket {
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(agent_id) = agent_id {
            query.push(("X-Agent-ID", agent_id.to_string()));
        }
        let path = format!("/events/{}/stream", crate::util::encode(event_id));
        self.http.websocket(
            &crate::util::append_query(&path, &query),
            agent_id.is_some(),
        )
    }
}

/// Build the query vector for `list`, mirroring the TS object-to-query encoding.
fn events_query(params: Option<&EventQueryParams>) -> Vec<(String, String)> {
    let mut q: Vec<(String, String)> = Vec::new();
    let Some(p) = params else {
        return q;
    };
    if let Some(v) = &p.q {
        q.push(("q".into(), v.clone()));
    }
    if let Some(v) = &p.type_ {
        q.push(("type".into(), v.clone()));
    }
    if let Some(v) = &p.host {
        q.push(("host".into(), v.clone()));
    }
    if let Some(v) = &p.series_id {
        q.push(("seriesId".into(), v.clone()));
    }
    if let Some(v) = &p.status {
        q.push(("status".into(), v.clone()));
    }
    if let Some(v) = &p.visibility {
        q.push(("visibility".into(), v.clone()));
    }
    if let Some(v) = &p.tag {
        q.push(("tag".into(), v.clone()));
    }
    if let Some(v) = &p.from {
        q.push(("from".into(), v.clone()));
    }
    if let Some(v) = &p.to {
        q.push(("to".into(), v.clone()));
    }
    if let Some(v) = p.limit {
        q.push(("limit".into(), v.to_string()));
    }
    q
}

/// Mirror the TS `nextClientId`: `<prefix>_<base36(now-ms)>_<12 hex>`.
fn next_client_id(prefix: &str) -> String {
    let mut random = [0u8; 6];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let suffix: String = random.iter().map(|b| format!("{b:02x}")).collect();
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{prefix}_{}_{suffix}", to_base36(millis))
}

/// Encode a number in lower-case base36, matching JS `Number.toString(36)`.
fn to_base36(mut n: u128) -> String {
    if n == 0 {
        return "0".to_string();
    }
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut buf = Vec::new();
    while n > 0 {
        buf.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    buf.reverse();
    String::from_utf8(buf).expect("base36 digits are ascii")
}
