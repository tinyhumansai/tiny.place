from __future__ import annotations

import asyncio
from typing import Any

from ..http import HttpClient, TinyPlaceError, encode
from ..signer import Signer
from ..solana import SOLANA_MAINNET_NETWORK, SOLANA_USDC_MINT, execute_solana_x402_payment
from ..types import Json, JsonDict, Query

DEFAULT_FUND_ATTEMPTS = 30
DEFAULT_FUND_INTERVAL_MS = 3000
_FUND_RETRY_ERRORS = ["transaction not found", "insufficient confirmations"]


def _should_retry_fund(exc: TinyPlaceError) -> bool:
    """True when a fund failed only because the on-chain payment isn't confirmed yet."""
    haystack = f"{exc} {exc.body}".lower()
    return any(error in haystack for error in _FUND_RETRY_ERRORS)


class BountiesApi:
    """The bounty platform: create + fund (x402 → escrow), browse, submit a URL,
    comment for free, run the autonomous council, and the admin-approved payout.
    Mirrors the TS SDK's ``BountiesApi``.

    ``fund`` accepts a prepared x402 payment map (or surfaces the 402 challenge);
    ``fund_with_solana_payment`` settles it on chain automatically, reusing the
    same Solana primitives as registration/marketplace settlement.
    """

    def __init__(self, http: HttpClient, signer: Signer | None = None) -> None:
        self._http = http
        self._signer = signer

    # --- Bounties ---

    async def list(self, params: Query = None) -> JsonDict:
        return await self._http.get("/bounties", params)

    async def get(self, bounty_id: str) -> Json:
        return await self._http.get(f"/bounties/{encode(bounty_id)}")

    async def create(self, request: JsonDict) -> Json:
        return await self._http.post_directory_auth_as(
            "/bounties", str(request.get("creator") or ""), request
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

        When the backend has bounty funding configured, ``POST /bounties`` is a
        combined create+fund: probe it for the 402 challenge, pay the reward into
        the escrow wallet on chain, then re-create with the signed payment
        attached — the bounty is returned already open for submissions. Mirrors
        ``fund_with_solana_payment`` / ``registry.register_with_solana_payment``.

        When the backend has funding **disabled**, the paymentless probe creates
        an unfunded draft outright; that draft is returned with ``payment: None``
        rather than discarded as an error.
        """
        if self._signer is None:
            raise ValueError("create_with_solana_payment requires a signer")
        creator = str(request.get("creator") or "")
        if not creator:
            raise ValueError("create_with_solana_payment requires 'creator' in request")
        draft, challenge = await self._probe_create(request)
        if challenge is None:
            # Funding disabled: the probe already created an unfunded draft.
            return {"bounty": draft, "payment": None}
        amount = challenge.get("amount")
        recipient = challenge.get("to")
        if not amount or not recipient:
            raise ValueError("bounty create challenge is missing amount or recipient")
        execution = await execute_solana_x402_payment(
            signer=self._signer,
            rpc_url=rpc_url,
            secret_key=secret_key,
            mint=mint or SOLANA_USDC_MINT,
            decimals=decimals,
            payment={
                "scheme": challenge.get("scheme", "exact"),
                "network": challenge.get("network") or network or SOLANA_MAINNET_NETWORK,
                "asset": challenge.get("asset") or "USDC",
                "amount": amount,
                "from": creator,
                "to": recipient,
                "nonce": challenge.get("nonce"),
                "expiresAt": challenge.get("expiresAt"),
                "metadata": {
                    **(challenge.get("metadata") or {}),
                    "kind": "bounty-fund",
                },
            },
        )
        bounty = await self._create_retrying(
            {**request, "payment": execution["payment"]}, attempts, interval_ms
        )
        return {"bounty": bounty, "payment": execution}

    async def _probe_create(self, request: JsonDict) -> tuple[Json | None, dict[str, Any] | None]:
        """Probe ``POST /bounties`` once to discover the funding mode.

        Returns ``(None, challenge)`` when funding is enabled (the paymentless
        create is rejected with a 402 funding challenge, no bounty made), or
        ``(draft, None)`` when funding is disabled (the create succeeds and an
        unfunded draft is returned). The draft is surfaced rather than discarded
        so a funding-disabled backend doesn't look like an error.
        """
        try:
            draft = await self.create(request)
        except TinyPlaceError as exc:
            if exc.status == 402 and exc.payment_required is not None:
                return None, exc.payment_required.payment
            raise
        return draft, None

    async def _create_retrying(self, request: JsonDict, attempts: int, interval_ms: int) -> Json:
        # The payment is already on chain; retry create (same signed payment map)
        # only through confirmation lag. Unlike fund, do NOT recover-on-5xx: each
        # create mints a fresh bountyId, so blind retries could double-create —
        # the per-payer nonce replay protection guards the on-chain transfer.
        attempts = max(1, attempts)
        for attempt in range(attempts):
            try:
                return await self.create(request)
            except TinyPlaceError as exc:
                if attempt == attempts - 1 or not _should_retry_fund(exc):
                    raise
            if interval_ms > 0:
                await asyncio.sleep(interval_ms / 1000)
        raise RuntimeError("unreachable: bounty create retry loop exhausted")

    async def fund(self, bounty_id: str, creator: str, payment: JsonDict | None = None) -> Json:
        # Call without a payment to receive the 402 challenge; re-call with the
        # signed payment map to fund the escrow.
        return await self._http.post_directory_auth_as(
            f"/bounties/{encode(bounty_id)}/fund",
            creator,
            {"payment": payment} if payment else {},
        )

    async def fund_with_solana_payment(
        self,
        bounty_id: str,
        creator: str,
        *,
        rpc_url: str,
        secret_key: str | bytes,
        mint: str | None = None,
        decimals: int = 6,
        network: str | None = None,
        attempts: int = DEFAULT_FUND_ATTEMPTS,
        interval_ms: int = DEFAULT_FUND_INTERVAL_MS,
    ) -> dict[str, Any]:
        """Fund a bounty, settling the reward into escrow on chain (exact x402).

        Probes ``fund`` for the 402 challenge, pays it on chain, then re-funds
        with the signed payment map — polling through the unconfirmed window and
        recovering if a post-payment 5xx already funded it, so a transient error
        never causes a second on-chain transfer. Mirrors
        ``registry.register_with_solana_payment``.
        """
        if self._signer is None:
            raise ValueError("fund_with_solana_payment requires a signer")
        challenge = await self._fund_challenge(bounty_id, creator)
        amount = challenge.get("amount")
        recipient = challenge.get("to")
        if not amount or not recipient:
            raise ValueError("bounty fund challenge is missing amount or recipient")
        execution = await execute_solana_x402_payment(
            signer=self._signer,
            rpc_url=rpc_url,
            secret_key=secret_key,
            mint=mint or SOLANA_USDC_MINT,
            decimals=decimals,
            payment={
                "scheme": challenge.get("scheme", "exact"),
                "network": challenge.get("network") or network or SOLANA_MAINNET_NETWORK,
                "asset": challenge.get("asset") or "USDC",
                "amount": amount,
                "from": creator,
                "to": recipient,
                "nonce": challenge.get("nonce"),
                "expiresAt": challenge.get("expiresAt"),
                "metadata": {
                    **(challenge.get("metadata") or {}),
                    "bountyId": bounty_id,
                    "kind": "bounty-fund",
                },
            },
        )
        bounty = await self._fund_retrying(
            bounty_id, creator, execution["payment"], attempts, interval_ms
        )
        return {"bounty": bounty, "payment": execution}

    async def _fund_retrying(
        self, bounty_id: str, creator: str, payment: JsonDict, attempts: int, interval_ms: int
    ) -> Json:
        # The payment is already on chain; retry the SAME fund call (same payment
        # map — no new transfer) through confirmation lag, and recover if a 5xx
        # actually funded the bounty, so the creator never pays twice.
        attempts = max(1, attempts)
        for attempt in range(attempts):
            try:
                return await self.fund(bounty_id, creator, payment)
            except TinyPlaceError as exc:
                if attempt == attempts - 1 or not _should_retry_fund(exc):
                    recovered = await self._recover_funded_bounty(bounty_id, exc)
                    if recovered is not None:
                        return recovered
                    raise
            if interval_ms > 0:
                await asyncio.sleep(interval_ms / 1000)
        raise RuntimeError("unreachable: bounty fund retry loop exhausted")

    async def _recover_funded_bounty(self, bounty_id: str, exc: TinyPlaceError) -> Json | None:
        """Return the bounty if a post-payment 5xx still funded it (has fundingTxSig)."""
        if exc.status < 500:
            return None
        try:
            bounty = await self.get(bounty_id)
        except TinyPlaceError:
            return None
        if isinstance(bounty, dict) and bounty.get("fundingTxSig"):
            return bounty
        return None

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

    async def _fund_challenge(self, bounty_id: str, creator: str) -> dict[str, Any]:
        try:
            await self.fund(bounty_id, creator)
        except TinyPlaceError as exc:
            if exc.status == 402 and exc.payment_required is not None:
                return exc.payment_required.payment
            raise
        raise ValueError("bounty fund did not return a payment challenge")
