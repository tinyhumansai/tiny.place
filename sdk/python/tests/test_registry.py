from __future__ import annotations

import base64

from nacl.signing import VerifyKey

from tinyplace import LocalSigner, TinyPlaceClient, canonical_payload

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
    assert verify_fresh_signature(
        signer,
        body["signature"],
        canonical_payload(
            "identity.register",
            {
                "actorType": None,
                "cryptoId": signer.agent_id,
                "paymentMethods": None,
                "primary": None,
                "publicKey": signer.public_key_base64,
                "username": "@agent",
            },
        ),
    )


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


def json_body(session: FakeSession) -> dict:
    return json_body_at(session, 0)


def json_body_at(session: FakeSession, index: int) -> dict:
    import json

    return json.loads(session.requests[index]["data"])
