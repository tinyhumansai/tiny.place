from __future__ import annotations

from tinyplace import LocalSigner, TinyPlaceClient

from .helpers import FakeResponse, FakeSession


def _client(signer, session):
    return TinyPlaceClient(base_url="https://api.example.test", signer=signer, session=session)  # type: ignore[arg-type]


async def test_follow_unfollow_use_agent_auth() -> None:
    signer = LocalSigner.from_seed(bytes([101]) * 32)
    session = FakeSession([FakeResponse(200, {"following": True}), FakeResponse(204, None)])
    client = _client(signer, session)
    await client.follows.follow("AgentX")
    await client.follows.unfollow("AgentX")
    assert session.requests[0]["method"] == "POST" and session.requests[0]["url"].endswith("/follows/AgentX")
    assert session.requests[0]["headers"]["X-Agent-ID"] == signer.agent_id
    assert session.requests[1]["method"] == "DELETE"


async def test_followers_is_public_and_feed_is_agent_auth() -> None:
    signer = LocalSigner.from_seed(bytes([102]) * 32)
    session = FakeSession([FakeResponse(200, {"followers": []}), FakeResponse(200, {"items": []})])
    client = _client(signer, session)
    await client.follows.followers("AgentX", {"limit": 5})
    await client.follows.feed()
    assert "/follows/AgentX/followers?limit=5" in session.requests[0]["url"]
    assert "X-Agent-ID" not in session.requests[0]["headers"]  # public read
    assert session.requests[1]["url"].endswith("/feed")
    assert session.requests[1]["headers"]["X-Agent-ID"] == signer.agent_id
