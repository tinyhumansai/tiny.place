from __future__ import annotations

import asyncio
import base64
from typing import Any, Awaitable, Callable

import aiohttp
from solders.hash import Hash
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from solders.transaction import Transaction

from .crypto import decode_base58
from .signer import Signer
from .x402 import build_x402_payment_map

SOLANA_MAINNET_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
SOLANA_NATIVE_ASSET = "SOL"

RpcRequest = Callable[[str, list[Any]], Awaitable[Any]]


async def execute_solana_payment(
    *,
    rpc_url: str,
    secret_key: str | bytes,
    payment: dict[str, Any],
    network: str | None = None,
    native_asset: str = SOLANA_NATIVE_ASSET,
    commitment: str = "confirmed",
    confirmation_polls: int = 20,
    rpc_request: RpcRequest | None = None,
) -> dict[str, str]:
    if network is not None and payment["network"] != network:
        raise ValueError(f"Unexpected Solana network: {payment['network']} (expected {network})")
    if network is None and not str(payment["network"]).startswith("solana:"):
        raise ValueError(f"Unsupported Solana network: {payment['network']}")
    if str(payment["asset"]).upper() != native_asset.upper():
        raise ValueError(
            f'Unsupported Solana asset: {payment["asset"]} '
            f'(Python SDK supports native "{native_asset}" transfers)'
        )

    keypair = _keypair_from_secret(secret_key)
    payer = str(keypair.pubkey())
    amount = str(payment["amount"])
    request = rpc_request or _aiohttp_rpc_request(rpc_url)
    latest = await request("getLatestBlockhash", [{"commitment": commitment}])
    blockhash = latest["value"]["blockhash"]
    tx = _native_transfer_transaction(
        keypair=keypair,
        to=str(payment["to"]),
        amount=int(amount),
        blockhash=blockhash,
    )
    signature = await request(
        "sendTransaction",
        [
            base64.b64encode(bytes(tx)).decode("ascii"),
            {
                "encoding": "base64",
                "preflightCommitment": "processed" if commitment == "processed" else "confirmed",
            },
        ],
    )
    await _confirm_signature(request, str(signature), commitment, confirmation_polls)
    return {
        "signature": str(signature),
        "from": payer,
        "to": str(payment["to"]),
        "mint": native_asset,
        "amount": amount,
        "sourceTokenAccount": payer,
        "destinationTokenAccount": str(payment["to"]),
    }


async def execute_solana_x402_payment(
    *,
    signer: Signer,
    rpc_url: str,
    secret_key: str | bytes,
    payment: dict[str, Any],
    commitment: str = "confirmed",
    confirmation_polls: int = 20,
    rpc_request: RpcRequest | None = None,
) -> dict[str, Any]:
    execution = await execute_solana_payment(
        rpc_url=rpc_url,
        secret_key=secret_key,
        payment=payment,
        commitment=commitment,
        confirmation_polls=confirmation_polls,
        rpc_request=rpc_request,
    )
    payment_map = await build_x402_payment_map(
        signer,
        {
            **payment,
            "onChainTx": execution["signature"],
            "tx": execution["signature"],
            "transaction": execution["signature"],
        },
    )
    return {**execution, "payment": payment_map}


def _native_transfer_transaction(
    *,
    keypair: Keypair,
    to: str,
    amount: int,
    blockhash: str,
) -> Transaction:
    instruction = transfer(
        TransferParams(
            from_pubkey=keypair.pubkey(),
            to_pubkey=Pubkey.from_string(to),
            lamports=amount,
        )
    )
    recent_blockhash = Hash.from_string(blockhash)
    message = Message.new_with_blockhash([instruction], keypair.pubkey(), recent_blockhash)
    return Transaction([keypair], message, recent_blockhash)


async def _confirm_signature(
    rpc_request: RpcRequest,
    signature: str,
    commitment: str,
    polls: int,
) -> None:
    for _ in range(polls):
        result = await rpc_request(
            "getSignatureStatuses",
            [[signature], {"searchTransactionHistory": True}],
        )
        status = (result.get("value") or [None])[0]
        if status and status.get("err") is not None:
            raise RuntimeError(f"Solana transaction failed: {status['err']}")
        if status and _commitment_satisfied(str(status.get("confirmationStatus") or ""), commitment):
            return
        await asyncio.sleep(0.5)
    raise TimeoutError(f"Timed out waiting for Solana transaction {signature}")


def _commitment_satisfied(actual: str, expected: str) -> bool:
    ranks = {"processed": 0, "confirmed": 1, "finalized": 2}
    return ranks.get(actual, -1) >= ranks.get(expected, 1)


def _keypair_from_secret(secret_key: str | bytes) -> Keypair:
    secret = decode_base58(secret_key) if isinstance(secret_key, str) else secret_key
    if len(secret) == 32:
        return Keypair.from_seed(secret)
    if len(secret) == 64:
        return Keypair.from_bytes(secret)
    raise ValueError(f"Solana secret key must be 32 or 64 bytes, got {len(secret)}")


def _aiohttp_rpc_request(rpc_url: str) -> RpcRequest:
    async def request(method: str, params: list[Any]) -> Any:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                rpc_url,
                json={"jsonrpc": "2.0", "id": method, "method": method, "params": params},
            ) as response:
                payload = await response.json()
        if "error" in payload:
            raise RuntimeError(payload["error"].get("message", payload["error"]))
        return payload.get("result")

    return request
