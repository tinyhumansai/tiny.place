"""Tests for the standard x402 v2 HTTP transport + exact-SVM partial tx.

Mirrors the flagship TS SDK's behaviour (``x402-standard.ts`` + ``solana.ts``).
"""

from __future__ import annotations

import base64
import json

import pytest

from tinyplace import (
    SOLANA_COMPUTE_BUDGET_PROGRAM_ID,
    SOLANA_MEMO_PROGRAM_ID,
    SOLANA_TOKEN_PROGRAM_ID,
    SOLANA_USDC_MINT,
    LocalSigner,
    X402PayerConfig,
    build_exact_svm_payment_payload,
    build_exact_svm_transfer_transaction,
    decode_payment_required,
    derive_associated_token_address,
    encode_x402_header,
    select_exact_svm_requirement,
)
from tinyplace.crypto import decode_base58, public_key_to_solana_address
from tinyplace.http import HttpClient, TinyPlaceError

# A throwaway payer (32-byte seed). Its public key is the authority/source owner.
PAYER_SEED = bytes(range(1, 33))
PAYER = LocalSigner.from_seed(PAYER_SEED)
# A distinct fee payer + recipient (valid base58 pubkeys, not the payer).
FEE_PAYER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
PAY_TO = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
BLOCKHASH = "11111111111111111111111111111111"


def test_derive_associated_token_address_matches_go_oracle() -> None:
    # Oracle vector generated with the exact Go library the backend facilitator
    # uses. The Python derivation MUST agree byte-for-byte.
    ata = derive_associated_token_address(
        "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", SOLANA_USDC_MINT
    )
    assert ata == "FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B"


def _shortvec_take(buf: bytes, offset: int) -> tuple[int, int]:
    """Read a compact-u16 at ``offset``; return (value, new_offset)."""
    value = 0
    shift = 0
    while True:
        byte = buf[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if byte & 0x80 == 0:
            break
        shift += 7
    return value, offset


def test_build_exact_svm_transfer_transaction_structure() -> None:
    built = build_exact_svm_transfer_transaction(
        secret_key=PAYER_SEED,
        fee_payer=FEE_PAYER,
        pay_to=PAY_TO,
        mint=SOLANA_USDC_MINT,
        amount="1000000",
        decimals=6,
        recent_blockhash=BLOCKHASH,
        memo="invoice-1",
    )

    # The derived ATAs are what the facilitator verifies.
    assert built["from"] == PAYER.agent_id
    assert built["sourceTokenAccount"] == derive_associated_token_address(
        PAYER.agent_id, SOLANA_USDC_MINT
    )
    assert built["destinationTokenAccount"] == derive_associated_token_address(
        PAY_TO, SOLANA_USDC_MINT
    )
    assert built["memo"] == "invoice-1"

    raw = base64.b64decode(built["transaction"])
    offset = 0
    sig_count, offset = _shortvec_take(raw, offset)
    assert sig_count == 2
    fee_payer_sig = raw[offset : offset + 64]
    authority_sig = raw[offset + 64 : offset + 128]
    # signatures[0] (fee payer slot) is all-zero; authority slot is signed.
    assert fee_payer_sig == bytes(64)
    assert authority_sig != bytes(64)
    offset += 128
    message_start = offset

    # Message header: [numRequiredSignatures=2, numReadonlySigned=1,
    # numReadonlyUnsigned=4].
    assert raw[offset : offset + 3] == bytes([2, 1, 4])
    offset += 3

    account_count, offset = _shortvec_take(raw, offset)
    assert account_count == 8
    accounts = []
    for _ in range(8):
        accounts.append(public_key_to_solana_address(raw[offset : offset + 32]))
        offset += 32
    assert accounts == [
        FEE_PAYER,
        PAYER.agent_id,
        built["sourceTokenAccount"],
        built["destinationTokenAccount"],
        SOLANA_USDC_MINT,
        SOLANA_TOKEN_PROGRAM_ID,
        SOLANA_COMPUTE_BUDGET_PROGRAM_ID,
        SOLANA_MEMO_PROGRAM_ID,
    ]

    # recent blockhash (32 bytes)
    assert raw[offset : offset + 32] == decode_base58(BLOCKHASH)
    offset += 32

    instruction_count, offset = _shortvec_take(raw, offset)
    assert instruction_count == 4

    # The authority signature must verify against the serialized message body.
    from nacl.signing import VerifyKey

    VerifyKey(PAYER.public_key).verify(raw[message_start:], authority_sig)


def test_build_exact_svm_transfer_rejects_self_fee_payer() -> None:
    with pytest.raises(ValueError, match="fee payer must differ"):
        build_exact_svm_transfer_transaction(
            secret_key=PAYER_SEED,
            fee_payer=PAYER.agent_id,
            pay_to=PAY_TO,
            mint=SOLANA_USDC_MINT,
            amount="1",
            decimals=6,
            recent_blockhash=BLOCKHASH,
        )


def _challenge() -> dict:
    return {
        "x402Version": 2,
        "error": "payment required",
        "resource": {"url": "https://x402.tiny.place/resource"},
        "accepts": [
            {
                "scheme": "exact",
                "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
                "amount": "1000000",
                "asset": SOLANA_USDC_MINT,
                "payTo": PAY_TO,
                "maxTimeoutSeconds": 60,
                "extra": {"feePayer": FEE_PAYER, "memo": "challenge-memo"},
            }
        ],
    }


def test_select_and_decode_payment_required() -> None:
    encoded = encode_x402_header(_challenge())
    decoded = decode_payment_required(encoded)
    assert decoded is not None
    requirement = select_exact_svm_requirement(decoded)
    assert requirement is not None
    assert requirement["asset"] == SOLANA_USDC_MINT
    # base64url with stripped padding must also decode.
    url_safe = base64.urlsafe_b64encode(
        json.dumps(_challenge()).encode()
    ).decode().rstrip("=")
    assert decode_payment_required(url_safe) is not None


async def test_build_exact_svm_payment_payload_envelope() -> None:
    async def rpc_request(method: str, _params: list) -> dict:
        assert method == "getLatestBlockhash"
        return {"value": {"blockhash": BLOCKHASH}}

    payload = await build_exact_svm_payment_payload(
        challenge=_challenge(),
        secret_key=PAYER_SEED,
        rpc_url="https://rpc.example.test",
        rpc_request=rpc_request,
    )
    assert payload["x402Version"] == 2
    assert payload["accepted"]["asset"] == SOLANA_USDC_MINT
    assert isinstance(payload["payload"]["transaction"], str)
    assert payload["resource"] == {"url": "https://x402.tiny.place/resource"}


class _FakeResponse:
    def __init__(self, status: int, *, headers: dict, text: str) -> None:
        self.status = status
        self.headers = headers
        self._text = text

    async def text(self) -> str:
        return self._text


class _FakeSession:
    """Minimal aiohttp-session stand-in: 402 then 200, capturing the retry headers."""

    def __init__(self, challenge_header: str, settlement_header: str) -> None:
        self._challenge_header = challenge_header
        self._settlement_header = settlement_header
        self.requests: list[dict] = []

    async def request(self, method: str, url: str, *, headers: dict, **_kwargs):
        self.requests.append({"method": method, "url": url, "headers": dict(headers)})
        if len(self.requests) == 1:
            return _FakeResponse(
                402,
                headers={"PAYMENT-REQUIRED": self._challenge_header},
                text=json.dumps({"error": "payment required"}),
            )
        return _FakeResponse(
            200,
            headers={"PAYMENT-RESPONSE": self._settlement_header},
            text=json.dumps({"ok": True}),
        )


async def test_http_client_auto_pays_402_and_surfaces_settlement() -> None:
    challenge_header = encode_x402_header(_challenge())
    settlement = {
        "success": True,
        "transaction": "settled-sig",
        "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        "payer": PAYER.agent_id,
    }
    settlement_header = encode_x402_header(settlement)
    session = _FakeSession(challenge_header, settlement_header)

    async def rpc_request(method: str, _params: list) -> dict:
        return {"value": {"blockhash": BLOCKHASH}}

    settled: list[dict] = []
    client = HttpClient(
        base_url="https://api.example.test",
        session=session,
        x402_payer=X402PayerConfig(
            secret_key=PAYER_SEED,
            rpc_url="https://rpc.example.test",
            rpc_request=rpc_request,
            on_settled=settled.append,
        ),
    )

    result = await client.get("/paid")
    assert result == {"ok": True}
    # Exactly two HTTP attempts: the 402 then the paid retry.
    assert len(session.requests) == 2
    # The retry carried a base64 PAYMENT-SIGNATURE envelope wrapping a tx.
    retry_header = session.requests[1]["headers"]["PAYMENT-SIGNATURE"]
    envelope = json.loads(base64.b64decode(retry_header))
    assert envelope["x402Version"] == 2
    assert envelope["accepted"]["payTo"] == PAY_TO
    assert isinstance(envelope["payload"]["transaction"], str)
    # onSettled fired with the decoded PAYMENT-RESPONSE.
    assert settled == [settlement]


async def test_http_client_without_payer_raises_402() -> None:
    challenge_header = encode_x402_header(_challenge())
    session = _FakeSession(challenge_header, "")
    client = HttpClient(base_url="https://api.example.test", session=session)
    with pytest.raises(TinyPlaceError) as excinfo:
        await client.get("/paid")
    assert excinfo.value.status == 402
    # No payer → no retry.
    assert len(session.requests) == 1
