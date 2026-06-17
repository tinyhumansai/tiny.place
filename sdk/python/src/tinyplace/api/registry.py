from __future__ import annotations

from typing import Any

from ..auth import sign_fresh_canonical_payload
from ..crypto import canonical_payload
from ..http import HttpClient, encode
from ..signer import Signer
from ..types import Json, JsonDict


class RegistryApi:
    def __init__(self, http: HttpClient, signer: Signer | None = None) -> None:
        self._http = http
        self._signer = signer

    async def register(self, request: JsonDict) -> Json:
        request = {**request, "username": _normalize_handle(str(request["username"]))}
        if self._signer and not request.get("signature"):
            request["signature"] = await sign_fresh_canonical_payload(
                self._signer,
                _registration_signature_payload(request),
            )
        return await self._http.post_public("/registry/names", request)

    async def get(self, name: str) -> Json:
        return await self._http.get(f"/registry/names/{encode(name)}")

    async def export(self, name: str) -> Json:
        return await self._http.get(f"/registry/names/{encode(name)}/export")

    async def update_profile_visibility(self, name: str, update: JsonDict) -> Json:
        if self._signer and not update.get("signature"):
            update = {
                **update,
                "signature": await sign_fresh_canonical_payload(
                    self._signer,
                    canonical_payload(
                        "identity.profile.visibility",
                        {
                            "activity": update.get("activity"),
                            "agentCard": update.get("agentCard"),
                            "attestations": update.get("attestations"),
                            "broadcasts": update.get("broadcasts"),
                            "groups": update.get("groups"),
                            "searchEngineIndexing": update.get("searchEngineIndexing"),
                            "username": name,
                        },
                    ),
                ),
            }
        return await self._http.put_directory_auth(
            f"/registry/names/{encode(name)}/profile-visibility",
            update,
        )

    async def renew(self, name: str, request: JsonDict) -> Json:
        if self._signer and not request.get("signature"):
            request = {
                **request,
                "signature": await sign_fresh_canonical_payload(
                    self._signer,
                    canonical_payload("identity.renew", {"username": name}),
                ),
            }
        return await self._http.post_directory_auth(
            f"/registry/names/{encode(name)}/renew",
            request,
        )

    async def transfer(self, name: str, request: JsonDict) -> Json:
        if self._signer and not request.get("signature"):
            request = {
                **request,
                "signature": await sign_fresh_canonical_payload(
                    self._signer,
                    canonical_payload(
                        "identity.transfer",
                        {
                            "cryptoId": request.get("cryptoId"),
                            "publicKey": request.get("publicKey"),
                            "username": name,
                        },
                    ),
                ),
            }
        return await self._http.post_directory_auth(
            f"/registry/names/{encode(name)}/transfer",
            request,
        )

    async def assign_primary(self, name: str) -> Json:
        return await self._set_primary(name, True)

    async def unassign_primary(self, name: str) -> Json:
        return await self._set_primary(name, False)

    async def claim(self, name: str, request: JsonDict) -> Json:
        if self._signer and not request.get("signature"):
            request = {
                **request,
                "signature": await sign_fresh_canonical_payload(
                    self._signer,
                    canonical_payload(
                        "identity.claim",
                        {
                            "cryptoId": request.get("cryptoId"),
                            "publicKey": request.get("publicKey"),
                            "username": name,
                        },
                    ),
                ),
            }
        return await self._http.post(f"/registry/names/{encode(name)}/claim", request)

    async def create_subname(self, name: str, request: JsonDict) -> Json:
        if self._signer and not request.get("signature"):
            request = {
                **request,
                "signature": await sign_fresh_canonical_payload(
                    self._signer,
                    canonical_payload(
                        "identity.subname.create",
                        {
                            "bio": request.get("bio"),
                            "subname": request.get("subname"),
                            "target": request.get("target"),
                            "username": name,
                        },
                    ),
                ),
            }
        return await self._http.post_directory_auth(
            f"/registry/names/{encode(name)}/subnames",
            request,
        )

    async def delete_subname(self, name: str, subname: str) -> Json:
        headers = {}
        if self._signer:
            headers["X-TinyPlace-Signature"] = await sign_fresh_canonical_payload(
                self._signer,
                canonical_payload("identity.subname.delete", {"subname": subname, "username": name}),
            )
            presented_key = self._http.signing_public_key()
            if presented_key:
                headers["X-TinyPlace-Public-Key"] = presented_key
        return await self._http.delete_public(
            f"/registry/names/{encode(name)}/subnames/{encode(subname)}",
            headers=headers,
        )

    async def _set_primary(self, name: str, primary: bool) -> Json:
        action = "identity.assign" if primary else "identity.unassign"
        body: dict[str, Any] = {}
        if self._signer:
            body["signature"] = await sign_fresh_canonical_payload(
                self._signer,
                canonical_payload(action, {"username": name}),
            )
        suffix = "assign" if primary else "unassign"
        return await self._http.post_directory_auth(f"/registry/names/{encode(name)}/{suffix}", body)


def _normalize_handle(username: str) -> str:
    return username if username.startswith("@") else f"@{username}"


def _registration_signature_payload(request: JsonDict) -> str:
    # Must byte-match the backend's registrationPayload
    # (backend-tinyplace/internal/identity/auth.go): exactly these four fields,
    # no actorType/primary. Both sides serialize canonically (sorted keys, null
    # for absent values), so any extra signed field breaks verification (401).
    return canonical_payload(
        "identity.register",
        {
            "cryptoId": request.get("cryptoId"),
            "paymentMethods": request.get("paymentMethods"),
            "publicKey": request.get("publicKey"),
            "username": request.get("username"),
        },
    )
