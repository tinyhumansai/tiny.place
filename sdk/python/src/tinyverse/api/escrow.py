from __future__ import annotations

from typing import Any, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient


class EscrowApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get_auth("/escrow", params)

    async def create(self, request: dict[str, Any]) -> Any:
        return await self._http.post("/escrow", request)

    async def get(self, escrow_id: str) -> Any:
        return await self._http.get_auth(f"/escrow/{url_encode(escrow_id, safe='')}")

    async def accept(self, escrow_id: str) -> Any:
        return await self._http.post(f"/escrow/{url_encode(escrow_id, safe='')}/accept")

    async def deliver(self, escrow_id: str, proof: dict[str, Any]) -> Any:
        return await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/deliver",
            proof,
        )

    async def accept_delivery(self, escrow_id: str) -> Any:
        return await self._http.post(f"/escrow/{url_encode(escrow_id, safe='')}/accept-delivery")

    async def claim_release(self, escrow_id: str) -> Any:
        return await self._http.post(f"/escrow/{url_encode(escrow_id, safe='')}/claim-release")

    async def claim_refund(self, escrow_id: str) -> Any:
        return await self._http.post(f"/escrow/{url_encode(escrow_id, safe='')}/claim-refund")

    async def request_revision(self, escrow_id: str, reason: str) -> Any:
        return await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/request-revision",
            {"reason": reason},
        )

    async def cancel(self, escrow_id: str) -> Any:
        return await self._http.post(f"/escrow/{url_encode(escrow_id, safe='')}/cancel")

    async def extend_deadline(self, escrow_id: str, new_deadline: str) -> Any:
        return await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/extend-deadline",
            {"newDeadline": new_deadline},
        )

    async def approve_extension(self, escrow_id: str) -> Any:
        return await self._http.post(f"/escrow/{url_encode(escrow_id, safe='')}/approve-extension")

    async def open_dispute(self, escrow_id: str, reason: str) -> Any:
        return await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/dispute",
            {"reason": reason},
        )

    async def get_dispute(self, escrow_id: str) -> Any:
        return await self._http.get_auth(f"/escrow/{url_encode(escrow_id, safe='')}/dispute")

    async def submit_evidence(self, escrow_id: str, evidence: dict[str, Any]) -> None:
        await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/dispute/evidence",
            evidence,
        )

    async def accept_mediation(self, escrow_id: str) -> Any:
        return await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/dispute/accept-mediation",
        )

    async def reject_mediation(self, escrow_id: str) -> Any:
        return await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/dispute/reject-mediation",
        )

    async def pay_arbitration(self, escrow_id: str, amount: str) -> Any:
        return await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/dispute/pay-arbitration",
            {"amount": amount},
        )

    async def vote_arbitration(self, escrow_id: str, vote: dict[str, Any]) -> None:
        await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/dispute/vote",
            vote,
        )

    async def deliver_milestone(
        self,
        escrow_id: str,
        milestone_id: str,
        proof: dict[str, Any],
    ) -> Any:
        return await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/milestones/{url_encode(milestone_id, safe='')}/deliver",
            proof,
        )

    async def accept_milestone_delivery(self, escrow_id: str, milestone_id: str) -> Any:
        return await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/milestones/{url_encode(milestone_id, safe='')}/accept-delivery",
        )

    async def request_milestone_revision(
        self,
        escrow_id: str,
        milestone_id: str,
        reason: str,
    ) -> Any:
        return await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/milestones/{url_encode(milestone_id, safe='')}/request-revision",
            {"reason": reason},
        )

    async def dispute_milestone(
        self,
        escrow_id: str,
        milestone_id: str,
        reason: str,
    ) -> Any:
        return await self._http.post(
            f"/escrow/{url_encode(escrow_id, safe='')}/milestones/{url_encode(milestone_id, safe='')}/dispute",
            {"reason": reason},
        )
