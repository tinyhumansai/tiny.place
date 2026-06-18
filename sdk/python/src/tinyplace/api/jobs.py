from __future__ import annotations

from ..http import HttpClient, encode
from ..types import Json, JsonDict, Query


class JobsApi:
    """The jobs marketplace: post + browse, apply, candidate selection (which
    spawns an escrow contract), and the AI-judged dispute flow. Mirrors the TS
    SDK's ``JobsApi``. Mutations are directory-signed on behalf of the named
    actor (client/candidate).
    """

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    # --- Postings ---

    async def list(self, params: Query = None) -> JsonDict:
        return await self._http.get("/jobs", params)

    async def get(self, job_id: str) -> Json:
        return await self._http.get(f"/jobs/{encode(job_id)}")

    async def create(self, request: JsonDict) -> Json:
        return await self._http.post_directory_auth_as(
            "/jobs", str(request["client"]), request
        )

    async def cancel(self, job_id: str, actor: str) -> Json:
        return await self._http.post_directory_auth_as(
            f"/jobs/{encode(job_id)}/cancel", actor, {"actor": actor}
        )

    # --- Proposals ---

    async def apply(self, job_id: str, request: JsonDict) -> Json:
        return await self._http.post_directory_auth_as(
            f"/jobs/{encode(job_id)}/proposals", str(request["candidate"]), request
        )

    async def list_proposals(self, job_id: str, client: str, params: Query = None) -> JsonDict:
        return await self._http.get_directory_auth_as(
            f"/jobs/{encode(job_id)}/proposals", client, params
        )

    async def get_proposal(self, job_id: str, proposal_id: str, actor: str) -> Json:
        return await self._http.get_directory_auth_as(
            f"/jobs/{encode(job_id)}/proposals/{encode(proposal_id)}", actor
        )

    async def shortlist_proposal(self, job_id: str, proposal_id: str, client: str) -> Json:
        return await self._http.post_directory_auth_as(
            f"/jobs/{encode(job_id)}/proposals/{encode(proposal_id)}/shortlist",
            client,
            {"actor": client},
        )

    async def withdraw_proposal(self, job_id: str, proposal_id: str, candidate: str) -> Json:
        return await self._http.post_directory_auth_as(
            f"/jobs/{encode(job_id)}/proposals/{encode(proposal_id)}/withdraw",
            candidate,
            {"actor": candidate},
        )

    # --- Selection (spawns the escrow contract) ---

    async def select(
        self, job_id: str, client: str, proposal_id: str, network: str | None = None
    ) -> Json:
        # Omit `network` when unset rather than sending JSON null for the
        # optional field.
        payload: JsonDict = {"actor": client, "proposalId": proposal_id}
        if network is not None:
            payload["network"] = network
        return await self._http.post_directory_auth_as(
            f"/jobs/{encode(job_id)}/select", client, payload
        )

    # --- Disputes (AI judge panel) ---

    async def open_dispute(self, job_id: str, actor: str, reason: str) -> Json:
        return await self._http.post_directory_auth_as(
            f"/jobs/{encode(job_id)}/dispute", actor, {"actor": actor, "reason": reason}
        )

    async def adjudicate_dispute(self, job_id: str, actor: str) -> Json:
        return await self._http.post_directory_auth_as(
            f"/jobs/{encode(job_id)}/dispute/adjudicate", actor, {"actor": actor}
        )
