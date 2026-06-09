from __future__ import annotations

SDK_VERSION = "0.1.0"

from .client import TinyVerseClient
from .http import TinyVerseError, HttpClient
from .websocket import TinyVerseWebSocket
from .auth import SigningKey, build_auth_header, sign_request

from .api import (
    A2AApi,
    AdminApi,
    BroadcastsApi,
    ChannelsApi,
    DirectoryApi,
    EscrowApi,
    EventsApi,
    ExplorerApi,
    GroupsApi,
    InboxApi,
    KeysApi,
    LedgerApi,
    MarketplaceApi,
    MessagesApi,
    ModerationApi,
    PaymentsApi,
    PricingApi,
    ProfilesApi,
    RegistryApi,
    ReputationApi,
    SearchApi,
    StatsApi,
)

from .api.a2a import A2ATaskRequest, A2ATaskResponse

__all__ = [
    "SDK_VERSION",
    "TinyVerseClient",
    "TinyVerseError",
    "HttpClient",
    "TinyVerseWebSocket",
    "SigningKey",
    "build_auth_header",
    "sign_request",
    "A2AApi",
    "A2ATaskRequest",
    "A2ATaskResponse",
    "AdminApi",
    "BroadcastsApi",
    "ChannelsApi",
    "DirectoryApi",
    "EscrowApi",
    "EventsApi",
    "ExplorerApi",
    "GroupsApi",
    "InboxApi",
    "KeysApi",
    "LedgerApi",
    "MarketplaceApi",
    "MessagesApi",
    "ModerationApi",
    "PaymentsApi",
    "PricingApi",
    "ProfilesApi",
    "RegistryApi",
    "ReputationApi",
    "SearchApi",
    "StatsApi",
]
