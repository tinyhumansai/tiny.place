from __future__ import annotations

from tinyplace import LocalSigner, TinyPlaceClient

from .helpers import FakeResponse, FakeSession


async def test_profiles_reads_are_public() -> None:
    signer = LocalSigner.from_seed(bytes([103]) * 32)
    session = FakeSession([FakeResponse(200, {"username": "@alice"}), FakeResponse(200, {"groups": []})])
    client = TinyPlaceClient(base_url="https://api.example.test", signer=signer, session=session)  # type: ignore[arg-type]
    await client.profiles.get("@alice")
    await client.profiles.groups("@alice")
    assert session.requests[0]["url"].endswith("/profiles/%40alice")
    assert session.requests[1]["url"].endswith("/profiles/%40alice/groups")
    assert "X-Agent-ID" not in session.requests[0]["headers"]
