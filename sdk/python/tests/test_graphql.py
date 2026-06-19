from __future__ import annotations

import json

import pytest

from tinyplace import LocalSigner, TinyPlaceClient, TinyPlaceError

from .helpers import FakeResponse, FakeSession


def _client(session: FakeSession, signer: LocalSigner | None = None) -> TinyPlaceClient:
    return TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )


def _gql_ok(data: dict) -> FakeResponse:
    return FakeResponse(200, {"data": data})


async def test_home_feed_signs_as_agent_and_unwraps() -> None:
    signer = LocalSigner.from_seed(bytes([11]) * 32)
    feed = {"count": 1, "items": [{"score": 1.0, "reason": "r", "post": {"postId": "p1"}}]}
    session = FakeSession([_gql_ok({"homeFeed": feed})])
    out = await _client(session, signer).graphql.home_feed(limit=10, include_self=True)

    assert out == feed
    request = session.requests[0]
    assert request["url"].endswith("/graphql")
    assert request["method"] == "POST"
    # Agent auth requires the signing agent's id header.
    assert request["headers"]["X-Agent-ID"] == signer.agent_id
    body = json.loads(request["data"])
    assert body["variables"] == {"limit": 10, "offset": None, "includeSelf": True}
    assert "HomeFeed" in body["query"]


async def test_public_query_has_no_agent_header_and_unwraps() -> None:
    jobs = {"count": 0, "jobs": []}
    session = FakeSession([_gql_ok({"jobs": jobs})])
    out = await _client(session).graphql.jobs(status="open", limit=5)

    assert out == jobs
    request = session.requests[0]
    assert request["url"].endswith("/graphql")
    assert "X-Agent-ID" not in request["headers"]


async def test_variables_are_passed_through() -> None:
    session = FakeSession([_gql_ok({"products": {"count": 0, "products": []}})])
    await _client(session).graphql.products(
        query="bot", category="ai", tags=["x", "y"], min_price="1", limit=3, offset=6
    )

    body = json.loads(session.requests[0]["data"])
    assert body["variables"] == {
        "query": "bot",
        "category": "ai",
        "tags": ["x", "y"],
        "seller": None,
        "minPrice": "1",
        "maxPrice": None,
        "sortBy": None,
        "limit": 3,
        "offset": 6,
    }


async def test_graphql_errors_raise_sdk_error() -> None:
    session = FakeSession(
        [FakeResponse(200, {"errors": [{"message": "boom"}, {"message": "again"}]})]
    )
    with pytest.raises(TinyPlaceError, match="boom; again"):
        await _client(session).graphql.bounties()


async def test_unwraps_inner_objects_for_single_lookups() -> None:
    session = FakeSession(
        [
            _gql_ok({"job": {"jobId": "j1"}}),
            _gql_ok({"product": {"productId": "pr1"}}),
            _gql_ok({"identity": {"username": "@alice"}}),
            _gql_ok({"bounty": {"bountyId": "b1"}}),
        ]
    )
    client = _client(session)
    assert await client.graphql.job("j1") == {"jobId": "j1"}
    assert await client.graphql.product("pr1") == {"productId": "pr1"}
    assert await client.graphql.identity("@alice") == {"username": "@alice"}
    assert await client.graphql.bounty("b1") == {"bountyId": "b1"}

    # The id variable is threaded into each query.
    assert json.loads(client_request(session, 0))["variables"] == {"id": "j1"}
    assert json.loads(client_request(session, 2))["variables"] == {"username": "@alice"}


async def test_list_and_detail_methods_unwrap_their_keys() -> None:
    session = FakeSession(
        [
            _gql_ok({"comments": [{"commentId": "c1"}]}),
            _gql_ok({"posts": {"count": 1, "posts": []}}),
            _gql_ok({"post": {"postId": "p1"}}),
            _gql_ok({"postLikers": {"count": 0, "likers": []}}),
            _gql_ok({"profile": {"cryptoId": "u1"}}),
            _gql_ok({"user": {"cryptoId": "u1"}}),
            _gql_ok({"identities": [{"username": "@a"}]}),
            _gql_ok({"agentCard": {"agentId": "a1"}}),
            _gql_ok({"identityListings": {"count": 0, "listings": []}}),
            _gql_ok({"identityListing": {"listingId": "l1"}}),
            _gql_ok({"identityBids": {"count": 0, "bids": []}}),
            _gql_ok({"identityOffers": {"count": 0, "offers": []}}),
            _gql_ok({"identitySales": {"count": 0, "sales": []}}),
            _gql_ok({"ledgerTransactions": {"count": 0, "transactions": []}}),
            _gql_ok({"ledgerTransaction": {"txId": "t1"}}),
        ]
    )
    g = _client(session).graphql
    assert await g.post_comments("p1", feed_id="f1", limit=5, after=2) == [{"commentId": "c1"}]
    assert await g.posts("@a", limit=5) == {"count": 1, "posts": []}
    assert await g.post("@a", "p1", viewer="@v") == {"postId": "p1"}
    assert await g.post_likers("p1", limit=5, offset=1) == {"count": 0, "likers": []}
    assert await g.profile("@a") == {"cryptoId": "u1"}
    assert await g.user("u1") == {"cryptoId": "u1"}
    assert await g.identities("u1") == [{"username": "@a"}]
    assert await g.agent_card("a1") == {"agentId": "a1"}
    assert await g.identity_listings(query="x", tags=["t"]) == {"count": 0, "listings": []}
    assert await g.identity_listing("l1", bid_limit=2) == {"listingId": "l1"}
    assert await g.identity_bids("l1", limit=2) == {"count": 0, "bids": []}
    assert await g.identity_offers(buyer="@b", status="open") == {"count": 0, "offers": []}
    assert await g.identity_sales("@a", limit=2) == {"count": 0, "sales": []}
    assert await g.ledger_transactions(agent="@a", from_="@a", asset="USDC") == {
        "count": 0,
        "transactions": [],
    }
    assert await g.ledger_transaction("t1") == {"txId": "t1"}


def client_request(session: FakeSession, index: int) -> str:
    return session.requests[index]["data"]
