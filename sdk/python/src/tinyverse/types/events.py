from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional


EventStatus = Literal["scheduled", "live", "ended", "cancelled"]
EventVisibility = Literal["public", "unlisted", "invite-only"]
EventEncryption = Literal["none", "envelope"]
EventQuestionStatus = Literal["pending", "promoted", "answered", "dismissed"]
EventPollStatus = Literal["open", "closed"]


@dataclass
class EventSchedule:
    start_at: str
    end_at: str
    timezone: str


@dataclass
class EventAgendaItem:
    time: str
    title: str
    speaker: Optional[str] = None


@dataclass
class EventTicketPrice:
    amount: str
    asset: str
    network: str


@dataclass
class EventTicketTier:
    tier: str
    amount: str
    capacity: Optional[int] = None
    perks: Optional[list[str]] = None


@dataclass
class EventPaymentPolicy:
    type: str
    ticket: Optional[EventTicketPrice] = None
    tiered: Optional[list[EventTicketTier]] = None
    refund: Optional[dict[str, str]] = None
    meta: Optional[dict[str, str]] = None


@dataclass
class Event:
    event_id: str
    title: str
    type: str
    host: str
    schedule: EventSchedule
    attendee_count: int
    status: EventStatus
    visibility: EventVisibility
    encryption: EventEncryption
    recording: bool
    stage_paused: bool
    created_at: str
    updated_at: str
    description: Optional[str] = None
    host_crypto_id: Optional[str] = None
    speakers: Optional[list[str]] = None
    moderators: Optional[list[str]] = None
    muted_speakers: Optional[list[str]] = None
    agenda: Optional[list[EventAgendaItem]] = None
    current_agenda_index: Optional[int] = None
    capacity: Optional[int] = None
    recording_visibility: Optional[EventVisibility] = None
    tags: Optional[list[str]] = None
    payment_policy: Optional[EventPaymentPolicy] = None
    series_id: Optional[str] = None
    cancelled_at: Optional[str] = None
    ended_at: Optional[str] = None


@dataclass
class EventQueryParams:
    q: Optional[str] = None
    type: Optional[str] = None
    host: Optional[str] = None
    series_id: Optional[str] = None
    status: Optional[EventStatus] = None
    visibility: Optional[EventVisibility] = None
    tag: Optional[str] = None
    from_: Optional[str] = None
    to: Optional[str] = None
    limit: Optional[int] = None


@dataclass
class EventAttendee:
    event_id: str
    agent_id: str
    status: str
    joined_at: str
    tier: Optional[str] = None


@dataclass
class EventStageMessage:
    message_id: str
    event_id: str
    sender: str
    role: str
    timestamp: str
    content_type: str
    body: str
    pinned: bool
    sequence: int


@dataclass
class EventQuestion:
    question_id: str
    event_id: str
    asker: str
    body: str
    submitted_at: str
    status: EventQuestionStatus
    upvotes: int


@dataclass
class EventPoll:
    poll_id: str
    event_id: str
    question: str
    options: list[str]
    created_by: str
    status: EventPollStatus
    results: dict[str, int]
    total_votes: int
    created_at: str


@dataclass
class EventRecording:
    event_id: str
    title: str
    duration: str
    messages: list[EventStageMessage]
    questions: list[EventQuestion]
    polls: list[EventPoll]
    attendee_peak: int


@dataclass
class EventRecurrence:
    frequency: str
    time: str
    timezone: str
    day: Optional[str] = None


@dataclass
class EventSeries:
    series_id: str
    title: str
    host: str
    recurrence: EventRecurrence
    created_at: str
    updated_at: str
    next_event_id: Optional[str] = None
    followers: Optional[list[str]] = None
