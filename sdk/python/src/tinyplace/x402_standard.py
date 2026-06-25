"""Standard x402 v2 HTTP transport: wire types + base64 header codec.

This mirrors the flagship TS SDK's ``x402-standard.ts``. It implements the
canonical x402-foundation inline payment flow (transports-v2/http):

* a client requests a resource; the server answers 402 with a base64
  ``PAYMENT-REQUIRED`` header (a :class:`PaymentRequired`);
* the client retries the SAME request with a base64 ``PAYMENT-SIGNATURE``
  header (a :class:`PaymentPayload`);
* the server verifies + settles inline and returns 200 with a base64
  ``PAYMENT-RESPONSE`` header (a :class:`SettlementResponse`).

For the Solana ``exact`` scheme the payload carries a partially-signed
``TransferChecked`` transaction (built by
:func:`tinyplace.solana.build_exact_svm_transfer_transaction`) under
``payload.transaction``.
"""

from __future__ import annotations

import base64
import json
from typing import Any, Awaitable, Callable

from .solana import (
    RpcRequest,
    build_exact_svm_transfer_transaction,
    get_recent_blockhash,
    resolve_solana_asset,
)

#: The standard x402 protocol version this transport speaks.
X402_VERSION = 2

#: Canonical HTTP header names for the standard x402 v2 transport.
X402_HEADER_PAYMENT_REQUIRED = "PAYMENT-REQUIRED"
X402_HEADER_PAYMENT_SIGNATURE = "PAYMENT-SIGNATURE"
X402_HEADER_PAYMENT_RESPONSE = "PAYMENT-RESPONSE"


def encode_x402_header(value: Any) -> str:
    """Encode ``value`` as a base64 (standard) JSON header."""
    raw = json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return base64.b64encode(raw).decode("ascii")


def _decode_x402_header(value: str | None) -> Any:
    """Decode a base64 JSON header to a value, or ``None`` when malformed.

    Tolerates base64url (and missing padding) as well as standard base64.
    """
    if not value:
        return None
    normalized = value.strip().replace("-", "+").replace("_", "/")
    padded = normalized + "=" * (-len(normalized) % 4)
    try:
        return json.loads(base64.b64decode(padded))
    except (ValueError, json.JSONDecodeError):
        return None


def decode_payment_required(value: str | None) -> dict[str, Any] | None:
    """Decode the ``PAYMENT-REQUIRED`` challenge header.

    Returns the decoded challenge dict, or ``None`` when malformed or missing the
    ``accepts`` array.
    """
    decoded = _decode_x402_header(value)
    if not isinstance(decoded, dict) or not isinstance(decoded.get("accepts"), list):
        return None
    return decoded


def decode_settlement_response(value: str | None) -> dict[str, Any] | None:
    """Decode the ``PAYMENT-RESPONSE`` settlement header."""
    decoded = _decode_x402_header(value)
    return decoded if isinstance(decoded, dict) else None


def encode_payment_signature(payload: dict[str, Any]) -> str:
    """Encode a :class:`PaymentPayload` for the ``PAYMENT-SIGNATURE`` header."""
    return encode_x402_header(payload)


def select_exact_svm_requirement(challenge: dict[str, Any]) -> dict[str, Any] | None:
    """Select the Solana ``exact`` requirement from a challenge's ``accepts[]``.

    Returns the first ``exact`` requirement whose network is a ``solana:*`` chain,
    or ``None`` when none is offered.
    """
    for entry in challenge.get("accepts") or []:
        if (
            isinstance(entry, dict)
            and entry.get("scheme") == "exact"
            and isinstance(entry.get("network"), str)
            and entry["network"].startswith("solana:")
        ):
            return entry
    return None


async def build_exact_svm_payment_payload(
    *,
    challenge: dict[str, Any],
    secret_key: str | bytes,
    rpc_url: str,
    decimals: int | None = None,
    rpc_request: RpcRequest | None = None,
) -> dict[str, Any]:
    """Build the standard ``PaymentPayload`` for the Solana ``exact`` requirement.

    Fetches a recent blockhash, constructs the partially-signed
    ``TransferChecked`` transaction (fee payer = ``extra.feePayer``, destination =
    ATA(payTo, asset), Memo = ``extra.memo`` or a random nonce), and wraps it in
    the v2 envelope (``{ x402Version, accepted, payload: { transaction } }``).
    Mirrors the TS ``buildExactSvmPaymentPayload``.
    """
    accepted = select_exact_svm_requirement(challenge)
    if accepted is None:
        raise ValueError("x402 challenge offers no Solana exact-scheme payment method")

    extra = accepted.get("extra") if isinstance(accepted.get("extra"), dict) else {}
    fee_payer = extra.get("feePayer") if isinstance(extra.get("feePayer"), str) else None
    if not fee_payer:
        raise ValueError("x402 exact-SVM challenge is missing extra.feePayer")
    memo = extra.get("memo") if isinstance(extra.get("memo"), str) else None

    resolved = resolve_solana_asset(accepted.get("asset"))
    resolved_decimals = decimals if decimals is not None else (resolved[1] if resolved else 6)

    recent_blockhash = await get_recent_blockhash(rpc_url, rpc_request=rpc_request)
    built = build_exact_svm_transfer_transaction(
        secret_key=secret_key,
        fee_payer=fee_payer,
        pay_to=str(accepted["payTo"]),
        mint=str(accepted["asset"]),
        amount=str(accepted["amount"]),
        decimals=resolved_decimals,
        recent_blockhash=recent_blockhash,
        memo=memo,
    )

    payload: dict[str, Any] = {
        "x402Version": X402_VERSION,
        "accepted": accepted,
        "payload": {"transaction": built["transaction"]},
    }
    if challenge.get("resource") is not None:
        payload["resource"] = challenge["resource"]
    return payload


#: Type of the optional callback invoked with each decoded ``PAYMENT-RESPONSE``.
OnSettled = Callable[[dict[str, Any]], Any]
SettlementHook = Callable[[dict[str, Any]], Awaitable[Any] | Any]
