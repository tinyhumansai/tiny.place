from __future__ import annotations

import asyncio

from ..http import HttpClient, encode
from ..signer import Signer
from ..solana import execute_solana_x402_payment
from ..types import Json, JsonDict, Query

DEFAULT_VERIFY_ATTEMPTS = 10
DEFAULT_VERIFY_INTERVAL_MS = 2000
DEFAULT_RETRY_ERRORS = ["transaction not found", "insufficient confirmations"]


class PaymentsApi:
    def __init__(self, http: HttpClient, signer: Signer | None = None) -> None:
        self._http = http
        self._signer = signer

    async def verify(self, request: JsonDict) -> Json:
        return await self._http.post("/payments/verify", {"payment": request})

    async def verify_until_valid(self, request: JsonDict, options: JsonDict | None = None) -> Json:
        options = options or {}
        attempts = int(options.get("attempts", DEFAULT_VERIFY_ATTEMPTS))
        interval_ms = int(options.get("intervalMs", DEFAULT_VERIFY_INTERVAL_MS))
        retry_errors = options.get("retryErrors", DEFAULT_RETRY_ERRORS)
        response = await self.verify(request)
        for _ in range(1, attempts):
            if not _should_retry_verify(response, retry_errors):
                return response
            if interval_ms > 0:
                await asyncio.sleep(interval_ms / 1000)
            response = await self.verify(request)
        return response

    async def settle(self, request: JsonDict) -> Json:
        return await self._http.post(
            "/payments/settle",
            {
                "payment": request.get("payment"),
                "settledAmount": request.get("settledAmount"),
                "feeQuoteId": request.get("feeQuoteId"),
                "reference": request.get("reference"),
                "shielded": request.get("shielded"),
                "delegatedTx": request.get("delegatedTx"),
            },
        )

    async def settle_with_solana_payment(self, options: JsonDict) -> JsonDict:
        if not self._signer:
            raise ValueError("settle_with_solana_payment requires a signer")
        execution = await execute_solana_x402_payment(
            signer=self._signer,
            rpc_url=str(options["rpcUrl"]),
            secret_key=options["secretKey"],
            payment={
                "scheme": options.get("scheme", "exact"),
                "network": options["network"],
                "asset": options["asset"],
                "amount": options["amount"],
                "from": options.get("from"),
                "to": options["to"],
                "nonce": options.get("nonce"),
                "expiresAt": options.get("expiresAt"),
                "expiresInMs": options.get("expiresInMs"),
                "metadata": options.get("metadata"),
            },
            commitment=options.get("commitment", "confirmed"),
            confirmation_polls=int(options.get("confirmationPolls", 20)),
            rpc_request=options.get("rpcRequest"),
        )
        settlement = await self.settle(
            {
                "payment": _payment_map_to_verify_request(execution["payment"]),
                "settledAmount": options.get("settledAmount"),
                "feeQuoteId": options.get("feeQuoteId"),
                "reference": options.get("reference"),
                "shielded": options.get("shielded"),
            }
        )
        return {"execution": execution, "settlement": settlement}

    async def facilitator(self) -> Json:
        return await self._http.get("/payments/facilitator")

    async def supported(self) -> JsonDict:
        return await self._http.get("/payments/supported")

    async def create_subscription(self, subscription: JsonDict) -> Json:
        return await self._http.post("/payments/subscriptions", subscription)

    async def get_subscription(self, subscription_id: str, actor: str | None = None) -> Json:
        path = f"/payments/subscriptions/{encode(subscription_id)}"
        if actor:
            return await self._http.get_directory_auth_as(path, actor)
        return await self._http.get_agent_auth(path)

    async def cancel_subscription(self, subscription_id: str, actor: str | None = None) -> None:
        path = f"/payments/subscriptions/{encode(subscription_id)}"
        if actor:
            await self._http.delete_directory_auth_as(path, actor)
            return
        await self._http.delete_agent_auth(path)

    async def renew_subscription(self, subscription_id: str, request: JsonDict) -> Json:
        return await self._http.post(
            f"/payments/subscriptions/{encode(subscription_id)}/renew",
            request,
        )

    async def renew_due_subscriptions(self, params: Query = None) -> Json:
        return await self._http.post_admin("/payments/subscriptions/renew-due", params)

    async def flush_batch(self, batch_id: str, request: JsonDict) -> Json:
        return await self._http.post_admin(f"/payments/batches/{encode(batch_id)}/flush", request)


def _should_retry_verify(response: Json, retry_errors: list[str]) -> bool:
    if not isinstance(response, dict) or response.get("valid") or response.get("error") is None:
        return False
    error = str(response["error"]).lower()
    return any(retry_error.lower() in error for retry_error in retry_errors)


def _payment_map_to_verify_request(payment: dict[str, str]) -> dict[str, Json]:
    metadata = {
        key.removeprefix("metadata."): value
        for key, value in payment.items()
        if key.startswith("metadata.")
    }
    request: dict[str, Json] = {
        "scheme": payment.get("scheme", ""),
        "network": payment.get("network", ""),
        "asset": payment.get("asset", ""),
        "amount": payment.get("amount", ""),
        "from": payment.get("from", ""),
        "to": payment.get("to", ""),
        "nonce": payment.get("nonce", ""),
        "expiresAt": payment.get("expiresAt", ""),
        "signature": payment.get("signature", ""),
    }
    if metadata:
        request["metadata"] = metadata
    return request
