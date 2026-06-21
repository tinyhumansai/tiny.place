from __future__ import annotations

import base64
import json

from tinyplace import (
    TinyPlaceClient,
    TinyPlaceError,
    X402_PAYMENT_HEADER,
    build_x402_payment_envelope,
    encode_x402_payment_header,
)

from .helpers import FakeResponse, FakeSession


def test_exposes_canonical_submission_header() -> None:
    assert X402_PAYMENT_HEADER == "PAYMENT-SIGNATURE"


async def test_sends_sdk_identification_header() -> None:
    session = FakeSession([FakeResponse(200, {"ok": True})])
    client = TinyPlaceClient(base_url="https://api.example.test", session=session)  # type: ignore[arg-type]

    await client.http.get("/anything")

    headers = session.requests[0]["headers"]
    assert headers["X-Tinyplace-SDK"].startswith("py/")


def test_parses_challenge_from_standard_accepts() -> None:
    body = {
        "error": "payment required",
        "x402Version": 2,
        "resource": {"url": "https://tiny.place"},
        "accepts": [
            {
                "scheme": "exact",
                "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
                "amount": "1000000",
                "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                "payTo": "treasury-address",
                "maxTimeoutSeconds": 60,
                "extra": {
                    "domain": "tiny.place",
                    "feePayer": "facilitator-address",
                    "from": "payer-address",
                    "nonce": "nonce-xyz",
                    "expiresAt": "2026-06-21T00:00:00Z",
                },
            }
        ],
        "extensions": {},
    }
    error = TinyPlaceError(402, body)
    assert error.payment_required is not None
    payment = error.payment_required.payment
    assert payment["amount"] == "1000000"
    assert payment["to"] == "treasury-address"  # payTo -> to
    # Binding fields promoted out of extra.
    assert payment["from"] == "payer-address"
    assert payment["nonce"] == "nonce-xyz"
    assert payment["expiresAt"] == "2026-06-21T00:00:00Z"
    # Remaining extra becomes metadata; binding keys are not duplicated in.
    assert payment["metadata"]["domain"] == "tiny.place"
    assert payment["metadata"]["feePayer"] == "facilitator-address"
    assert "nonce" not in payment["metadata"]
    assert "from" not in payment["metadata"]


def test_falls_back_to_legacy_payment_field() -> None:
    error = TinyPlaceError(
        402, {"error": "payment required", "payment": {"amount": "500", "to": "treasury"}}
    )
    assert error.payment_required is not None
    assert error.payment_required.payment["amount"] == "500"


def test_encodes_standard_x_payment_envelope() -> None:
    authorization = {
        "scheme": "exact",
        "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "amount": "1000000",
        "from": "payer",
        "to": "treasury",
        "nonce": "pay_test",
        "expiresAt": "2026-06-21T00:00:00Z",
        "signature": "v1:ts:nonce:sig",
        "metadata": {"domain": "tiny.place", "feePayer": "facilitator"},
    }

    envelope = build_x402_payment_envelope(authorization)
    assert envelope["x402Version"] == 2
    assert envelope["accepted"]["payTo"] == "treasury"
    assert envelope["payload"]["signature"] == "v1:ts:nonce:sig"
    assert envelope["payload"]["authorization"]["value"] == "1000000"
    assert envelope["payload"]["authorization"]["validBefore"] == "2026-06-21T00:00:00Z"

    header = encode_x402_payment_header(authorization)
    decoded = json.loads(base64.b64decode(header))
    assert decoded == envelope
