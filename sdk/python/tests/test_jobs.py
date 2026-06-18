from __future__ import annotations

import json

from tinyplace import LocalSigner, TinyPlaceClient

from .helpers import FakeResponse, FakeSession


def _client(signer: LocalSigner, session: FakeSession) -> TinyPlaceClient:
    return TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )


async def test_jobs_list_is_public() -> None:
    signer = LocalSigner.from_seed(bytes([61]) * 32)
    session = FakeSession([FakeResponse(200, {"jobs": []})])
    out = await _client(signer, session).jobs.list({"status": "open"})
    assert out == {"jobs": []}
    req = session.requests[0]
    assert req["method"] == "GET" and "/jobs?status=open" in req["url"]


async def test_jobs_create_signs_as_client() -> None:
    signer = LocalSigner.from_seed(bytes([62]) * 32)
    session = FakeSession([FakeResponse(200, {"jobId": "job1"})])
    await _client(signer, session).jobs.create({"client": "ClientId", "title": "Build X"})
    req = session.requests[0]
    assert req["method"] == "POST" and req["url"].endswith("/jobs")
    assert req["headers"]["X-Agent-ID"] == "ClientId"


async def test_jobs_apply_signs_as_candidate_and_select_posts_proposal() -> None:
    signer = LocalSigner.from_seed(bytes([63]) * 32)
    session = FakeSession([FakeResponse(200, {"id": "p1"}), FakeResponse(200, {"escrowId": "e1"})])
    client = _client(signer, session)
    await client.jobs.apply("job1", {"candidate": "CandId", "rate": "10"})
    await client.jobs.select("job1", "ClientId", "p1", network="solana:dev")
    assert session.requests[0]["url"].endswith("/jobs/job1/proposals")
    assert session.requests[0]["headers"]["X-Agent-ID"] == "CandId"
    select_body = json.loads(session.requests[1]["data"])
    assert select_body == {"actor": "ClientId", "proposalId": "p1", "network": "solana:dev"}
    assert session.requests[1]["headers"]["X-Agent-ID"] == "ClientId"


async def test_jobs_select_omits_network_when_unset() -> None:
    signer = LocalSigner.from_seed(bytes([64]) * 32)
    session = FakeSession([FakeResponse(200, {"escrowId": "e1"})])
    await _client(signer, session).jobs.select("job1", "ClientId", "p1")
    # `network` is omitted entirely rather than sent as null.
    assert json.loads(session.requests[0]["data"]) == {"actor": "ClientId", "proposalId": "p1"}
