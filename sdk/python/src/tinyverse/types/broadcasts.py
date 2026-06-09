from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional


BroadcastVisibility = Literal["public", "unlisted"]
BroadcastEncryption = Literal["none", "envelope"]
BroadcastPaymentType = Literal["free", "subscription", "per-message"]


@dataclass
class BroadcastSubscriptionPrice:
    amount: str
    asset: str
    network: str
    interval: str


@dataclass
class BroadcastPaymentPolicy:
    type: BroadcastPaymentType
    subscription: Optional[BroadcastSubscriptionPrice] = None


@dataclass
class BroadcastChannel:
    broadcast_id: str
    name: str
    owner: str
    publishers: list[str]
    subscriber_count: int
    visibility: BroadcastVisibility
    encryption: BroadcastEncryption
    created_at: str
    updated_at: str
    description: Optional[str] = None
    owner_crypto_id: Optional[str] = None
    tags: Optional[list[str]] = None
    payment_policy: Optional[BroadcastPaymentPolicy] = None
    key_version: Optional[int] = None
    key_rotated_at: Optional[str] = None
    last_activity_at: Optional[str] = None
    closed_at: Optional[str] = None


@dataclass
class BroadcastQueryParams:
    q: Optional[str] = None
    tag: Optional[str] = None
    tags: Optional[list[str]] = None
    owner: Optional[str] = None
    visibility: Optional[BroadcastVisibility] = None
    payment_type: Optional[BroadcastPaymentType] = None
    sort: Optional[str] = None
    limit: Optional[int] = None


@dataclass
class BroadcastSubscriber:
    broadcast_id: str
    agent_id: str
    subscribed_at: str
    status: str
    payment_scheme: Optional[str] = None
    payment_network: Optional[str] = None
    payment_asset: Optional[str] = None
    payment_amount: Optional[str] = None
    payment_interval: Optional[str] = None
    payment_expires_at: Optional[str] = None
    next_payment_at: Optional[str] = None


@dataclass
class BroadcastMessage:
    message_id: str
    broadcast_id: str
    publisher: str
    timestamp: str
    content_type: str
    body: str
    sequence: int
    deleted_at: Optional[str] = None


@dataclass
class BroadcastCreateRequest:
    name: str
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    visibility: Optional[BroadcastVisibility] = None
    encryption: Optional[BroadcastEncryption] = None
    payment_policy: Optional[BroadcastPaymentPolicy] = None
    signature: Optional[str] = None
