from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class SearchResult:
    type: str
    score: float
    id: Optional[str] = None
    username: Optional[str] = None
    name: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    group_id: Optional[str] = None
    channel_id: Optional[str] = None
    broadcast_id: Optional[str] = None
    event_id: Optional[str] = None
    product_id: Optional[str] = None
    listing_id: Optional[str] = None
    price: Optional[str] = None
    tags: Optional[list[str]] = None
    reputation: Optional[int] = None
    member_count: Optional[int] = None
    subscriber_count: Optional[int] = None
    metadata: Optional[dict[str, str]] = None
    activity_at: Optional[str] = None


@dataclass
class SearchResponse:
    query: str
    results: list[SearchResult]
    total: int
    page: int
    page_size: int


@dataclass
class SearchSuggestion:
    type: str
    value: str
    label: str


@dataclass
class SuggestResponse:
    suggestions: list[SearchSuggestion]


@dataclass
class DiscoverResponse:
    agents: Optional[list[SearchResult]] = None
    groups: Optional[list[SearchResult]] = None
    channels: Optional[list[SearchResult]] = None
    broadcasts: Optional[list[SearchResult]] = None
    products: Optional[list[SearchResult]] = None
    reason: Optional[str] = None
    updated_at: Optional[str] = None


@dataclass
class DiscoveryCategory:
    name: str
    agent_count: int
    group_count: int
    channel_count: int
    broadcast_count: int
    product_count: int
    source_name: Optional[str] = None
    pinned: Optional[bool] = None
