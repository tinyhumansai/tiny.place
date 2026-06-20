"""Transport-resilience tests: retry-with-backoff and timeout typing."""

from __future__ import annotations

import asyncio
from typing import Any

import aiohttp
import pytest

from tinyplace import RetryOptions, TinyPlaceClient, TinyPlaceError

from .helpers import FakeResponse, FakeSession


def _client(session: Any, **kw: Any) -> TinyPlaceClient:
    return TinyPlaceClient(
        base_url="https://example.test",
        session=session,
        retry=kw.pop("retry", RetryOptions(base_delay=0.001, max_delay=0.002)),
        **kw,
    )


class RaisingSession:
    """A session whose ``request`` raises, optionally succeeding after N calls."""

    def __init__(self, exc: BaseException, succeed_on: int | None = None) -> None:
        self._exc = exc
        self._succeed_on = succeed_on
        self.calls = 0
        self.closed = False

    async def request(self, *_a: Any, **_k: Any) -> FakeResponse:
        self.calls += 1
        if self._succeed_on is not None and self.calls >= self._succeed_on:
            return FakeResponse(200, {"ok": True})
        raise self._exc

    async def close(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_retries_idempotent_get_on_503_then_succeeds() -> None:
    session = FakeSession(
        [
            FakeResponse(503, "down"),
            FakeResponse(503, "down"),
            FakeResponse(200, {"agents": []}),
        ]
    )
    client = _client(session, retry=RetryOptions(retries=3, base_delay=0.001, max_delay=0.002))
    result = await client.directory.list_agents()
    assert result == {"agents": []}
    assert len(session.requests) == 3


@pytest.mark.asyncio
async def test_gives_up_after_configured_retries() -> None:
    session = FakeSession([FakeResponse(500, "boom") for _ in range(5)])
    client = _client(session, retry=RetryOptions(retries=2, base_delay=0.001, max_delay=0.002))
    with pytest.raises(TinyPlaceError) as info:
        await client.directory.list_agents()
    assert info.value.status == 500
    assert len(session.requests) == 3  # 1 initial + 2 retries


@pytest.mark.asyncio
async def test_does_not_retry_a_non_idempotent_write() -> None:
    session = FakeSession([FakeResponse(503, "down")])
    client = _client(session, retry=RetryOptions(retries=3, base_delay=0.001))
    with pytest.raises(TinyPlaceError) as info:
        # delete_agent issues a DELETE — not in the default retry-eligible set.
        await client.directory.delete_agent("agent-1")
    assert info.value.status == 503
    assert len(session.requests) == 1


@pytest.mark.asyncio
async def test_does_not_retry_a_non_transient_status() -> None:
    session = FakeSession([FakeResponse(404, "nope")])
    client = _client(session, retry=RetryOptions(retries=3, base_delay=0.001))
    with pytest.raises(TinyPlaceError) as info:
        await client.directory.list_agents()
    assert info.value.status == 404
    assert len(session.requests) == 1


@pytest.mark.asyncio
async def test_network_error_surfaces_as_typed_error_after_retries() -> None:
    session = RaisingSession(aiohttp.ClientConnectionError("refused"))
    client = _client(session, retry=RetryOptions(retries=2, base_delay=0.001, max_delay=0.002))
    with pytest.raises(TinyPlaceError) as info:
        await client.directory.list_agents()
    assert info.value.status == 0
    assert session.calls == 3  # 1 + 2 retries


@pytest.mark.asyncio
async def test_timeout_surfaces_as_typed_error() -> None:
    session = RaisingSession(asyncio.TimeoutError())
    client = _client(
        session, timeout=0.05, retry=RetryOptions(retries=0, base_delay=0.001)
    )
    with pytest.raises(TinyPlaceError) as info:
        await client.directory.list_agents()
    assert info.value.status == 0
    assert session.calls == 1


@pytest.mark.asyncio
async def test_network_error_recovers_when_retry_succeeds() -> None:
    session = RaisingSession(aiohttp.ClientConnectionError("refused"), succeed_on=2)
    client = _client(session, retry=RetryOptions(retries=3, base_delay=0.001, max_delay=0.002))
    result = await client.directory.list_agents()
    assert result == {"ok": True}
    assert session.calls == 2
