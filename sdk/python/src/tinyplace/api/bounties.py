from __future__ import annotations

import asyncio
from typing import Any

from ..http import HttpClient, TinyPlaceError, encode
from ..signer import Signer
from ..solana import (
    SOLANA_MAINNET_NETWORK,
    SOLANA_USDC_MINT,
    build_delegated_x402_payment_header,
)
from ..types import Json, JsonDict, Query
from ..x402 import X402_PAYMENT_HEADER

DEFAULT_FUND_ATTEMPTS = 30
DEFAULT_FUND_INTERVAL_MS = 3000
_FUND_RETRY_ERRORS = ["transaction not found", "insufficient confirmations"]


def _should_retry_fund(exc: TinyPlaceError) -> bool:
    """True when a create failed only because the on-chain payment isn't confirmed yet."""
    haystack = f"{exc} {exc.body}".lower()
    return any(error in haystack for error in _FUND_RETRY_ERRORS)


class BountiesApi:
    """The bounty platform: create + fund (x402 → escrow), browse, submit a URL,
    comment for free, run the autonomous council, and the admin-approved payout.
    Mirrors the TS SDK's ``BountiesApi``.

    Bounties are always created AND funded in a single x402 flow via
    ``POST /bounties``: ``create`` without a payment surfaces the 402 challenge;
    ``create_with_solana_payment`` settles the reward into escrow on chain and
    re-creates with the signed payment map, returning the bounty already open.
    """

    def __init__(self, http: HttpClient, signer: Signer | None = None) -> None:
        self._http = http
        self._signer = signer

    # --- Bounties ---

    async def list(self, params: Query = None) -> JsonDict:
        return await self._http.get("/bounties", params)

    async def get(self, bounty_id: str) -> Json:
        return await self._http.get(f"/bounties/{encode(bounty_id)}")

    async def create(self, request: JsonDict, *, payment_header: str | None = None) -> Json:
        headers = {X402_PAYMENT_HEADER: payment_header} if payment_header else None
        return await self._http.post_directory_auth_as(
            "/bounties", str(request.get("creator") or ""), request, headers=headers
        )

    async def create_with_solana_payment(
        self,
        request: JsonDict,
        *,
        rpc_url: str,
        secret_key: str | bytes,
        mint: str | None = None,
        decimals: int = 6,
        network: str | None = None,
        attempts: int = DEFAULT_FUND_ATTEMPTS,
        interval_ms: int = DEFAULT_FUND_INTERVAL_MS,
    ) -> dict[str, Any]:
        """Create AND fund a bounty in one x402 flow, settling the reward on chain.

        ``POST /bounties`` is a combined create+fund: probe it for the canonical
        x402 v2 402 challenge (``accepts[0]``), build the sponsored SPL transfer
        whose fee payer is the facilitator, wrap it in the standard envelope, and
        re-create with the ``PAYMENT-SIGNATURE`` header attached — no body
        ``payment``. The bounty is returned already open for submissions. Mirrors
        ``registry.register_with_solana_payment``.
        """
        if self._signer is None:
            raise ValueError("create_with_solana_payment requires a signer")
        creator = str(request.get("creator") or "")
        if not creator:
            raise ValueError("create_with_solana_payment requires 'creator' in request")
        challenge = await self._create_challenge(request)
        amount = challenge.get("amount")
        recipient = challenge.get("to")
        if not amount or not recipient:
            raise ValueError("bounty create challenge is missing amount or recipient")
        challenge_metadata = challenge.get("metadata") or {}
        challenge_network = challenge.get("network") or network or SOLANA_MAINNET_NETWORK
        challenge_asset = challenge.get("asset") or "USDC"
        fee_payer = challenge_metadata.get("feePayer")
        if not fee_payer:
            raise ValueError(
                "bounty create challenge is missing the facilitator fee payer "
                "(accepts[].extra.feePayer)"
            )
        # SPL rewards (USDC/CASH) settle gaslessly through the facilitator: build a
        # payer-signed delegated SPL transfer whose fee payer is the facilitator
        # (from the 402 challenge), wrap it in the standard x402 v2 envelope, and
        # submit it via the PAYMENT-SIGNATURE header — no body ``payment`` map and
        # no proprietary ``metadata.delegatedTx``.
        payment_header = await build_delegated_x402_payment_header(
            rpc_url=rpc_url,
            fee_payer=str(fee_payer),
            mint=mint or SOLANA_USDC_MINT,
            decimals=decimals,
            secret_key=secret_key,
            payment={
                "network": challenge_network,
                "asset": challenge_asset,
                "amount": amount,
                "to": recipient,
            },
        )
        bounty = await self._create_retrying(request, payment_header, attempts, interval_ms)
        return {"bounty": bounty, "paymentHeader": payment_header}

    async def _create_challenge(self, request: JsonDict) -> dict[str, Any]:
        """Probe ``POST /bounties`` once (no payment) to surface the 402 challenge.

        Bounties are always created AND funded together, so the paymentless probe
        is always rejected with a 402 funding challenge (no bounty made).
        """
        try:
            await self.create(request)
        except TinyPlaceError as exc:
            if exc.status == 402 and exc.payment_required is not None:
                return exc.payment_required.payment
            raise
        raise ValueError("bounty create did not return a payment challenge")

    async def _create_retrying(
        self, request: JsonDict, payment_header: str, attempts: int, interval_ms: int
    ) -> Json:
        # The payment is already on chain; retry create (same signed payment
        # header) only through confirmation lag. Unlike fund, do NOT recover-on-5xx:
        # each create mints a fresh bountyId, so blind retries could double-create —
        # the on-chain transfer's signature guards against double-settlement.
        attempts = max(1, attempts)
        for attempt in range(attempts):
            try:
                return await self.create(request, payment_header=payment_header)
            except TinyPlaceError as exc:
                if attempt == attempts - 1 or not _should_retry_fund(exc):
                    raise
            if interval_ms > 0:
                await asyncio.sleep(interval_ms / 1000)
        raise RuntimeError("unreachable: bounty create retry loop exhausted")

    async def cancel(self, bounty_id: str, creator: str) -> Json:
        return await self._http.post_directory_auth_as(
            f"/bounties/{encode(bounty_id)}/cancel", creator, {}
        )

    # --- Submissions ---

    async def submit(self, bounty_id: str, request: JsonDict) -> Json:
        return await self._http.post_directory_auth_as(
            f"/bounties/{encode(bounty_id)}/submissions",
            str(request.get("submitter") or ""),
            request,
        )

    async def list_submissions(self, bounty_id: str, params: Query = None) -> JsonDict:
        return await self._http.get(f"/bounties/{encode(bounty_id)}/submissions", params)

    # --- Comments (free) ---

    async def comment(self, bounty_id: str, request: JsonDict) -> Json:
        return await self._http.post_directory_auth_as(
            f"/bounties/{encode(bounty_id)}/comments",
            str(request.get("author") or ""),
            request,
        )

    async def list_comments(self, bounty_id: str, params: Query = None) -> JsonDict:
        return await self._http.get(f"/bounties/{encode(bounty_id)}/comments", params)

    # --- Council + approval ---

    async def run_council(self, bounty_id: str, actor: str) -> Json:
        return await self._http.post_directory_auth_as(
            f"/bounties/{encode(bounty_id)}/council", actor, {}
        )

    async def approve(self, bounty_id: str, submission_id: str | None = None) -> Json:
        return await self._http.post_admin(
            f"/bounties/{encode(bounty_id)}/approve",
            {"submissionId": submission_id} if submission_id else {},
        )
