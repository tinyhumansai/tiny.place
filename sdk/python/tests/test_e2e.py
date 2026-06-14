from __future__ import annotations

import os
import secrets
import asyncio
from typing import Any

import aiohttp
import pytest

from tinyplace import LocalSigner, SOLANA_MAINNET_NETWORK, TinyPlaceClient, build_x402_payment_map
from tinyplace.api.payments import _payment_map_to_verify_request

pytestmark = pytest.mark.e2e


def e2e_enabled() -> bool:
    return os.environ.get("TINYPLACE_E2E") == "1"


pytestmark = [
    pytest.mark.e2e,
    pytest.mark.skipif(not e2e_enabled(), reason="set TINYPLACE_E2E=1 to run local backend/Solana e2e"),
]


API_URL = os.environ.get("API_URL", "http://localhost:8080")
RPC_URL = os.environ.get("SOLANA_RPC_URL", "http://localhost:8899")


async def rpc(method: str, params: list[Any]) -> Any:
    async with aiohttp.ClientSession() as session:
        async with session.post(
            RPC_URL,
            json={"jsonrpc": "2.0", "id": method, "method": method, "params": params},
        ) as response:
            payload = await response.json()
    if "error" in payload:
        raise RuntimeError(payload["error"])
    return payload["result"]


async def balance_of(address: str) -> int:
    result = await rpc("getBalance", [address, {"commitment": "confirmed"}])
    return int(result.get("value") or 0)


async def test_e2e_directory_publish_read_delete() -> None:
    signer = LocalSigner.generate()
    async with TinyPlaceClient(base_url=API_URL, signer=signer) as client:
        card = {
            "agentId": signer.agent_id,
            "cryptoId": signer.agent_id,
            "name": "pytest-e2e-agent",
            "description": "Ephemeral Python SDK e2e agent",
            "publicKey": signer.public_key_base64,
            "skills": ["pytest", "echo"],
            "tags": ["e2e", "python"],
        }

        upserted = await client.directory.upsert_agent(signer.agent_id, card)
        assert upserted["agentId"] == signer.agent_id

        fetched = await client.directory.get_agent(signer.agent_id)
        assert fetched["name"] == card["name"]

        await client.directory.delete_agent(signer.agent_id)


async def test_e2e_native_sol_payment_settle_and_reject_bogus_tx() -> None:
    seed = secrets.token_bytes(32)
    payer = LocalSigner.from_seed(seed)
    recipient = LocalSigner.generate()
    await rpc("requestAirdrop", [payer.agent_id, 1_000_000_000])
    for _ in range(30):
        if await balance_of(payer.agent_id) > 0:
            break
        await asyncio.sleep(0.5)
    assert await balance_of(payer.agent_id) > 0

    async with TinyPlaceClient(base_url=API_URL, signer=payer) as client:
        result = await client.payments.settle_with_solana_payment(
            {
                "rpcUrl": RPC_URL,
                "secretKey": seed,
                "network": SOLANA_MAINNET_NETWORK,
                "asset": "SOL",
                "amount": "2000000",
                "from": payer.agent_id,
                "to": recipient.agent_id,
                "nonce": f"pytest-pay:{secrets.token_hex(6)}",
                "commitment": "finalized",
                "confirmationPolls": 160,
            }
        )
        assert result["settlement"]["settled"] is True
        assert result["execution"]["signature"]

        bogus = await build_x402_payment_map(
            payer,
            {
                "scheme": "exact",
                "network": SOLANA_MAINNET_NETWORK,
                "asset": "SOL",
                "amount": "2000000",
                "from": payer.agent_id,
                "to": recipient.agent_id,
                "nonce": f"pytest-bogus:{secrets.token_hex(6)}",
                "onChainTx": "4" * 88,
            },
        )
        with pytest.raises(Exception):
            await client.payments.settle({"payment": _payment_map_to_verify_request(bogus)})
