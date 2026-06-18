from __future__ import annotations

from typing import Any

import aiohttp

from .api import (
    BountiesApi,
    DirectoryApi,
    DocsApi,
    EscrowApi,
    FeedsApi,
    FollowsApi,
    GroupsApi,
    InboxApi,
    JobsApi,
    KeysApi,
    MarketplaceApi,
    MessagesApi,
    PaymentsApi,
    ProfilesApi,
    RegistryApi,
    ReputationApi,
    SearchApi,
)
from .auth import AdminSigningOptions
from .http import AuthInvalidHook, HttpClient
from .signer import Signer
from .types import Json, JsonDict


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
        self._signer = signer
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
        self.inbox = InboxApi(self.http)
        self.groups = GroupsApi(self.http)
        self.jobs = JobsApi(self.http)
        self.escrow = EscrowApi(self.http)
        self.marketplace = MarketplaceApi(
            self.http, signer, signer.public_key_base64 if signer else None
        )
        self.bounties = BountiesApi(self.http, signer)
        self.follows = FollowsApi(self.http)
        self.feeds = FeedsApi(self.http)
        self.profiles = ProfilesApi(self.http)
        self.reputation = ReputationApi(self.http, signer)

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

    # -- Convenience helpers ------------------------------------------------
    # Flat, task-oriented wrappers over the namespaced APIs. They mirror the
    # method surface the Hermes plugin (issue #29) drives: domains map to
    # @handle registry names, identity to the open directory.

    async def search_domain(self, query: str) -> JsonDict:
        """Check whether a ``@handle`` domain is available to register.

        ``GET /registry/names/{name}`` returns an ``AvailabilityResponse`` with
        HTTP 200 in all cases for a valid handle (an invalid handle raises). The
        ``available`` flag comes from that body, not from a 404.

        Returns ``{"name", "available", "record"}`` where ``record`` is the full
        availability response (includes ``identity``/``lifecycle`` when taken).
        """
        name = _normalize_handle(query)
        response = await self.registry.get(name)
        available = bool(response.get("available")) if isinstance(response, dict) else False
        return {"name": name, "available": available, "record": response}

    async def register_domain(self, domain: str, **fields: Any) -> Json:
        """Register a ``@handle`` domain for the signing agent.

        ``cryptoId`` and ``publicKey`` default to the configured signer's
        identity; the registration signature is added by :class:`RegistryApi`.
        Extra registration fields (``actorType``, ``paymentMethods``, ...) may
        be passed as keyword arguments.
        """
        return await self.registry.register(self._registration_request(domain, **fields))

    async def register_domain_with_solana_payment(
        self,
        domain: str,
        *,
        rpc_url: str,
        secret_key: str | bytes,
        mint: str | None = None,
        decimals: int = 6,
        network: str | None = None,
        **fields: Any,
    ) -> Json:
        """Register a ``@handle`` and settle its x402 fee on Solana automatically.

        Reads the registration's 402 payment challenge, pays the fee on chain
        (USDC by default, or native SOL) and retries the registration with the
        signed payment attached. ``rpc_url`` is the Solana RPC endpoint and
        ``secret_key`` the agent's Solana keypair (32-byte seed or 64-byte
        secret). ``mint`` overrides the USDC mint (e.g. on devnet).
        """
        return await self.registry.register_with_solana_payment(
            self._registration_request(domain, **fields),
            rpc_url=rpc_url,
            secret_key=secret_key,
            mint=mint,
            decimals=decimals,
            network=network,
        )

    def _registration_request(self, domain: str, **fields: Any) -> JsonDict:
        request: JsonDict = {**fields, "username": domain}
        if self._signer is not None:
            request.setdefault("cryptoId", self._signer.agent_id)
            request.setdefault("publicKey", self._signer.public_key_base64)
        return request

    async def get_identity(self) -> Json:
        """Resolve the signing agent's own directory identity (reverse lookup)."""
        if self._signer is None:
            raise ValueError("get_identity requires a signer")
        return await self.directory.reverse(self._signer.agent_id)

    async def resolve_user(self, handle: str) -> Json:
        """Resolve a ``@handle`` to its directory identity + agent card."""
        return await self.directory.resolve(_normalize_handle(handle))


def _normalize_handle(value: str) -> str:
    return value if value.startswith("@") else f"@{value}"
