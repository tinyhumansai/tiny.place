from __future__ import annotations

import json

from tinyplace import LocalSigner, SOLANA_MAINNET_NETWORK, TinyPlaceClient

from .helpers import FakeResponse, FakeSession


def _client(signer: LocalSigner, session: FakeSession) -> TinyPlaceClient:
    return TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )


async def test_bounties_list_is_public() -> None:
    signer = LocalSigner.from_seed(bytes([91]) * 32)
    session = FakeSession([FakeResponse(200, {"bounties": []})])
    out = await _client(signer, session).bounties.list({"status": "open"})
    assert out == {"bounties": []}
    assert "/bounties?status=open" in session.requests[0]["url"]


async def test_bounties_create_and_submit_sign_as_actor() -> None:
    signer = LocalSigner.from_seed(bytes([92]) * 32)
    session = FakeSession([FakeResponse(200, {"bountyId": "b1"}), FakeResponse(200, {"id": "s1"})])
    client = _client(signer, session)
    await client.bounties.create({"creator": "CreatorId", "title": "Summarize X"})
    await client.bounties.submit("b1", {"submitter": "SubmitterId", "url": "https://x"})
    assert session.requests[0]["url"].endswith("/bounties")
    assert session.requests[0]["headers"]["X-Agent-ID"] == "CreatorId"
    assert session.requests[1]["url"].endswith("/bounties/b1/submissions")
    assert session.requests[1]["headers"]["X-Agent-ID"] == "SubmitterId"


def _challenge_accepts(challenge: dict) -> dict:
    """Wrap a flat challenge dict in a canonical x402 v2 ``accepts[0]`` body.

    The backend emits ONLY the standard envelope — the SDK parses ``accepts[0]``
    (``network``/``amount``/``asset``-mint/``payTo``/``extra.feePayer``).
    """
    fee_payer = challenge.get("feePayer", "FacilitatorFeePayer111")
    return {
        "error": challenge.get("error"),
        "accepts": [
            {
                "scheme": "exact",
                "network": challenge["network"],
                "amount": challenge["amount"],
                "asset": challenge["asset"],
                "payTo": challenge["to"],
                "extra": {"feePayer": fee_payer},
            }
        ],
    }


async def test_bounties_create_with_solana_payment_submits_header_then_creates(monkeypatch) -> None:
    signer = LocalSigner.from_seed(bytes([96]) * 32)
    challenge = {
        "amount": "5",
        "to": "EscrowWallet111",
        "network": SOLANA_MAINNET_NETWORK,
        "asset": "USDC",
        "feePayer": "FacilitatorFeePayer111",
    }
    session = FakeSession(
        [
            FakeResponse(402, _challenge_accepts(challenge)),  # probe
            FakeResponse(200, {"bountyId": "b1", "status": "open"}),  # re-create (funded)
        ]
    )
    client = _client(signer, session)
    captured: dict = {}

    async def fake_header(**kwargs):
        captured.update(kwargs)
        return "ENCODED-ENVELOPE"

    monkeypatch.setattr("tinyplace.api.bounties.build_delegated_x402_payment_header", fake_header)

    result = await client.bounties.create_with_solana_payment(
        {"creator": "CreatorId", "title": "X", "amount": "5", "asset": "USDC"},
        rpc_url="https://rpc.example",
        secret_key=bytes([96]) * 32,
    )
    # Paid the reward into the escrow wallet with the facilitator fee payer from
    # accepts[].extra.feePayer.
    assert captured["payment"]["amount"] == "5"
    assert captured["payment"]["to"] == "EscrowWallet111"
    assert captured["fee_payer"] == "FacilitatorFeePayer111"
    # Both POSTs hit the combined create endpoint; the re-create carried the
    # PAYMENT-SIGNATURE header and NO body payment map.
    assert session.requests[0]["url"].endswith("/bounties")
    recreate = session.requests[1]
    assert recreate["headers"]["PAYMENT-SIGNATURE"] == "ENCODED-ENVELOPE"
    create_body = json.loads(recreate["data"])
    assert "payment" not in create_body
    assert result["bounty"]["status"] == "open"
    assert result["paymentHeader"] == "ENCODED-ENVELOPE"


async def test_bounties_create_with_solana_payment_retries_through_confirmation_lag(monkeypatch) -> None:
    signer = LocalSigner.from_seed(bytes([97]) * 32)
    challenge = {
        "amount": "5",
        "to": "Escrow1",
        "network": SOLANA_MAINNET_NETWORK,
        "asset": "USDC",
        "feePayer": "FacilitatorFeePayer111",
    }
    session = FakeSession(
        [
            FakeResponse(402, _challenge_accepts(challenge)),  # probe
            FakeResponse(402, {"error": "transaction not found"}),  # re-create: not confirmed yet
            FakeResponse(200, {"bountyId": "b1", "status": "open"}),  # re-create: confirmed
        ]
    )
    client = _client(signer, session)

    async def fake_header(**kwargs):
        return "ENCODED-ENVELOPE"

    monkeypatch.setattr("tinyplace.api.bounties.build_delegated_x402_payment_header", fake_header)

    result = await client.bounties.create_with_solana_payment(
        {"creator": "CreatorId", "title": "X", "amount": "5"},
        rpc_url="https://rpc.example",
        secret_key=bytes([97]) * 32,
        interval_ms=0,  # no real sleep
    )
    assert len(session.requests) == 3  # probe + 2 create attempts
    # Every re-create attempt carried the same PAYMENT-SIGNATURE header.
    assert session.requests[1]["headers"]["PAYMENT-SIGNATURE"] == "ENCODED-ENVELOPE"
    assert session.requests[2]["headers"]["PAYMENT-SIGNATURE"] == "ENCODED-ENVELOPE"
    assert result["bounty"]["status"] == "open"


async def test_bounties_create_with_solana_payment_requires_fee_payer(monkeypatch) -> None:
    import pytest

    signer = LocalSigner.from_seed(bytes([95]) * 32)
    # accepts[0] with no extra.feePayer — the sponsored path cannot proceed.
    body = {
        "accepts": [
            {
                "scheme": "exact",
                "network": SOLANA_MAINNET_NETWORK,
                "amount": "5",
                "asset": "USDC",
                "payTo": "EscrowWallet111",
                "extra": {},
            }
        ]
    }
    session = FakeSession([FakeResponse(402, body)])
    client = _client(signer, session)

    async def fail_header(**_kwargs):  # must never be reached
        raise AssertionError("header builder should not run without a fee payer")

    monkeypatch.setattr("tinyplace.api.bounties.build_delegated_x402_payment_header", fail_header)

    with pytest.raises(ValueError, match="fee payer"):
        await client.bounties.create_with_solana_payment(
            {"creator": "CreatorId", "title": "X", "amount": "5", "asset": "USDC"},
            rpc_url="https://rpc.example",
            secret_key=bytes([95]) * 32,
        )


async def test_bounties_create_with_solana_payment_requires_creator() -> None:
    import pytest

    signer = LocalSigner.from_seed(bytes([99]) * 32)
    session = FakeSession([])
    with pytest.raises(ValueError, match="creator"):
        await _client(signer, session).bounties.create_with_solana_payment(
            {"title": "X", "amount": "5"}, rpc_url="https://rpc.example", secret_key=bytes([99]) * 32
        )
    assert session.requests == []  # rejected before any request
