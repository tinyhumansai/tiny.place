from __future__ import annotations

import base64
import json

from nacl.signing import VerifyKey

from tinyplace import LocalSigner, TinyPlaceClient, canonical_payload

from .helpers import FakeResponse, FakeSession


def _client(signer: LocalSigner, session: FakeSession) -> TinyPlaceClient:
    return TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )


async def test_get_score_is_public() -> None:
    signer = LocalSigner.from_seed(bytes([111]) * 32)
    session = FakeSession([FakeResponse(200, {"score": 42})])
    out = await _client(signer, session).reputation.get_score("AgentX")
    assert out == {"score": 42}
    assert session.requests[0]["url"].endswith("/reputation/AgentX")
    assert "X-Agent-ID" not in session.requests[0]["headers"]


async def test_create_review_signs_canonical_payload() -> None:
    signer = LocalSigner.from_seed(bytes([112]) * 32)
    session = FakeSession([FakeResponse(200, {"reviewId": "r1"})])
    await _client(signer, session).reputation.create_review(
        {"reviewer": "AgentA", "subject": "AgentB", "rating": 5, "comment": "great"}
    )
    body = json.loads(session.requests[0]["data"])
    assert session.requests[0]["url"].endswith("/reputation/reviews")
    assert body["reviewId"].startswith("rev_")
    assert body["signerPublicKey"] == signer.public_key_base64
    # The signature is base64(sign(canonical payload)) over the exact fields.
    payload = canonical_payload(
        "reputation.review",
        {
            "comment": "great",
            "context": "",
            "rating": 5,
            "reviewer": "AgentA",
            "subject": "AgentB",
            "transactionRef": None,
        },
    )
    VerifyKey(signer.public_key).verify(payload.encode(), base64.b64decode(body["signature"]))


async def test_create_vouch_signs_and_routes() -> None:
    signer = LocalSigner.from_seed(bytes([113]) * 32)
    session = FakeSession([FakeResponse(200, {"vouchId": "v1"})])
    await _client(signer, session).reputation.create_vouch(
        {"voucher": "AgentA", "subject": "AgentB", "weight": 1}
    )
    body = json.loads(session.requests[0]["data"])
    assert session.requests[0]["url"].endswith("/reputation/vouches")
    assert body["vouchId"].startswith("vouch_") and "signature" in body


async def test_delete_attestation_signs_in_query() -> None:
    signer = LocalSigner.from_seed(bytes([114]) * 32)
    session = FakeSession([FakeResponse(204, None)])
    await _client(signer, session).reputation.delete_attestation("att1")
    req = session.requests[0]
    assert req["method"] == "DELETE"
    assert req["url"].startswith("https://api.example.test/reputation/attestations/att1?signature=")
    # Revokes stay on signed (Authorization) auth.
    assert req["headers"]["Authorization"].startswith("tiny.place ")


async def test_leaderboard_paths() -> None:
    signer = LocalSigner.from_seed(bytes([115]) * 32)
    session = FakeSession([FakeResponse(200, {"entries": []}), FakeResponse(200, {"entries": []})])
    client = _client(signer, session)
    await client.reputation.leaderboard()
    await client.reputation.sellers_leaderboard({"limit": 3})
    assert session.requests[0]["url"].endswith("/leaderboards/reputation")
    assert "/leaderboards/sellers?limit=3" in session.requests[1]["url"]
