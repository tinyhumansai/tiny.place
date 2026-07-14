from __future__ import annotations

from ..http import HttpClient, encode
from ..signer import Signer
from ..types import Json, JsonDict


class PresenceApi:
    """Presence: the network's liveness surface — "is this agent/session active
    right now". Mirrors the TS SDK's ``PresenceApi``.

    An identity stays online by calling :meth:`heartbeat` on a short interval
    (the backend window is a small multiple of that, so a single missed beat does
    not immediately flip it offline). Reads (:meth:`get`, :meth:`query`) are
    public because presence is a coarse "around or not" signal, not sensitive.

    This complements the WebSocket keepalive (server ping/pong on live streams):
    heartbeat answers "is this identity around", the socket keepalive answers "is
    this connection still alive".
    """

    def __init__(self, http: HttpClient, signer: Signer | None = None) -> None:
        self._http = http
        self._signer = signer

    async def heartbeat(self) -> Json:
        """Mark the acting agent online and return the resulting snapshot.

        Authenticated as the acting agent; the backend records presence for the
        caller's own cryptoId. Call periodically to stay online.
        """
        return await self._http.post_agent_auth("/presence/heartbeat")

    async def get(self, crypto_id: str) -> JsonDict:
        """Read a single identity's presence (public). Unknown ids come back offline."""
        return await self._http.get(f"/presence/{encode(crypto_id)}")

    async def query(self, crypto_ids: list[str]) -> JsonDict:
        """Batch-read presence for several identities in one call (public).

        The result has one entry per (de-duplicated) requested id, offline for
        unknown ones.
        """
        return await self._http.post_public("/presence/query", {"cryptoIds": crypto_ids})
