from __future__ import annotations

import asyncio
from typing import Any

from ..auth import sign_fresh_canonical_payload
from ..crypto import canonical_payload, crypto_id_to_public_key_base64
from ..http import HttpClient, TinyPlaceError, encode
from ..signer import Signer
from ..solana import (
    SOLANA_MAINNET_NETWORK,
    SOLANA_USDC_MINT,
    USDC_DECIMALS,
    build_delegated_x402_payment_header,
)
from ..types import Json, JsonDict
from ..x402 import X402_PAYMENT_HEADER

DEFAULT_REGISTRATION_ATTEMPTS = 30
DEFAULT_REGISTRATION_INTERVAL_MS = 3000
DEFAULT_REGISTRATION_RETRY_ERRORS = ["transaction not found", "insufficient confirmations"]


class RegistryApi:
    def __init__(self, http: HttpClient, signer: Signer | None = None) -> None:
        self._http = http
        self._signer = signer

    async def register(self, request: JsonDict, *, payment_header: str | None = None) -> Json:
        request = _normalize_register_request(request)
        if self._signer and not request.get("signature"):
            request["signature"] = await sign_fresh_canonical_payload(
                self._signer,
                _registration_signature_payload(request),
            )
        headers = {X402_PAYMENT_HEADER: payment_header} if payment_header else None
        return await self._http.post_public("/registry/names", request, headers=headers)

    async def register_with_solana_payment(
        self,
        request: JsonDict,
        *,
        rpc_url: str,
        secret_key: str | bytes,
        mint: str | None = None,
        decimals: int = USDC_DECIMALS,
        network: str | None = None,
        attempts: int = DEFAULT_REGISTRATION_ATTEMPTS,
        interval_ms: int = DEFAULT_REGISTRATION_INTERVAL_MS,
    ) -> JsonDict:
        """Register ``request``, settling the x402 fee with a sponsored Solana payment.

        Probes the registration to read the canonical x402 v2 402 challenge
        (``accepts[0]``: ``network``/``amount``/``asset``-mint/``payTo``/
        ``extra.feePayer``), builds the partially-signed SPL ``TransferChecked``
        whose fee payer is the facilitator (so the payer needs no SOL for gas),
        wraps it in the standard ``PaymentPayload`` envelope, and submits it via
        the ``PAYMENT-SIGNATURE`` header — with **no** ``payment`` field in the
        request body. Polls through the brief window where the chain hasn't yet
        confirmed the transfer. Mirrors the TS SDK's ``registerWithSolanaPayment``.
        """
        if self._signer is None:
            raise ValueError("register_with_solana_payment requires a signer")
        normalized = _normalize_register_request(request)
        challenge = await self._registration_payment_challenge(normalized)
        amount = challenge.get("amount")
        recipient = challenge.get("to")
        if not amount or not recipient:
            raise ValueError("registration payment challenge is missing amount or recipient")

        challenge_metadata = challenge.get("metadata") or {}
        challenge_network = challenge.get("network") or network or SOLANA_MAINNET_NETWORK
        # The registration fee is USDC: default to the USDC mint so a challenge
        # that names the asset by its SPL mint address (rather than the literal
        # "USDC" symbol) still settles. Callers override for devnet / custom
        # deployments.
        challenge_asset = challenge.get("asset") or "USDC"
        fee_payer = challenge_metadata.get("feePayer")
        if not fee_payer:
            raise ValueError(
                "registration payment challenge is missing the facilitator fee payer "
                "(accepts[].extra.feePayer)"
            )

        # The USDC registration fee settles gaslessly through the facilitator: a
        # payer-signed delegated SPL transfer whose fee payer is the facilitator
        # (from the 402 challenge), wrapped in the standard x402 v2 envelope and
        # carried in the PAYMENT-SIGNATURE header — no body ``payment`` map and
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
        try:
            identity = await self._register_retrying_payment(
                normalized, payment_header, attempts, interval_ms
            )
        except TinyPlaceError as exc:
            # The payment is already on chain. A 5xx can still come back after
            # the identity was persisted, so check whether the handle now exists
            # before failing — re-driving the flow would otherwise risk paying
            # twice. Re-raise only if it truly wasn't created.
            identity = await self._recover_registered_identity(normalized["username"], exc)
            if identity is None:
                raise
        return {
            "identity": identity,
            "paymentHeader": payment_header,
            "onChainTx": None,
        }

    async def _recover_registered_identity(
        self, username: str, exc: TinyPlaceError
    ) -> Json | None:
        """Return the identity if a post-payment 5xx still created the handle."""
        if exc.status < 500:
            return None
        try:
            result = await self.get(username)
        except TinyPlaceError:
            return None
        if isinstance(result, dict) and result.get("available") is False:
            return result.get("identity")
        return None

    async def _registration_payment_challenge(self, request: JsonDict) -> dict[str, Any]:
        try:
            await self.register(request)
        except TinyPlaceError as exc:
            if exc.status == 402 and exc.payment_required is not None:
                return exc.payment_required.payment
            raise
        raise ValueError("registration did not return a payment challenge")

    async def _register_retrying_payment(
        self, request: JsonDict, payment_header: str, attempts: int, interval_ms: int
    ) -> Json:
        attempts = max(1, attempts)
        for attempt in range(attempts):
            try:
                return await self.register(request, payment_header=payment_header)
            except TinyPlaceError as exc:
                if attempt == attempts - 1 or not _should_retry_registration(exc):
                    raise
            if interval_ms > 0:
                await asyncio.sleep(interval_ms / 1000)
        raise RuntimeError("unreachable: registration retry loop exhausted")

    async def get(self, name: str) -> Json:
        return await self._http.get(f"/registry/names/{encode(name)}")

    async def export(self, name: str) -> Json:
        return await self._http.get(f"/registry/names/{encode(name)}/export")

    async def update_profile_visibility(self, name: str, update: JsonDict) -> Json:
        if self._signer and not update.get("signature"):
            update = {
                **update,
                "signature": await sign_fresh_canonical_payload(
                    self._signer,
                    canonical_payload(
                        "identity.profile.visibility",
                        {
                            "activity": update.get("activity"),
                            "agentCard": update.get("agentCard"),
                            "attestations": update.get("attestations"),
                            "broadcasts": update.get("broadcasts"),
                            "groups": update.get("groups"),
                            "searchEngineIndexing": update.get("searchEngineIndexing"),
                            "username": name,
                        },
                    ),
                ),
            }
        return await self._http.put_directory_auth(
            f"/registry/names/{encode(name)}/profile-visibility",
            update,
        )

    async def renew(self, name: str, request: JsonDict) -> Json:
        if self._signer and not request.get("signature"):
            request = {
                **request,
                "signature": await sign_fresh_canonical_payload(
                    self._signer,
                    canonical_payload("identity.renew", {"username": name}),
                ),
            }
        return await self._http.post_directory_auth(
            f"/registry/names/{encode(name)}/renew",
            request,
        )

    async def transfer(self, name: str, request: JsonDict) -> Json:
        if self._signer and not request.get("signature"):
            request = {
                **request,
                "signature": await sign_fresh_canonical_payload(
                    self._signer,
                    canonical_payload(
                        "identity.transfer",
                        {
                            "cryptoId": request.get("cryptoId"),
                            "publicKey": request.get("publicKey"),
                            "username": name,
                        },
                    ),
                ),
            }
        return await self._http.post_directory_auth(
            f"/registry/names/{encode(name)}/transfer",
            request,
        )

    async def assign_primary(self, name: str) -> Json:
        return await self._set_primary(name, True)

    async def unassign_primary(self, name: str) -> Json:
        return await self._set_primary(name, False)

    async def claim(self, name: str, request: JsonDict) -> Json:
        if self._signer and not request.get("signature"):
            request = {
                **request,
                "signature": await sign_fresh_canonical_payload(
                    self._signer,
                    canonical_payload(
                        "identity.claim",
                        {
                            "cryptoId": request.get("cryptoId"),
                            "publicKey": request.get("publicKey"),
                            "username": name,
                        },
                    ),
                ),
            }
        return await self._http.post(f"/registry/names/{encode(name)}/claim", request)

    async def create_subname(self, name: str, request: JsonDict) -> Json:
        if self._signer and not request.get("signature"):
            request = {
                **request,
                "signature": await sign_fresh_canonical_payload(
                    self._signer,
                    canonical_payload(
                        "identity.subname.create",
                        {
                            "bio": request.get("bio"),
                            "subname": request.get("subname"),
                            "target": request.get("target"),
                            "username": name,
                        },
                    ),
                ),
            }
        return await self._http.post_directory_auth(
            f"/registry/names/{encode(name)}/subnames",
            request,
        )

    async def delete_subname(self, name: str, subname: str) -> Json:
        headers = {}
        if self._signer:
            headers["X-TinyPlace-Signature"] = await sign_fresh_canonical_payload(
                self._signer,
                canonical_payload("identity.subname.delete", {"subname": subname, "username": name}),
            )
            presented_key = self._http.signing_public_key()
            if presented_key:
                headers["X-TinyPlace-Public-Key"] = presented_key
        return await self._http.delete_public(
            f"/registry/names/{encode(name)}/subnames/{encode(subname)}",
            headers=headers,
        )

    async def _set_primary(self, name: str, primary: bool) -> Json:
        action = "identity.assign" if primary else "identity.unassign"
        body: dict[str, Any] = {}
        if self._signer:
            body["signature"] = await sign_fresh_canonical_payload(
                self._signer,
                canonical_payload(action, {"username": name}),
            )
        suffix = "assign" if primary else "unassign"
        return await self._http.post_directory_auth(f"/registry/names/{encode(name)}/{suffix}", body)


def _normalize_handle(username: str) -> str:
    return username if username.startswith("@") else f"@{username}"


def _should_retry_registration(exc: TinyPlaceError) -> bool:
    """True when a registration failed only because the payment isn't confirmed yet."""
    haystack = f"{exc} {exc.body}".lower()
    return any(error in haystack for error in DEFAULT_REGISTRATION_RETRY_ERRORS)


def _normalize_register_request(request: JsonDict) -> JsonDict:
    # Normalize the handle and derive the publicKey from cryptoId when omitted.
    # A Solana cryptoId IS the base58 ed25519 public key, so the base64 publicKey
    # the backend stores and signs over is derivable from it. Deriving here keeps
    # the signed payload and request body identical to the backend's server-side
    # derivation (so signatures verify) and lets callers pass just username +
    # cryptoId.
    normalized: JsonDict = {**request, "username": _normalize_handle(str(request["username"]))}
    crypto_id = normalized.get("cryptoId")
    if not normalized.get("publicKey") and crypto_id:
        normalized["publicKey"] = crypto_id_to_public_key_base64(str(crypto_id))
    return normalized


def _registration_signature_payload(request: JsonDict) -> str:
    # Must byte-match the backend's registrationPayload
    # (backend-tinyplace/internal/identity/auth.go): exactly these four fields,
    # no actorType/primary. Both sides serialize canonically (sorted keys, null
    # for absent values), so any extra signed field breaks verification (401).
    return canonical_payload(
        "identity.register",
        {
            "cryptoId": request.get("cryptoId"),
            "paymentMethods": request.get("paymentMethods"),
            "publicKey": request.get("publicKey"),
            "username": request.get("username"),
        },
    )
