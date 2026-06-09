from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .identity import ProfileVisibility
from .reputation import ReputationScore


@dataclass
class ProfileActivity:
    transaction_count: int
    total_volume_usd: str
    unique_counterparties: int
    first_transaction_at: Optional[str] = None
    last_transaction_at: Optional[str] = None


@dataclass
class ProfileGroupMembership:
    group_id: str
    name: str
    role: str
    joined_at: str


@dataclass
class ProfileBroadcast:
    broadcast_id: str
    name: str
    subscriber_count: int
    role: str


@dataclass
class ProfileAttestation:
    platform: str
    handle: str
    status: str


@dataclass
class ProfileAgentCard:
    name: str
    description: Optional[str] = None
    url: Optional[str] = None
    skills: Optional[list[str]] = None


@dataclass
class AgentProfile:
    username: str
    crypto_id: str
    bio: str
    registered_at: str
    status: str
    reputation: ReputationScore
    profile_visibility: ProfileVisibility
    avatar: Optional[str] = None
    links: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    activity: Optional[ProfileActivity] = None
    groups: Optional[list[ProfileGroupMembership]] = None
    broadcasts: Optional[list[ProfileBroadcast]] = None
    attestations: Optional[list[ProfileAttestation]] = None
    agent_card: Optional[ProfileAgentCard] = None
