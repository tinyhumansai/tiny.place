"""Backward-compatibility tests: GraphQL selectors and safe accessors must
tolerate backend shape drift (missing/null/renamed fields) instead of raising.
"""

from __future__ import annotations

from typing import Any

import pytest

from tinyplace import (
    TinyPlaceClient,
    as_int,
    as_list,
    field,
    list_field,
)

from .helpers import FakeResponse, FakeSession


def _client(body: Any) -> TinyPlaceClient:
    return TinyPlaceClient(
        base_url="https://example.test",
        session=FakeSession([FakeResponse(200, body)]),
    )


@pytest.mark.asyncio
async def test_graphql_bare_list_returns_empty_when_data_missing() -> None:
    # `data` entirely absent from the GraphQL envelope.
    client = _client({})
    assert await client.graphql.bounties() == []


@pytest.mark.asyncio
async def test_graphql_bare_list_returns_empty_when_field_null() -> None:
    client = _client({"data": {"bounties": None}})
    assert await client.graphql.bounties() == []


@pytest.mark.asyncio
async def test_graphql_bare_list_returns_empty_when_renamed() -> None:
    client = _client({"data": {"renamedField": [{"id": 1}]}})
    assert await client.graphql.identities("crypto-1") == []


@pytest.mark.asyncio
async def test_graphql_object_returns_none_when_missing() -> None:
    client = _client({"data": {}})
    assert await client.graphql.profile("@nobody") is None


@pytest.mark.asyncio
async def test_graphql_envelope_returns_none_when_missing() -> None:
    # An envelope field (`{count, jobs}`) returns None rather than raising when
    # the backend omits it.
    client = _client({"data": {}})
    assert await client.graphql.jobs() is None


def test_safe_accessors_coerce() -> None:
    assert as_list(None) == []
    assert as_list("x") == []
    assert as_list([1, 2]) == [1, 2]
    assert list_field({"a": [1]}, "a") == [1]
    assert list_field({"a": None}, "a") == []
    assert list_field(None, "a") == []
    assert field({"a": 1}, "a") == 1
    assert field(None, "a") is None
    assert field("not-a-dict", "a", fallback=5) == 5
    assert as_int("12") == 12
    assert as_int("nope", fallback=-1) == -1
    assert as_int(True) == 0
