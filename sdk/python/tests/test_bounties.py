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


async def test_bounties_create_with_solana_payment_settles_then_creates(monkeypatch) -> None:
    signer = LocalSigner.from_seed(bytes([96]) * 32)
    challenge = {
        "amount": "5",
        "to": "EscrowWallet111",
        "network": SOLANA_MAINNET_NETWORK,
        "asset": "USDC",
        "nonce": "n1",
    }
    session = FakeSession(
        [
            FakeResponse(402, {"error": "payment required to create and fund this bounty", "payment": challenge}),  # probe
            FakeResponse(200, {"bountyId": "b1", "status": "open"}),  # re-create (funded)
        ]
    )
    client = _client(signer, session)
    captured: dict = {}

    async def fake_exec(**kwargs):
        captured.update(kwargs)
        return {"signature": "sig", "payment": {"signature": "s"}}

    monkeypatch.setattr("tinyplace.api.bounties.execute_solana_x402_payment", fake_exec)

    result = await client.bounties.create_with_solana_payment(
        {"creator": "CreatorId", "title": "X", "amount": "5", "asset": "USDC"},
        rpc_url="https://rpc.example",
        secret_key=bytes([96]) * 32,
    )
    # Paid the reward into the escrow wallet, from the creator.
    assert captured["payment"]["amount"] == "5"
    assert captured["payment"]["to"] == "EscrowWallet111" and captured["payment"]["from"] == "CreatorId"
    assert captured["payment"]["metadata"]["kind"] == "bounty-fund"
    # Both POSTs hit the combined create endpoint; the re-create carried the payment.
    assert session.requests[0]["url"].endswith("/bounties")
    create_body = json.loads(session.requests[1]["data"])
    assert create_body["payment"]["signature"] == "s"
    assert result["bounty"]["status"] == "open" and result["payment"]["signature"] == "sig"


async def test_bounties_create_with_solana_payment_retries_through_confirmation_lag(monkeypatch) -> None:
    signer = LocalSigner.from_seed(bytes([97]) * 32)
    challenge = {"amount": "5", "to": "Escrow1", "network": SOLANA_MAINNET_NETWORK, "asset": "USDC"}
    session = FakeSession(
        [
            FakeResponse(402, {"payment": challenge}),  # probe
            FakeResponse(402, {"error": "transaction not found"}),  # re-create: not confirmed yet
            FakeResponse(200, {"bountyId": "b1", "status": "open"}),  # re-create: confirmed
        ]
    )
    client = _client(signer, session)

    async def fake_exec(**kwargs):
        return {"signature": "sig", "payment": {"signature": "s"}}

    monkeypatch.setattr("tinyplace.api.bounties.execute_solana_x402_payment", fake_exec)

    result = await client.bounties.create_with_solana_payment(
        {"creator": "CreatorId", "title": "X", "amount": "5"},
        rpc_url="https://rpc.example",
        secret_key=bytes([97]) * 32,
        interval_ms=0,  # no real sleep
    )
    assert len(session.requests) == 3  # probe + 2 create attempts
    assert result["bounty"]["status"] == "open"


async def test_bounties_create_with_solana_payment_uses_delegated_path_when_fee_payer(
    monkeypatch,
) -> None:
    # When the 402 challenge advertises the facilitator fee payer, the SPL reward
    # settles gaslessly through the delegated path (delegatedTx), not the direct
    # payer-pays-gas transfer.
    signer = LocalSigner.from_seed(bytes([95]) * 32)
    challenge = {
        "amount": "5",
        "to": "EscrowWallet111",
        "network": SOLANA_MAINNET_NETWORK,
        "asset": "USDC",
        "metadata": {"feePayer": "FacilitatorFeePayer111"},
    }
    session = FakeSession(
        [
            FakeResponse(402, {"payment": challenge}),  # probe
            FakeResponse(200, {"bountyId": "b1", "status": "open"}),  # funded re-create
        ]
    )
    client = _client(signer, session)
    captured: dict = {}

    async def fake_delegated(**kwargs):
        captured.update(kwargs)
        return {
            "from": kwargs["from_address"],
            "amount": kwargs["payment"]["amount"],
            "to": kwargs["payment"]["to"],
            "metadata.delegatedTx": "BASE64WIRE",
        }

    async def fail_direct(**_kwargs):  # the direct path must NOT be taken
        raise AssertionError("direct execute_solana_x402_payment should not run")

    monkeypatch.setattr("tinyplace.api.bounties.build_delegated_x402_payment_map", fake_delegated)
    monkeypatch.setattr("tinyplace.api.bounties.execute_solana_x402_payment", fail_direct)

    result = await client.bounties.create_with_solana_payment(
        {"creator": "CreatorId", "title": "X", "amount": "5", "asset": "USDC"},
        rpc_url="https://rpc.example",
        secret_key=bytes([95]) * 32,
    )

    # The facilitator fee payer from the challenge drove the delegated build.
    assert captured["fee_payer"] == "FacilitatorFeePayer111"
    assert captured["from_address"] == "CreatorId"
    assert captured["payment"]["metadata"]["kind"] == "bounty-fund"
    create_body = json.loads(session.requests[1]["data"])
    assert create_body["payment"]["metadata.delegatedTx"] == "BASE64WIRE"
    assert result["bounty"]["status"] == "open"


async def test_bounties_create_with_solana_payment_requires_creator() -> None:
    import pytest

    signer = LocalSigner.from_seed(bytes([99]) * 32)
    session = FakeSession([])
    with pytest.raises(ValueError, match="creator"):
        await _client(signer, session).bounties.create_with_solana_payment(
            {"title": "X", "amount": "5"}, rpc_url="https://rpc.example", secret_key=bytes([99]) * 32
        )
    assert session.requests == []  # rejected before any request
