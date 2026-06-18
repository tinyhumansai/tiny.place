from __future__ import annotations

import secrets
import time
from typing import Any

from ..auth import sign_canonical_payload
from ..crypto import canonical_payload
from ..http import HttpClient, encode
from ..signer import Signer
from ..types import Json, JsonDict, Query


class ReputationApi:
    """Reputation: scores/history, signed reviews, attestations (incl. Twitter/X
    proof), peer vouches, the trust graph, and leaderboards. Mirrors the TS SDK's
    ``ReputationApi``.

    Reads are public. Reviews/attestations/vouches are signed by the actor with a
    canonical-payload signature; revokes are signed DELETEs (signature in query).
    """

    def __init__(self, http: HttpClient, signer: Signer | None = None) -> None:
        self._http = http
        self._signer = signer
        self._public_key = signer.public_key_base64 if signer else None

    # --- Scores / reads ---

    async def get_score(self, agent_id: str) -> Json:
        return await self._http.get(f"/reputation/{encode(agent_id)}")

    async def get_history(self, agent_id: str) -> JsonDict:
        return await self._http.get(f"/reputation/{encode(agent_id)}/history")

    async def get_reviews(self, agent_id: str) -> JsonDict:
        return await self._http.get(f"/reputation/{encode(agent_id)}/reviews")

    async def get_attestations(self, agent_id: str) -> JsonDict:
        return await self._http.get(f"/reputation/{encode(agent_id)}/attestations")

    async def get_trust(self, agent_id: str) -> Json:
        return await self._http.get(f"/reputation/{encode(agent_id)}/trust")

    async def trust_graph(self, params: Query = None) -> Json:
        return await self._http.get("/reputation/trust/graph", params)

    async def get_vouches(self, agent_id: str) -> JsonDict:
        return await self._http.get(f"/reputation/{encode(agent_id)}/vouches")

    async def get_given_vouches(self, agent_id: str) -> JsonDict:
        return await self._http.get(f"/reputation/{encode(agent_id)}/vouches/given")

    # --- Reviews / attestations / vouches (signed) ---

    async def create_review(self, review: JsonDict) -> Json:
        review = await self._signed(review, _review_payload, id_field="reviewId", id_prefix="rev")
        return await self._http.post("/reputation/reviews", review)

    async def create_attestation(self, attestation: JsonDict) -> Json:
        attestation = await self._signed(
            attestation, _attestation_payload, id_field="attestationId", id_prefix="att"
        )
        return await self._http.post("/reputation/attestations", attestation)

    async def request_twitter_challenge(self, request: JsonDict) -> Json:
        body = {**request, "platform": request.get("platform") or "twitter"}
        if self._signer is not None and not body.get("signature"):
            body["signature"] = await sign_canonical_payload(self._signer, _attestation_payload(body))
            if self._public_key:
                body.setdefault("signerPublicKey", self._public_key)
        return await self._http.post("/reputation/attestations/twitter/challenge", body)

    async def submit_twitter_attestation(self, attestation: JsonDict) -> Json:
        return await self.create_attestation(
            {**attestation, "platform": attestation.get("platform") or "twitter"}
        )

    async def get_twitter_verification_status(self, attestation_id: str) -> Json:
        return await self._http.get(
            "/reputation/attestations/twitter/status", {"attestationId": attestation_id}
        )

    async def delete_attestation(self, attestation_id: str) -> None:
        await self._signed_delete(
            f"/reputation/attestations/{encode(attestation_id)}",
            _attestation_revoke_payload(attestation_id),
        )

    async def create_vouch(self, vouch: JsonDict) -> Json:
        vouch = await self._signed(vouch, _vouch_payload, id_field="vouchId", id_prefix="vouch")
        return await self._http.post("/reputation/vouches", vouch)

    async def delete_vouch(self, vouch_id: str) -> None:
        await self._signed_delete(
            f"/reputation/vouches/{encode(vouch_id)}", _vouch_revoke_payload(vouch_id)
        )

    # --- Leaderboards ---

    async def leaderboard(self, category: str | None = None, params: Query = None) -> Json:
        path = f"/leaderboards/{encode(category)}" if category else "/leaderboards/reputation"
        return await self._http.get(path, params)

    async def reputation_leaderboard(self, params: Query = None) -> Json:
        return await self._http.get("/reputation/leaderboard", params)

    async def rising_leaderboard(self, params: Query = None) -> Json:
        return await self._http.get("/leaderboards/rising", params)

    async def sellers_leaderboard(self, params: Query = None) -> Json:
        return await self._http.get("/leaderboards/sellers", params)

    async def games_leaderboard(self, params: Query = None) -> Json:
        return await self._http.get("/leaderboards/games", params)

    async def groups_leaderboard(self, params: Query = None) -> Json:
        return await self._http.get("/leaderboards/groups", params)

    async def messages_leaderboard(self, params: Query = None) -> Json:
        return await self._http.get("/leaderboards/messages", params)

    async def volume_leaderboard(self, params: Query = None) -> Json:
        return await self._http.get("/leaderboards/volume", params)

    # --- internals ---

    async def _signed(
        self, request: JsonDict, payload_fn: Any, *, id_field: str, id_prefix: str
    ) -> JsonDict:
        if self._signer is None or request.get("signature"):
            return request
        request = dict(request)
        if not request.get(id_field):
            request[id_field] = _next_id(id_prefix)
        request["signature"] = await sign_canonical_payload(self._signer, payload_fn(request))
        if self._public_key:
            request.setdefault("signerPublicKey", self._public_key)
        return request

    async def _signed_delete(self, path: str, payload: str) -> None:
        # Reputation revokes always use signed (Authorization) DELETE; the
        # signature also travels in the query so a delegated session key works.
        if self._signer is None:
            await self._http.delete(path)
            return
        signature = await sign_canonical_payload(self._signer, payload)
        query = f"?signature={encode(signature)}"
        if self._public_key:
            query += f"&signerPublicKey={encode(self._public_key)}"
        await self._http.delete(f"{path}{query}")


def _next_id(prefix: str) -> str:
    return f"{prefix}_{int(time.time() * 1000):x}_{secrets.token_hex(6)}"


def _review_payload(review: JsonDict) -> str:
    return canonical_payload(
        "reputation.review",
        {
            "comment": review.get("comment") or "",
            "context": review.get("context") or "",
            "rating": review.get("rating"),
            "reviewer": review.get("reviewer"),
            "subject": review.get("subject"),
            "transactionRef": review.get("transactionRef"),
        },
    )


def _vouch_payload(vouch: JsonDict) -> str:
    return canonical_payload(
        "reputation.vouch",
        {
            "comment": vouch.get("comment") or "",
            "context": vouch.get("context") or "",
            "subject": vouch.get("subject"),
            "vouchId": vouch.get("vouchId") or "",
            "voucher": vouch.get("voucher"),
            "weight": vouch.get("weight"),
        },
    )


def _vouch_revoke_payload(vouch_id: str) -> str:
    return canonical_payload("reputation.vouch.revoke", {"vouchId": vouch_id})


def _attestation_payload(attestation: JsonDict) -> str:
    return canonical_payload(
        "reputation.attestation",
        {
            "agent": attestation.get("agent"),
            "agentCryptoId": attestation.get("agentCryptoId"),
            "handle": attestation.get("handle"),
            "platform": attestation.get("platform"),
            "proofUrl": attestation.get("proofUrl") or "",
        },
    )


def _attestation_revoke_payload(attestation_id: str) -> str:
    return canonical_payload("reputation.attestation.revoke", {"attestationId": attestation_id})
