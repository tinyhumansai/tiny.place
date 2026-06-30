from __future__ import annotations

import base64
import json

import pytest
from nacl.signing import VerifyKey
from solders.pubkey import Pubkey
from solders.transaction import VersionedTransaction

from tinyplace import (
    FACILITATOR_COMPUTE_UNIT_LIMIT,
    LocalSigner,
    SOLANA_MAINNET_NETWORK,
    SOLANA_USDC_MINT,
    build_delegated_x402_payment_header,
    build_payer_signed_delegated_tx,
)

# Distinct valid base58 pubkeys for the facilitator fee payer, the payee, and the
# two associated token accounts the RPC lookup returns.
_FEE_PAYER = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
_PAYEE = "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E"
_SOURCE_ATA = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
_DEST_ATA = "ComputeBudget111111111111111111111111111111"
_BLOCKHASH = "11111111111111111111111111111111"


def _rpc_request(payer: str):
    async def rpc_request(method: str, params: list) -> dict:
        if method == "getTokenAccountsByOwner":
            owner = params[0]
            pubkey = _SOURCE_ATA if owner == payer else _DEST_ATA
            return {
                "value": [
                    {
                        "pubkey": pubkey,
                        "account": {
                            "data": {"parsed": {"info": {"tokenAmount": {"amount": "5000000"}}}}
                        },
                    }
                ]
            }
        if method == "getLatestBlockhash":
            return {"value": {"blockhash": _BLOCKHASH}}
        raise AssertionError(method)

    return rpc_request


async def test_build_payer_signed_delegated_tx_fee_payer_and_authority_wiring() -> None:
    signer = LocalSigner.from_seed(bytes([40]) * 32)
    payer = signer.agent_id

    wire = await build_payer_signed_delegated_tx(
        rpc_url="https://solana.example.test",
        fee_payer=_FEE_PAYER,
        payee=_PAYEE,
        amount="1000000",
        mint=SOLANA_USDC_MINT,
        decimals=6,
        secret_key=bytes([40]) * 32,
        rpc_request=_rpc_request(payer),
    )

    tx = VersionedTransaction.from_bytes(base64.b64decode(wire))
    message = tx.message
    keys = list(message.account_keys)

    # Account 0 is the facilitator fee payer; account 1 is the agent authority.
    assert keys[0] == Pubkey.from_string(_FEE_PAYER)
    assert keys[1] == Pubkey.from_string(payer)

    signatures = tx.signatures
    assert len(signatures) == 2
    # The fee-payer slot is left zeroed for the facilitator to co-sign at settle.
    assert all(byte == 0 for byte in bytes(signatures[0]))
    # The agent signs as the transfer authority (signer index 1).
    assert any(byte != 0 for byte in bytes(signatures[1]))
    VerifyKey(signer.public_key).verify(bytes(message), bytes(signatures[1]))

    # [SetComputeUnitLimit, SetComputeUnitPrice, TransferChecked].
    assert len(message.instructions) == 3
    limit_ix = message.instructions[0]
    assert limit_ix.data[0] == 2  # SetComputeUnitLimit discriminant
    assert int.from_bytes(limit_ix.data[1:5], "little") == FACILITATOR_COMPUTE_UNIT_LIMIT
    assert message.instructions[1].data[0] == 3  # SetComputeUnitPrice
    transfer_ix = message.instructions[2]
    assert transfer_ix.data[0] == 12  # TransferChecked discriminant
    assert int.from_bytes(transfer_ix.data[1:9], "little") == 1000000


async def test_build_delegated_x402_payment_header_emits_standard_envelope() -> None:
    signer = LocalSigner.from_seed(bytes([41]) * 32)
    payer = signer.agent_id

    header = await build_delegated_x402_payment_header(
        rpc_url="https://solana.example.test",
        fee_payer=_FEE_PAYER,
        payment={
            "network": SOLANA_MAINNET_NETWORK,
            # The challenge may still name the asset by symbol; the envelope must
            # echo the on-chain SPL mint that the tx was built against.
            "asset": "USDC",
            "amount": "1000000",
            "to": _PAYEE,
        },
        mint=SOLANA_USDC_MINT,
        decimals=6,
        secret_key=bytes([41]) * 32,
        rpc_request=_rpc_request(payer),
    )

    # The PAYMENT-SIGNATURE header is standard padded base64 of the UTF-8 JSON of
    # the canonical x402 v2 PaymentPayload envelope.
    envelope = json.loads(base64.b64decode(header))
    assert envelope["x402Version"] == 2

    accepted = envelope["accepted"]
    assert accepted["scheme"] == "exact"
    assert accepted["network"] == SOLANA_MAINNET_NETWORK
    assert accepted["amount"] == "1000000"
    # ``asset`` is the on-chain SPL mint (base58), not the "USDC" symbol.
    assert accepted["asset"] == SOLANA_USDC_MINT
    assert accepted["payTo"] == _PAYEE
    assert accepted["maxTimeoutSeconds"] == 60
    assert accepted["extra"]["feePayer"] == _FEE_PAYER

    # No proprietary metadata.delegatedTx and no body payment map — the proof is
    # only the standard payload.transaction.
    assert "metadata.delegatedTx" not in header
    assert "metadata.delegatedTx" not in json.dumps(envelope)
    assert "payment" not in envelope

    # payload.transaction is the non-empty partially-signed two-signature legacy
    # tx: facilitator fee-payer slot zeroed (account 0), agent authority filled.
    wire = envelope["payload"]["transaction"]
    assert wire
    tx = VersionedTransaction.from_bytes(base64.b64decode(wire))
    keys = list(tx.message.account_keys)
    assert keys[0] == Pubkey.from_string(_FEE_PAYER)
    assert keys[1] == Pubkey.from_string(payer)
    signatures = tx.signatures
    assert len(signatures) == 2
    assert all(byte == 0 for byte in bytes(signatures[0]))
    assert any(byte != 0 for byte in bytes(signatures[1]))


async def test_build_payer_signed_delegated_tx_rejects_bad_amount() -> None:
    with pytest.raises(ValueError, match="positive integer"):
        await build_payer_signed_delegated_tx(
            rpc_url="x",
            fee_payer=_FEE_PAYER,
            payee=_PAYEE,
            amount="0",
            mint=SOLANA_USDC_MINT,
            decimals=6,
            secret_key=bytes([42]) * 32,
            rpc_request=_rpc_request("x"),
        )
