from __future__ import annotations

import json

import pytest

from tinyplace import LocalSigner, SOLANA_MAINNET_NETWORK, TinyPlaceClient

from .helpers import FakeResponse, FakeSession


PAYMENT = {
    "scheme": "exact",
    "network": SOLANA_MAINNET_NETWORK,
    "asset": "SOL",
    "amount": "100",
    "from": "payer",
    "to": "recipient",
    "nonce": "nonce",
    "expiresAt": "2026-06-13T00:00:00Z",
    "signature": "sig",
}


async def test_verify_until_valid_retries_only_confirmation_errors() -> None:
    session = FakeSession(
        [
            FakeResponse(200, {"valid": False, "error": "transaction not found"}),
            FakeResponse(200, {"valid": False, "error": "insufficient confirmations"}),
            FakeResponse(200, {"valid": True, "verifiedId": "tx"}),
            FakeResponse(200, {"valid": False, "error": "signature mismatch"}),
        ]
    )
    client = TinyPlaceClient(base_url="https://api.example.test", session=session)  # type: ignore[arg-type]

    assert await client.payments.verify_until_valid(PAYMENT, {"intervalMs": 0}) == {
        "valid": True,
        "verifiedId": "tx",
    }
    assert await client.payments.verify_until_valid(PAYMENT, {"intervalMs": 0}) == {
        "valid": False,
        "error": "signature mismatch",
    }
    assert len(session.requests) == 4


async def test_payment_routes_and_settle_body() -> None:
    signer = LocalSigner.from_seed(bytes([24]) * 32)
    session = FakeSession([FakeResponse(200, {"ok": True}) for _ in range(8)])
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    await client.payments.settle(
        {
            "payment": PAYMENT,
            "settledAmount": "90",
            "feeQuoteId": "fee",
            "reference": {"kind": "test"},
            "shielded": True,
            "delegatedTx": "tx",
        }
    )
    await client.payments.facilitator()
    await client.payments.supported()
    await client.payments.create_subscription({"id": "sub"})
    await client.payments.get_subscription("sub", actor="@agent")
    await client.payments.cancel_subscription("sub")
    await client.payments.renew_subscription("sub", {"agentId": "@agent"})
    await client.payments.flush_batch("batch", {"actor": "admin"})

    settle_body = json.loads(session.requests[0]["data"])
    assert settle_body["settledAmount"] == "90"
    assert settle_body["delegatedTx"] == "tx"
    assert session.requests[4]["headers"]["X-Agent-ID"] == "@agent"
    assert session.requests[5]["method"] == "DELETE"
    assert session.requests[7]["url"].endswith("/payments/batches/batch/flush")


async def test_settle_with_solana_payment_posts_execution_payment_map() -> None:
    signer = LocalSigner.from_seed(bytes([25]) * 32)
    signature = "5q22im1eoEeoJMhsshDkoh4tNV1WPUfyaJXHwyGqcpfmtpY1ZCC665nc5chyEwwau4JoR7BUnCbxWn5BW5WzR3NC"
    rpc_calls: list[str] = []

    async def rpc_request(method: str, params: list) -> dict | str:
        rpc_calls.append(method)
        if method == "getLatestBlockhash":
            return {"value": {"blockhash": "11111111111111111111111111111111"}}
        if method == "sendTransaction":
            assert params[1]["encoding"] == "base64"
            return signature
        if method == "getSignatureStatuses":
            return {"value": [{"confirmationStatus": "confirmed", "err": None}]}
        raise AssertionError(method)

    session = FakeSession([FakeResponse(200, {"settled": True, "ledgerTxId": "ledger"})])
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    result = await client.payments.settle_with_solana_payment(
        {
            "rpcUrl": "https://solana.example.test",
            "secretKey": bytes([25]) * 32,
            "network": SOLANA_MAINNET_NETWORK,
            "asset": "SOL",
            "amount": "100",
            "to": signer.agent_id,
            "nonce": "pay-nonce",
            "expiresAt": "2026-06-13T00:00:00Z",
            "rpcRequest": rpc_request,
        }
    )

    assert rpc_calls == ["getLatestBlockhash", "sendTransaction", "getSignatureStatuses"]
    assert result["settlement"]["ledgerTxId"] == "ledger"
    body = json.loads(session.requests[0]["data"])
    assert body["payment"]["metadata"]["onChainTx"] == signature
    assert "metadata.onChainTx" not in body["payment"]


async def test_settle_with_solana_payment_requires_signer() -> None:
    client = TinyPlaceClient(base_url="https://api.example.test")
    with pytest.raises(ValueError, match="requires a signer"):
        await client.payments.settle_with_solana_payment({})
