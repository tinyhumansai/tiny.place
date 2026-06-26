from __future__ import annotations

from tinyplace import LocalSigner, SOLANA_MAINNET_NETWORK, TinyPlaceClient

from .helpers import FakeResponse, FakeSession, verify_siws_token


async def test_register_normalizes_and_signs() -> None:
    signer = LocalSigner.from_seed(bytes([19]) * 32)
    session = FakeSession([FakeResponse(200, {"username": "@agent"})])
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    await client.registry.register(
        {
            "username": "agent",
            "cryptoId": signer.agent_id,
            "publicKey": signer.public_key_base64,
        }
    )

    body = json_body(session)
    assert body["username"] == "@agent"
    # The signer defaults to SIWS, so the request carries a SIWS auth token
    # (accepted by the v2 backend) rather than a fresh canonical-payload signature.
    assert verify_siws_token(signer, body["signature"])


async def test_register_derives_public_key_from_crypto_id() -> None:
    signer = LocalSigner.from_seed(bytes([23]) * 32)
    session = FakeSession([FakeResponse(200, {"username": "@agent"})])
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    # No publicKey supplied — the SDK derives it from cryptoId.
    await client.registry.register({"username": "agent", "cryptoId": signer.agent_id})

    body = json_body(session)
    # The derived publicKey (base64 of the same ed25519 key the cryptoId encodes)
    # lands in the body, so the backend reconstructs an identical canonical
    # payload from cryptoId alone.
    assert body["cryptoId"] == signer.agent_id
    assert body["publicKey"] == signer.public_key_base64


async def test_registry_signed_mutations() -> None:
    signer = LocalSigner.from_seed(bytes([20]) * 32)
    session = FakeSession([FakeResponse(200, {"ok": True}) for _ in range(7)])
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    await client.registry.update_profile_visibility("@agent", {"activity": True})
    await client.registry.renew("@agent", {})
    await client.registry.transfer("@agent", {"cryptoId": "recipient", "publicKey": "pub"})
    await client.registry.assign_primary("@agent")
    await client.registry.unassign_primary("@agent")
    await client.registry.claim("@agent", {"cryptoId": "recipient", "publicKey": "pub"})
    await client.registry.create_subname("@agent", {"subname": "bot", "target": "@target", "bio": "hi"})

    urls = [request["url"] for request in session.requests]
    assert urls[0].endswith("/profile-visibility")
    assert urls[1].endswith("/renew")
    assert urls[2].endswith("/transfer")
    assert urls[3].endswith("/assign")
    assert urls[4].endswith("/unassign")
    assert urls[5].endswith("/claim")
    assert urls[6].endswith("/subnames")
    assert all("signature" in json_body_at(session, index) for index in range(7))


async def test_delete_subname_uses_public_delete_with_ownership_signature() -> None:
    signer = LocalSigner.from_seed(bytes([21]) * 32)
    session = FakeSession([FakeResponse(200, {"ok": True})])
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    await client.registry.delete_subname("@agent", "bot")

    request = session.requests[0]
    assert request["method"] == "DELETE"
    assert request["url"].endswith("/registry/names/%40agent/subnames/bot")
    assert request["headers"]["X-TinyPlace-Public-Key"] == signer.public_key_base64
    # Directory-write auth carries the SIWS token (accepted by the v2 backend).
    assert verify_siws_token(signer, request["headers"]["X-TinyPlace-Signature"])


async def test_register_with_solana_payment_settles_then_retries(monkeypatch) -> None:
    signer = LocalSigner.from_seed(bytes([22]) * 32)
    challenge = {
        "amount": "10000000",
        "to": "Recipient1111111111111111111111111111111111",
        "network": SOLANA_MAINNET_NETWORK,
        "asset": "USDC",
        "nonce": "n1",
        "expiresAt": "2026-06-13T00:00:00Z",
        "metadata": {"feeQuoteId": "q1"},
    }
    session = FakeSession(
        [
            FakeResponse(402, {"error": "payment required", "payment": challenge}),
            FakeResponse(200, {"username": "@agent", "cryptoId": signer.agent_id}),
        ]
    )
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    captured: dict = {}

    async def fake_execute(**kwargs):
        captured.update(kwargs)
        return {
            "signature": "onchain-sig",
            "payment": {"scheme": "exact", "amount": kwargs["payment"]["amount"], "signature": "sig"},
        }

    monkeypatch.setattr("tinyplace.api.registry.execute_solana_x402_payment", fake_execute)

    result = await client.register_domain_with_solana_payment(
        "agent",
        rpc_url="https://rpc.example",
        secret_key=bytes([22]) * 32,
        network=SOLANA_MAINNET_NETWORK,
    )

    # Paid the challenge's exact amount to its recipient, tagged for registration.
    assert captured["payment"]["amount"] == "10000000"
    assert captured["payment"]["to"] == challenge["to"]
    assert captured["payment"]["metadata"]["purpose"] == "registration"
    assert captured["payment"]["metadata"]["identity"] == "@agent"
    # The retried registration carried the signed payment map.
    retry_body = json_body_at(session, 1)
    assert retry_body["payment"]["signature"] == "sig"
    assert retry_body["username"] == "@agent"
    assert result["onChainTx"] == "onchain-sig"


async def test_register_with_solana_payment_decodes_header_challenge_and_defaults_mint(
    monkeypatch,
) -> None:
    import base64 as _b64
    import json as _json

    signer = LocalSigner.from_seed(bytes([23]) * 32)
    # asset given as the USDC SPL mint address (not the literal "USDC" symbol),
    # challenge carried ONLY in the base64url X-Payment-Required header.
    challenge = {
        "amount": "10000000",
        "to": "Recipient1111111111111111111111111111111111",
        "network": SOLANA_MAINNET_NETWORK,
        "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "nonce": "n2",
    }
    header = _b64.urlsafe_b64encode(_json.dumps({"payment": challenge}).encode()).decode().rstrip("=")
    session = FakeSession(
        [
            FakeResponse(402, "", headers={"X-Payment-Required": header}),
            FakeResponse(200, {"username": "@agent", "cryptoId": signer.agent_id}),
        ]
    )
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    captured: dict = {}

    async def fake_execute(**kwargs):
        captured.update(kwargs)
        return {"signature": "sig", "payment": {"signature": "s"}}

    monkeypatch.setattr("tinyplace.api.registry.execute_solana_x402_payment", fake_execute)

    result = await client.register_domain_with_solana_payment(
        "agent", rpc_url="https://rpc.example", secret_key=bytes([23]) * 32
    )

    # Header-only challenge was decoded, and the USDC mint defaulted even though
    # the asset was the mint address rather than "USDC".
    assert captured["payment"]["amount"] == "10000000"
    assert captured["mint"] == "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    assert result["onChainTx"] == "sig"


async def test_register_with_solana_payment_recovers_on_server_error(monkeypatch) -> None:
    signer = LocalSigner.from_seed(bytes([24]) * 32)
    challenge = {
        "amount": "1",
        "to": "Recipient1111111111111111111111111111111111",
        "network": SOLANA_MAINNET_NETWORK,
        "asset": "USDC",
    }
    session = FakeSession(
        [
            FakeResponse(402, {"payment": challenge}),  # challenge probe
            FakeResponse(500, {"error": "boom"}),  # paid retry: 5xx after persisting
            FakeResponse(200, {"available": False, "identity": {"username": "@agent"}}),  # get()
        ]
    )
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    async def fake_execute(**kwargs):
        return {"signature": "sig", "payment": {}}

    monkeypatch.setattr("tinyplace.api.registry.execute_solana_x402_payment", fake_execute)

    result = await client.register_domain_with_solana_payment(
        "agent", rpc_url="https://rpc.example", secret_key=bytes([24]) * 32
    )

    # The handle was created despite the 5xx, so recovery returns it instead of
    # failing (which would risk a second payment on retry).
    assert result["identity"]["username"] == "@agent"
    assert result["onChainTx"] == "sig"


def json_body(session: FakeSession) -> dict:
    return json_body_at(session, 0)


def json_body_at(session: FakeSession, index: int) -> dict:
    import json

    return json.loads(session.requests[index]["data"])
