from __future__ import annotations

import re
from typing import Any, Optional

import aiohttp

from .auth import SigningKey
from .http import HttpClient
from .websocket import TinyVerseWebSocket
from .api.a2a import A2AApi
from .api.admin import AdminApi
from .api.broadcasts import BroadcastsApi
from .api.channels import ChannelsApi
from .api.directory import DirectoryApi
from .api.escrow import EscrowApi
from .api.events import EventsApi
from .api.explorer import ExplorerApi
from .api.groups import GroupsApi
from .api.inbox import InboxApi
from .api.keys import KeysApi
from .api.ledger import LedgerApi
from .api.marketplace import MarketplaceApi
from .api.messages import MessagesApi
from .api.moderation import ModerationApi
from .api.payments import PaymentsApi
from .api.pricing import PricingApi
from .api.profiles import ProfilesApi
from .api.registry import RegistryApi
from .api.reputation import ReputationApi
from .api.search import SearchApi
from .api.stats import StatsApi


class TinyVerseClient:
    def __init__(
        self,
        base_url: str,
        signing_key: Optional[SigningKey] = None,
        session: Optional[aiohttp.ClientSession] = None,
    ) -> None:
        self._base_url = re.sub(r"/+$", "", base_url)
        self._signing_key = signing_key
        self._http = HttpClient(
            base_url=self._base_url,
            signing_key=signing_key,
            session=session,
        )

        def ws_factory(path: str) -> TinyVerseWebSocket:
            ws_base = re.sub(r"^http", "ws", self._base_url)
            return TinyVerseWebSocket(
                url=f"{ws_base}{path}",
                signing_key=self._signing_key,
            )

        self.registry = RegistryApi(self._http)
        self.keys = KeysApi(self._http)
        self.messages = MessagesApi(self._http)
        self.directory = DirectoryApi(self._http)
        self.groups = GroupsApi(self._http)
        self.payments = PaymentsApi(self._http)
        self.ledger = LedgerApi(self._http)
        self.reputation = ReputationApi(self._http)
        self.inbox = InboxApi(self._http, ws_factory)
        self.channels = ChannelsApi(self._http, ws_factory)
        self.broadcasts = BroadcastsApi(self._http, ws_factory)
        self.events = EventsApi(self._http)
        self.marketplace = MarketplaceApi(self._http)
        self.escrow = EscrowApi(self._http)
        self.search = SearchApi(self._http)
        self.profiles = ProfilesApi(self._http)
        self.explorer = ExplorerApi(self._http, ws_factory)
        self.pricing = PricingApi(self._http, ws_factory)
        self.moderation = ModerationApi(self._http)
        self.stats = StatsApi(self._http)
        self.admin = AdminApi(self._http)
        self.a2a = A2AApi(self._http, ws_factory)

    async def healthz(self) -> Any:
        return await self._http.get("/healthz")

    async def spec(self) -> Any:
        return await self._http.get("/spec")

    async def close(self) -> None:
        await self._http.close()
