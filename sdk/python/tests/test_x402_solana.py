from __future__ import annotations

import base64

import pytest
from nacl.signing import VerifyKey

from tinyplace import (
    LocalSigner,
    SOLANA_MAINNET_NETWORK,
    build_canonical_message,
    build_x402_payment_map,
    execute_solana_payment,
    execute_solana_x402_payment,
)


async def test_x402_payment_map_flattens_metadata_and_references() -> None:
    signer = LocalSigner.from_seed(bytes([31]) * 32)
    payment = await build_x402_payment_map(
        signer,
        {
            "network": SOLANA_MAINNET_NETWORK,
            "asset": "SOL",
            "amount": "1",
            "to": signer.agent_id,
            "nonce": "nonce",
            "expiresAt": "2026-06-13T00:00:00Z",
            "metadata": {"purpose": "test"},
            "onChainTx": "tx",
        },
    )

    assert payment["from"] == signer.agent_id
    assert payment["metadata.domain"] == "tiny.place"
    assert payment["metadata.publicKey"] == signer.public_key_base64
    assert payment["metadata.purpose"] == "test"
    assert payment["metadata.onChainTx"] == "tx"
    assert payment["onChainTx"] == "tx"
    message = build_canonical_message(
        {
            "scheme": payment["scheme"],
            "network": payment["network"],
            "asset": payment["asset"],
            "amount": payment["amount"],
            "from": payment["from"],
            "to": payment["to"],
            "nonce": payment["nonce"],
            "expiresAt": payment["expiresAt"],
            "metadata": {
                "domain": "tiny.place",
                "onChainTx": "tx",
                "publicKey": signer.public_key_base64,
                "purpose": "test",
            },
        }
    )
    VerifyKey(signer.public_key).verify(message.encode(), base64.b64decode(payment["signature"]))


async def test_execute_solana_payment_native_sol_rpc_order() -> None:
    signer = LocalSigner.from_seed(bytes([32]) * 32)
    calls: list[str] = []

    async def rpc_request(method: str, params: list) -> dict | str:
        calls.append(method)
        if method == "getLatestBlockhash":
            return {"value": {"blockhash": "11111111111111111111111111111111"}}
        if method == "sendTransaction":
            assert isinstance(params[0], str)
            return "sig"
        if method == "getSignatureStatuses":
            return {"value": [{"confirmationStatus": "finalized", "err": None}]}
        raise AssertionError(method)

    result = await execute_solana_payment(
        rpc_url="https://solana.example.test",
        secret_key=bytes([32]) * 32,
        payment={
            "network": "solana:LOCALNET1111111111111111111111111111111",
            "asset": "SOL",
            "amount": "500",
            "to": signer.agent_id,
        },
        commitment="confirmed",
        rpc_request=rpc_request,
    )

    assert result["signature"] == "sig"
    assert result["from"] == LocalSigner.from_seed(bytes([32]) * 32).agent_id
    assert calls == ["getLatestBlockhash", "sendTransaction", "getSignatureStatuses"]


async def test_execute_solana_x402_payment_adds_transaction_references() -> None:
    signer = LocalSigner.from_seed(bytes([33]) * 32)

    async def rpc_request(method: str, _params: list) -> dict | str:
        if method == "getLatestBlockhash":
            return {"value": {"blockhash": "11111111111111111111111111111111"}}
        if method == "sendTransaction":
            return "sig"
        if method == "getSignatureStatuses":
            return {"value": [{"confirmationStatus": "confirmed", "err": None}]}
        raise AssertionError(method)

    result = await execute_solana_x402_payment(
        signer=signer,
        rpc_url="https://solana.example.test",
        secret_key=bytes([33]) * 32,
        payment={
            "network": SOLANA_MAINNET_NETWORK,
            "asset": "SOL",
            "amount": "1",
            "to": signer.agent_id,
            "nonce": "nonce",
            "expiresAt": "2026-06-13T00:00:00Z",
        },
        rpc_request=rpc_request,
    )

    assert result["payment"]["onChainTx"] == "sig"
    assert result["payment"]["metadata.transaction"] == "sig"
    assert result["payment"]["tx"] == "sig"


async def test_execute_solana_payment_rejects_bad_inputs() -> None:
    with pytest.raises(ValueError, match="Unsupported Solana network"):
        await execute_solana_payment(
            rpc_url="x",
            secret_key=b"0" * 32,
            payment={"network": "base", "asset": "SOL", "amount": "1", "to": "x"},
        )
    with pytest.raises(ValueError, match="Unsupported Solana asset"):
        await execute_solana_payment(
            rpc_url="x",
            secret_key=b"0" * 32,
            payment={"network": SOLANA_MAINNET_NETWORK, "asset": "USDC", "amount": "1", "to": "x"},
        )
    with pytest.raises(ValueError, match="32 or 64 bytes"):
        await execute_solana_payment(
            rpc_url="x",
            secret_key=b"bad",
            payment={"network": SOLANA_MAINNET_NETWORK, "asset": "SOL", "amount": "1", "to": "x"},
        )
