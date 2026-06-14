from __future__ import annotations

import aiohttp

from .api import DirectoryApi, DocsApi, KeysApi, MessagesApi, PaymentsApi, RegistryApi, SearchApi
from .auth import AdminSigningOptions
from .http import AuthInvalidHook, HttpClient
from .signer import Signer
from .types import Json


class TinyPlaceClient:
    def __init__(
        self,
        *,
        base_url: str,
        signer: Signer | None = None,
        admin_signer: Signer | None = None,
        admin: AdminSigningOptions | None = None,
        session: aiohttp.ClientSession | None = None,
        on_auth_invalid: AuthInvalidHook | None = None,
    ) -> None:
        self.http = HttpClient(
            base_url=base_url,
            signer=signer,
            admin_signer=admin_signer,
            admin=admin,
            session=session,
            on_auth_invalid=on_auth_invalid,
        )
        self.registry = RegistryApi(self.http, signer)
        self.keys = KeysApi(self.http)
        self.messages = MessagesApi(self.http)
        self.directory = DirectoryApi(self.http)
        self.payments = PaymentsApi(self.http, signer)
        self.search = SearchApi(self.http)
        self.docs = DocsApi(self.http)

    async def __aenter__(self) -> "TinyPlaceClient":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.close()

    async def close(self) -> None:
        await self.http.close()

    async def healthz(self) -> Json:
        return await self.http.get("/healthz")

    async def spec(self) -> Json:
        return await self.http.get("/spec")
