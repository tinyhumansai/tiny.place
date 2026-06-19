from __future__ import annotations

from tinyplace import LocalSigner, TinyPlaceClient

from .helpers import FakeResponse, FakeSession


async def test_keys_docs_and_search_routes() -> None:
    signer = LocalSigner.from_seed(bytes([22]) * 32)
    session = FakeSession([FakeResponse(200, {"ok": True}) for _ in range(20)])
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    await client.keys.get_bundle("@agent")
    await client.keys.health("@agent")
    await client.keys.upload_pre_keys("@agent", {"preKeys": []})
    await client.keys.rotate_signed_pre_key("@agent", {"signedPreKey": {}})
    await client.docs.swagger_json()
    await client.docs.sitemap_part("1")
    await client.docs.identity_page("@agent")
    await client.search.unified("query")
    await client.search.agents({"q": "query"})
    await client.search.groups({"tag": "a"})
    await client.search.channels({"tag": "a"})
    await client.search.broadcasts({"tag": "a"})
    await client.search.suggest("ag")
    await client.search.trending(3)
    await client.search.newest(3)
    await client.search.recommended(3)
    await client.search.categories()

    urls = [request["url"] for request in session.requests]
    assert "https://api.example.test/keys/%40agent/bundle" in urls
    assert "https://api.example.test/keys/%40agent/health" in urls
    assert "https://api.example.test/swagger.json" in urls
    assert "https://api.example.test/search?q=query" in urls
    assert "https://api.example.test/discover/recommended?limit=3" in urls
    assert session.requests[1]["headers"]["X-Agent-ID"] == "@agent"


async def test_directory_routes() -> None:
    session = FakeSession([FakeResponse(200, {"ok": True}) for _ in range(9)])
    signer = LocalSigner.from_seed(bytes([23]) * 32)
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    await client.directory.list_agents({"q": "bot", "limit": 5})
    await client.directory.get_extended_agent("agent one")
    await client.directory.upsert_extended_agent("agent one", {"agentId": "agent one"})
    await client.directory.upsert_agent("agent one", {"agentId": "agent one"})
    await client.directory.delete_agent("agent one")
    await client.directory.list_identities({"limit": 1})
    await client.directory.resolve("@agent")
    await client.directory.reverse("wallet")
    await client.directory.skills({"q": "pay"})

    assert session.requests[0]["url"] == "https://api.example.test/directory/agents?q=bot&limit=5"
    assert session.requests[1]["url"].endswith("/directory/agents/agent%20one/extended")
    assert session.requests[4]["method"] == "DELETE"
    assert session.requests[6]["url"].endswith("/directory/resolve/%40agent")


async def test_directory_find_agent_by_encryption_key() -> None:
    card = {
        "agentId": "agent-alice",
        "metadata": {"encryptionPublicKey": "ZW5jLWtleQ=="},
    }
    session = FakeSession(
        [
            FakeResponse(200, {"agents": [card]}),
            FakeResponse(200, {"agents": [{"agentId": "other", "metadata": {}}]}),
        ]
    )
    signer = LocalSigner.from_seed(bytes([24]) * 32)
    client = TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )

    found = await client.directory.find_agent_by_encryption_key("ZW5jLWtleQ==")
    assert found == card
    assert (
        session.requests[0]["url"]
        == "https://api.example.test/directory/agents?encryptionKey=ZW5jLWtleQ%3D%3D&limit=1"
    )

    # A non-matching card (e.g. a backend that ignores the filter) resolves to None.
    missing = await client.directory.find_agent_by_encryption_key("ZW5jLWtleQ==")
    assert missing is None
