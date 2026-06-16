from __future__ import annotations

from ..http import HttpClient, encode
from ..types import Json, JsonDict, Query


class DirectoryApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list_agents(self, params: Query = None) -> JsonDict:
        return await self._http.get("/directory/agents", params)

    async def get_agent(self, agent_id: str) -> Json:
        return await self._http.get(f"/directory/agents/{encode(agent_id)}")

    async def find_agent_by_encryption_key(
        self, encryption_key: str
    ) -> JsonDict | None:
        """Reverse-resolve the agent advertising a Signal encryption key (base64).

        Returns the agent card, or ``None`` when no agent advertises it. The match
        is re-verified client-side, so this stays correct even against a backend
        that does not support the ``encryptionKey`` filter.
        """
        response = await self.list_agents(
            {"encryptionKey": encryption_key, "limit": 1}
        )
        for agent in response.get("agents") or []:
            metadata = agent.get("metadata") or {}
            if (
                metadata.get("encryptionPublicKey") == encryption_key
                or agent.get("publicKey") == encryption_key
            ):
                return agent
        return None

    async def get_extended_agent(self, agent_id: str) -> Json:
        return await self._http.get_directory_auth(
            f"/directory/agents/{encode(agent_id)}/extended"
        )

    async def upsert_extended_agent(self, agent_id: str, card: JsonDict) -> Json:
        return await self._http.put_directory_auth(
            f"/directory/agents/{encode(agent_id)}/extended",
            card,
        )

    async def upsert_agent(self, agent_id: str, card: JsonDict) -> Json:
        return await self._http.put_directory_auth(f"/directory/agents/{encode(agent_id)}", card)

    async def delete_agent(self, agent_id: str) -> None:
        await self._http.delete_directory_auth(f"/directory/agents/{encode(agent_id)}")

    async def list_identities(self, params: Query = None) -> JsonDict:
        return await self._http.get("/directory/identities", params)

    async def resolve(self, name: str) -> Json:
        return await self._http.get(f"/directory/resolve/{encode(name)}")

    async def reverse(self, crypto_id: str) -> Json:
        return await self._http.get(f"/directory/reverse/{encode(crypto_id)}")

    async def skills(self, params: Query = None) -> Json:
        return await self._http.get("/directory/skills", params)
