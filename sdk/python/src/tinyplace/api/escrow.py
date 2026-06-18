from __future__ import annotations

from typing import Any

from ..http import HttpClient, encode
from ..types import Json, JsonDict, Query


class EscrowApi:
    """Job escrow lifecycle: create, accept, deliver, accept-delivery, claim,
    revisions, deadline extensions, disputes (mediation/arbitration) and
    milestones. Mirrors the TS SDK's ``EscrowApi``.

    Reads use signed (own) auth. Mutations are signed on behalf of ``actor`` when
    given (directory auth as that agent), else as the configured signer.
    """

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, params: Query = None) -> JsonDict:
        return await self._http.get_auth("/escrow", params)

    async def create(self, request: JsonDict) -> Json:
        return await self._http.post_directory_auth_as(
            "/escrow", str(request["client"]), request
        )

    async def get(self, escrow_id: str) -> Json:
        return await self._http.get_auth(f"/escrow/{encode(escrow_id)}")

    async def accept(self, escrow_id: str, actor: str | None = None) -> Json:
        return await self._post_actor(f"/escrow/{encode(escrow_id)}/accept", actor)

    async def deliver(self, escrow_id: str, proof: JsonDict) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/deliver", proof.get("actor"), proof
        )

    async def accept_delivery(
        self, escrow_id: str, actor: str | None = None, on_chain_tx: str | None = None
    ) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/accept-delivery",
            actor,
            {"onChainTx": on_chain_tx} if on_chain_tx else None,
        )

    async def claim_release(
        self, escrow_id: str, actor: str | None = None, on_chain_tx: str | None = None
    ) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/claim-release",
            actor,
            {"onChainTx": on_chain_tx} if on_chain_tx else None,
        )

    async def claim_refund(
        self, escrow_id: str, actor: str | None = None, on_chain_tx: str | None = None
    ) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/claim-refund",
            actor,
            {"onChainTx": on_chain_tx} if on_chain_tx else None,
        )

    async def request_revision(self, escrow_id: str, reason: str, actor: str | None = None) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/request-revision", actor, {"reason": reason}
        )

    async def cancel(
        self, escrow_id: str, actor: str | None = None, on_chain_tx: str | None = None
    ) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/cancel",
            actor,
            {"onChainTx": on_chain_tx} if on_chain_tx else None,
        )

    async def extend_deadline(self, escrow_id: str, new_deadline: str, actor: str | None = None) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/extend-deadline", actor, {"deadline": new_deadline}
        )

    async def approve_extension(self, escrow_id: str, actor: str | None = None) -> Json:
        return await self._post_actor(f"/escrow/{encode(escrow_id)}/approve-extension", actor)

    # --- Disputes ---

    async def open_dispute(self, escrow_id: str, reason: str, actor: str | None = None) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/dispute", actor, {"reason": reason}
        )

    async def get_dispute(self, escrow_id: str) -> Json:
        return await self._http.get_auth(f"/escrow/{encode(escrow_id)}/dispute")

    async def submit_evidence(self, escrow_id: str, evidence: JsonDict) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/dispute/evidence", evidence.get("actor"), evidence
        )

    async def accept_mediation(self, escrow_id: str, actor: str | None = None) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/dispute/accept-mediation", actor
        )

    async def reject_mediation(self, escrow_id: str, actor: str | None = None) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/dispute/reject-mediation", actor
        )

    async def pay_arbitration(self, escrow_id: str, on_chain_tx: str, actor: str | None = None) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/dispute/pay-arbitration", actor, {"onChainTx": on_chain_tx}
        )

    async def vote_arbitration(self, escrow_id: str, vote: JsonDict) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/dispute/vote",
            vote.get("actor") or vote.get("councilMember"),
            vote,
        )

    # --- Milestones ---

    async def deliver_milestone(self, escrow_id: str, milestone_id: str, proof: JsonDict) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/milestones/{encode(milestone_id)}/deliver",
            proof.get("actor"),
            proof,
        )

    async def accept_milestone_delivery(
        self, escrow_id: str, milestone_id: str, actor: str | None = None, on_chain_tx: str | None = None
    ) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/milestones/{encode(milestone_id)}/accept-delivery",
            actor,
            {"onChainTx": on_chain_tx} if on_chain_tx else None,
        )

    async def request_milestone_revision(
        self, escrow_id: str, milestone_id: str, reason: str, actor: str | None = None
    ) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/milestones/{encode(milestone_id)}/request-revision",
            actor,
            {"reason": reason},
        )

    async def dispute_milestone(
        self, escrow_id: str, milestone_id: str, reason: str, actor: str | None = None
    ) -> Json:
        return await self._post_actor(
            f"/escrow/{encode(escrow_id)}/milestones/{encode(milestone_id)}/dispute",
            actor,
            {"reason": reason},
        )

    async def _post_actor(
        self, path: str, actor: Any, body: JsonDict | None = None
    ) -> Json:
        # `actor is None` means "act as the configured signer" (signed-self). An
        # explicit empty string is rejected rather than silently switching the
        # auth principal to the signer.
        if actor is not None:
            actor_id = str(actor)
            if actor_id == "":
                raise ValueError("actor must be a non-empty string when provided")
            return await self._http.post_directory_auth_as(
                path, actor_id, {**(body or {}), "actor": actor_id}
            )
        return await self._http.post(path, body)
