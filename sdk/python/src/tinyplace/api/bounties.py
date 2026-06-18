from __future__ import annotations

from typing import Any

from ..http import HttpClient, TinyPlaceError, encode
from ..signer import Signer
from ..solana import SOLANA_MAINNET_NETWORK, SOLANA_USDC_MINT, execute_solana_x402_payment
from ..types import Json, JsonDict, Query


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
    ) -> dict[str, Any]:
        """Fund a bounty, settling the reward into escrow on chain (exact x402).

        Probes ``fund`` for the 402 challenge, pays it on chain, then re-funds
        with the signed payment map. Mirrors ``registry.register_with_solana_payment``.
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
        bounty = await self.fund(bounty_id, creator, execution["payment"])
        return {"bounty": bounty, "payment": execution}

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
