from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional


IdentityStatus = Literal["active", "expiring", "auction", "expired", "released", "deleted"]


@dataclass
class PaymentMethod:
    network: str
    address: str
    assets: list[str]


@dataclass
class IdentityMetadata:
    avatar: Optional[str] = None
    links: Optional[list[str]] = None
    tags: Optional[list[str]] = None


@dataclass
class Subname:
    subname: str
    target: str
    created_at: str
    bio: Optional[str] = None


@dataclass
class Identity:
    username: str
    bio: str
    crypto_id: str
    public_key: str
    registered_at: str
    expires_at: str
    status: IdentityStatus
    updated_at: str
    registration_tx: Optional[str] = None
    payment_methods: Optional[list[PaymentMethod]] = None
    metadata: Optional[IdentityMetadata] = None
    subnames: Optional[list[Subname]] = None
    signature: Optional[str] = None
    payment: Optional[dict[str, str]] = None
    last_renewal_tx: Optional[str] = None


@dataclass
class IdentityProfileUpdate:
    bio: Optional[str] = None
    metadata: Optional[IdentityMetadata] = None
    signature: Optional[str] = None


@dataclass
class RenewalRequest:
    payment: Optional[dict[str, str]] = None
    signature: Optional[str] = None


@dataclass
class IdentityClaimRequest:
    crypto_id: str
    public_key: str
    payment: Optional[dict[str, str]] = None
    signature: Optional[str] = None


@dataclass
class SubnameCreateRequest:
    subname: str
    target: str
    bio: Optional[str] = None
    created_at: Optional[str] = None
    signature: Optional[str] = None


@dataclass
class IdentityLifecycle:
    phase: str
    annual_fee: str
    grace_ends_at: Optional[str] = None
    auction_starts_at: Optional[str] = None
    auction_ends_at: Optional[str] = None
    available_at: Optional[str] = None
    current_price: Optional[str] = None


@dataclass
class AvailabilityResponse:
    available: bool
    name: str
    identity: Optional[Identity] = None
    lifecycle: Optional[IdentityLifecycle] = None


@dataclass
class IdentityExport:
    identity: Identity
    ledger_transactions: list[dict]
    exported_at: str
    verification: dict[str, str]


@dataclass
class ProfileVisibility:
    activity: bool
    groups: bool
    broadcasts: bool
    attestations: bool
    agent_card: bool
    search_engine_indexing: bool


@dataclass
class ProfileVisibilityUpdate:
    activity: Optional[bool] = None
    groups: Optional[bool] = None
    broadcasts: Optional[bool] = None
    attestations: Optional[bool] = None
    agent_card: Optional[bool] = None
    search_engine_indexing: Optional[bool] = None
    signature: Optional[str] = None
