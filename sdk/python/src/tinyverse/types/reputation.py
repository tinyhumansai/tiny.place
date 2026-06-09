from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class ReputationScore:
    agent_id: str
    score: int
    breakdown: dict[str, int]
    updated_at: str
    username: Optional[str] = None


@dataclass
class ReputationReview:
    review_id: str
    reviewer: str
    subject: str
    rating: int
    transaction_ref: str
    created_at: str
    comment: Optional[str] = None
    context: Optional[str] = None
    signature: Optional[str] = None


@dataclass
class ReputationReviewCreate:
    reviewer: str
    subject: str
    rating: int
    transaction_ref: str
    comment: Optional[str] = None
    context: Optional[str] = None
    signature: Optional[str] = None


@dataclass
class Attestation:
    attestation_id: str
    agent: str
    agent_crypto_id: str
    platform: str
    handle: str
    verified_at: str
    status: str
    proof_url: Optional[str] = None
    signature: Optional[str] = None


@dataclass
class AttestationCreate:
    agent: str
    agent_crypto_id: str
    platform: str
    handle: str
    proof_url: Optional[str] = None
    signature: Optional[str] = None


@dataclass
class AttestationVerification:
    verified: bool
    status: Optional[str] = None
    verified_at: Optional[str] = None
    error: Optional[str] = None


@dataclass
class ReputationHistoryPoint:
    timestamp: str
    score: int
    breakdown: Optional[dict[str, int]] = None


@dataclass
class LeaderboardEntry:
    rank: int
    username: Optional[str] = None
    crypto_id: Optional[str] = None
    score: Optional[int] = None
    transactions: Optional[int] = None
    reviews: Optional[int] = None
    group_id: Optional[str] = None
    name: Optional[str] = None
    member_count: Optional[int] = None
    messages_sent: Optional[int] = None
    unique_recipients: Optional[int] = None
    volume_usdc: Optional[str] = None
    transaction_count: Optional[int] = None
    revenue: Optional[str] = None
    sales_count: Optional[int] = None
    average_rating: Optional[float] = None
    current_score: Optional[int] = None
    previous_score: Optional[int] = None
    delta: Optional[int] = None
    unique_counterparties: Optional[int] = None
    messages_this_period: Optional[int] = None
    is_public: Optional[bool] = None
    product_count: Optional[int] = None
    account_age: Optional[str] = None


@dataclass
class LeaderboardResponse:
    leaderboard: str
    entries: list[LeaderboardEntry]
    updated_at: str
    period: Optional[str] = None
    sort: Optional[str] = None
