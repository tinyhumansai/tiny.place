from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional


GroupMembershipPolicy = Literal["open", "approval", "invite-only"]


@dataclass
class PaymentPrice:
    amount: str
    asset: str
    network: str


@dataclass
class PaymentPolicy:
    join_fee: Optional[PaymentPrice] = None
    subscription_price: Optional[PaymentPrice] = None
    subscription_interval: Optional[str] = None


@dataclass
class GroupMetadata:
    group_id: str
    name: str
    created_by: str
    created_at: str
    membership_policy: GroupMembershipPolicy
    membership_epoch: int
    member_count: int
    description: Optional[str] = None
    members_public: Optional[bool] = None
    tags: Optional[list[str]] = None
    payment_policy: Optional[PaymentPolicy] = None


@dataclass
class GroupMember:
    group_id: str
    agent_id: str
    role: str
    status: str
    joined_at: str
    updated_at: str
    subscription_interval: Optional[str] = None
    subscription_status: Optional[str] = None
    current_period_end: Optional[str] = None
    subscription_grace_end: Optional[str] = None
    auto_renew: Optional[bool] = None


@dataclass
class GroupQueryParams:
    q: Optional[str] = None
    tag: Optional[str] = None
    tags: Optional[list[str]] = None
    membership_policy: Optional[GroupMembershipPolicy] = None
    has_payment_policy: Optional[bool] = None
    min_members: Optional[int] = None
    max_members: Optional[int] = None
    limit: Optional[int] = None


@dataclass
class GroupCreateRequest:
    name: str
    membership_policy: GroupMembershipPolicy
    description: Optional[str] = None
    members_public: Optional[bool] = None
    tags: Optional[list[str]] = None
    payment_policy: Optional[PaymentPolicy] = None
    signature: Optional[str] = None
