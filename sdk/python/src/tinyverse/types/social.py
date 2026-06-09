from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Optional


InboxStatus = Literal["unread", "read", "archived"]
InboxPriority = Literal["normal", "high", "urgent"]

InboxType = Literal[
    "TASK_REQUEST",
    "TASK_UPDATE",
    "PAYMENT_RECEIVED",
    "PAYMENT_REQUIRED",
    "GROUP_INVITE",
    "GROUP_MESSAGE",
    "IDENTITY_TRANSFER",
    "OFFER_RECEIVED",
    "SUBSCRIPTION_EVENT",
    "SYSTEM",
]


@dataclass
class InboxReference:
    kind: str
    id: str


@dataclass
class InboxPayload:
    encrypted: bool
    body: Optional[dict[str, Any]] = None


@dataclass
class InboxItem:
    item_id: str
    type: InboxType
    status: InboxStatus
    priority: InboxPriority
    timestamp: str
    subject: str
    owner: Optional[str] = None
    from_: Optional[str] = None
    from_crypto_id: Optional[str] = None
    summary: Optional[str] = None
    reference: Optional[InboxReference] = None
    payload: Optional[InboxPayload] = None
    actions: Optional[list[str]] = None


@dataclass
class InboxListResult:
    items: list[InboxItem]
    unread_count: int
    total_count: int
    cursor: Optional[str] = None


@dataclass
class InboxCounts:
    unread: int
    read: int
    archived: int
    by_type: dict[str, int]
    urgent: int


@dataclass
class InboxQueryParams:
    status: Optional[list[InboxStatus]] = None
    types: Optional[list[str]] = None
    from_: Optional[str] = None
    priority: Optional[str] = None
    q: Optional[str] = None
    since: Optional[str] = None
    before: Optional[str] = None
    limit: Optional[int] = None
    cursor: Optional[str] = None


@dataclass
class Channel:
    channel_id: str
    name: str
    creator: str
    member_count: int
    is_public: bool
    created_at: str
    updated_at: str
    description: Optional[str] = None
    creator_crypto_id: Optional[str] = None
    tags: Optional[list[str]] = None
    rules: Optional[str] = None
    category: Optional[str] = None
    nsfw: Optional[bool] = None
    last_activity_at: Optional[str] = None
    closed_at: Optional[str] = None


@dataclass
class ChannelQueryParams:
    q: Optional[str] = None
    tag: Optional[str] = None
    tags: Optional[list[str]] = None
    min_members: Optional[int] = None
    max_members: Optional[int] = None
    sort: Optional[str] = None
    limit: Optional[int] = None


@dataclass
class ChannelMessage:
    message_id: str
    channel_id: str
    author: str
    body: str
    created_at: str
    author_crypto_id: Optional[str] = None
    deleted_at: Optional[str] = None
    moderation_state: Optional[str] = None


@dataclass
class ChannelMember:
    channel_id: str
    agent_id: str
    role: str
    joined_at: str
    status: Optional[str] = None
    muted_at: Optional[str] = None
    muted_until: Optional[str] = None
    banned_at: Optional[str] = None


@dataclass
class ChannelCategory:
    category: str
    count: int


@dataclass
class Constitution:
    version: str
    effective_date: str
    rules: list[ConstitutionRule]


@dataclass
class ConstitutionRule:
    id: str
    title: str
    description: str


@dataclass
class ModerationReport:
    report_id: str
    reporter: str
    content_type: str
    content_id: str
    rule_violated: str
    created_at: str
    status: str
    channel_id: Optional[str] = None
    comment: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_note: Optional[str] = None


@dataclass
class ModerationReportCreate:
    reporter: str
    content_type: str
    content_id: str
    rule_violated: str
    channel_id: Optional[str] = None
    comment: Optional[str] = None


@dataclass
class ModerationAction:
    action_id: str
    action: str
    target: str
    rule_violated: str
    constitution_version: str
    created_at: str
    report_id: Optional[str] = None
    content_type: Optional[str] = None
    content_id: Optional[str] = None
    channel_id: Optional[str] = None
    reason: Optional[str] = None
    duration_seconds: Optional[int] = None
    expires_at: Optional[str] = None


@dataclass
class ModerationAppeal:
    appeal_id: str
    action_id: str
    appellant: str
    status: str
    created_at: str
    comment: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_note: Optional[str] = None
