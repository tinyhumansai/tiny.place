from __future__ import annotations

import base64

from nacl.signing import VerifyKey

from tinyplace import LocalSigner, SOLANA_MAINNET_NETWORK, TinyPlaceClient, canonical_payload

from .helpers import FakeResponse, FakeSession


def verify_fresh_signature(signer: LocalSigner, signature: str, payload: str) -> bool:
    version, timestamp, nonce, raw_signature = signature.split(":")
    assert version == "v1"
    signed_at = base64.urlsafe_b64decode(timestamp + "=" * (-len(timestamp) % 4)).decode()
    nonce_value = base64.urlsafe_b64decode(nonce + "=" * (-len(nonce) % 4)).decode()
    VerifyKey(signer.public_key).verify(
        f"{payload}\n{signed_at}\n{nonce_value}".encode(),
        base64.b64decode(raw_signature),
    )
    return True


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
    # Must match the backend's registrationPayload exactly: only these four
    # fields (no actorType/primary), or the backend rejects it with 401.
    assert verify_fresh_signature(
        signer,
        body["signature"],
        canonical_payload(
            "identity.register",
            {
                "cryptoId": signer.agent_id,
                "paymentMethods": None,
                "publicKey": signer.public_key_base64,
                "username": "@agent",
            },
        ),
    )


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
    assert request["headers"]["X-TinyPlace-Signature"].startswith("v1:")


def _challenge_accepts(challenge: dict) -> dict:
    """Wrap a flat challenge dict in a canonical x402 v2 ``accepts[0]`` body.

    The backend no longer emits a legacy top-level ``payment`` field or
    ``metadata.feePayer`` — the SDK parses ``accepts[0]`` (``network``/``amount``/
    ``asset``-mint/``payTo``/``extra.feePayer``).
    """
    metadata = dict(challenge.get("metadata") or {})
    fee_payer = challenge.get("feePayer") or metadata.get("feePayer")
    extra = {k: v for k, v in metadata.items() if k != "feePayer"}
    if fee_payer:
        extra["feePayer"] = fee_payer
    return {
        "error": challenge.get("error"),
        "accepts": [
            {
                "scheme": "exact",
                "network": challenge["network"],
                "amount": challenge["amount"],
                "asset": challenge["asset"],
                "payTo": challenge["to"],
                "extra": extra,
            }
        ],
    }


_FEE_PAYER = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"


async def test_register_with_solana_payment_submits_header_then_retries(monkeypatch) -> None:
    signer = LocalSigner.from_seed(bytes([22]) * 32)
    challenge = {
        "amount": "10000000",
        "to": "Recipient1111111111111111111111111111111111",
        "network": SOLANA_MAINNET_NETWORK,
        "asset": "USDC",
        "feePayer": _FEE_PAYER,
    }
    session = FakeSession(
        [
            FakeResponse(402, _challenge_accepts(challenge)),
            FakeResponse(200, {"username": "@agent", "cryptoId": signer.agent_id}),
        ]
    )
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    captured: dict = {}

    async def fake_header(**kwargs):
        captured.update(kwargs)
        return "ENCODED-ENVELOPE"

    monkeypatch.setattr(
        "tinyplace.api.registry.build_delegated_x402_payment_header", fake_header
    )

    result = await client.register_domain_with_solana_payment(
        "agent",
        rpc_url="https://rpc.example",
        secret_key=bytes([22]) * 32,
        network=SOLANA_MAINNET_NETWORK,
    )

    # The header builder paid the challenge's exact amount to its recipient with
    # the facilitator fee payer from accepts[].extra.feePayer.
    assert captured["payment"]["amount"] == "10000000"
    assert captured["payment"]["to"] == challenge["to"]
    assert captured["fee_payer"] == _FEE_PAYER
    # The retried registration carried the PAYMENT-SIGNATURE header and NO body
    # payment map.
    retry = session.requests[1]
    assert retry["headers"]["PAYMENT-SIGNATURE"] == "ENCODED-ENVELOPE"
    retry_body = json_body_at(session, 1)
    assert "payment" not in retry_body
    assert retry_body["username"] == "@agent"
    assert result["paymentHeader"] == "ENCODED-ENVELOPE"
    assert result["onChainTx"] is None


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
        "feePayer": _FEE_PAYER,
    }
    header = (
        _b64.urlsafe_b64encode(_json.dumps(_challenge_accepts(challenge)).encode())
        .decode()
        .rstrip("=")
    )
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

    async def fake_header(**kwargs):
        captured.update(kwargs)
        return "ENCODED-ENVELOPE"

    monkeypatch.setattr(
        "tinyplace.api.registry.build_delegated_x402_payment_header", fake_header
    )

    result = await client.register_domain_with_solana_payment(
        "agent", rpc_url="https://rpc.example", secret_key=bytes([23]) * 32
    )

    # Header-only challenge was decoded from accepts[0], and the USDC mint
    # defaulted even though the asset was the mint address rather than "USDC".
    assert captured["payment"]["amount"] == "10000000"
    assert captured["mint"] == "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    assert result["paymentHeader"] == "ENCODED-ENVELOPE"


async def test_register_with_solana_payment_recovers_on_server_error(monkeypatch) -> None:
    signer = LocalSigner.from_seed(bytes([24]) * 32)
    challenge = {
        "amount": "1",
        "to": "Recipient1111111111111111111111111111111111",
        "network": SOLANA_MAINNET_NETWORK,
        "asset": "USDC",
        "feePayer": _FEE_PAYER,
    }
    session = FakeSession(
        [
            FakeResponse(402, _challenge_accepts(challenge)),  # challenge probe
            FakeResponse(500, {"error": "boom"}),  # paid retry: 5xx after persisting
            FakeResponse(200, {"available": False, "identity": {"username": "@agent"}}),  # get()
        ]
    )
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    async def fake_header(**kwargs):
        return "ENCODED-ENVELOPE"

    monkeypatch.setattr(
        "tinyplace.api.registry.build_delegated_x402_payment_header", fake_header
    )

    result = await client.register_domain_with_solana_payment(
        "agent", rpc_url="https://rpc.example", secret_key=bytes([24]) * 32
    )

    # The handle was created despite the 5xx, so recovery returns it instead of
    # failing (which would risk a second payment on retry).
    assert result["identity"]["username"] == "@agent"
    assert result["paymentHeader"] == "ENCODED-ENVELOPE"


def json_body(session: FakeSession) -> dict:
    return json_body_at(session, 0)


def json_body_at(session: FakeSession, index: int) -> dict:
    import json

    return json.loads(session.requests[index]["data"])
