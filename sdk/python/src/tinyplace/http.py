from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any, Awaitable, Callable
from urllib.parse import quote, urlencode

import aiohttp

from .auth import AdminSigningOptions, sign_admin_request, sign_directory_write, sign_request
from .signer import Signer
from .types import Headers, Json, Query

AuthInvalidHook = Callable[[int, Json], None]


@dataclass(frozen=True)
class PaymentChallenge:
    scheme: str | None = None
    network: str | None = None
    asset: str | None = None
    amount: str | None = None
    from_: str | None = None
    to: str | None = None
    nonce: str | None = None
    expires_at: str | None = None
    signature: str | None = None
    metadata: dict[str, str] | None = None


@dataclass(frozen=True)
class PaymentRequiredChallenge:
    payment: dict[str, Any]
    error: str | None = None


class TinyPlaceError(Exception):
    def __init__(
        self,
        status: int,
        body: Json,
        message: str | None = None,
        *,
        headers: Headers | None = None,
        payment_required: PaymentRequiredChallenge | None = None,
    ) -> None:
        super().__init__(message or f"HTTP {status}")
        self.status = status
        self.body = body
        self.headers = headers or {}
        self.payment_required = payment_required or _payment_required_from_body(body)


class HttpClient:
    def __init__(
        self,
        *,
        base_url: str,
        signer: Signer | None = None,
        admin_signer: Signer | None = None,
        admin: AdminSigningOptions | None = None,
        session: aiohttp.ClientSession | None = None,
        on_auth_invalid: AuthInvalidHook | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.signer = signer
        self.public_key_base64 = signer.public_key_base64 if signer else None
        self.admin_signer = admin_signer
        self.admin = admin or AdminSigningOptions()
        self._session = session
        self._owns_session = session is None
        self._on_auth_invalid = on_auth_invalid

    async def close(self) -> None:
        if self._session and self._owns_session:
            await self._session.close()
        self._session = None

    def signing_public_key(self) -> str | None:
        return self.public_key_base64

    async def get(self, path: str, query: Query = None) -> Json:
        return await self._request("GET", path, query=query)

    async def get_auth(self, path: str, query: Query = None) -> Json:
        return await self._request("GET", path, query=query, auth="signed")

    async def get_admin(self, path: str, query: Query = None) -> Json:
        return await self._request("GET", path, query=query, auth="admin")

    async def get_text(self, path: str, query: Query = None) -> str:
        return await self._request("GET", path, query=query, response_type="text")

    async def get_directory_auth(self, path: str, query: Query = None) -> Json:
        return await self._request("GET", path, query=query, auth="directory")

    async def get_directory_auth_as(self, path: str, actor: str, query: Query = None) -> Json:
        return await self._request("GET", path, query=query, auth="directory", actor=actor)

    async def get_agent_auth(self, path: str, query: Query = None) -> Json:
        return await self._request("GET", path, query=query, auth="agent")

    async def post(self, path: str, body: Json = None) -> Json:
        return await self._request("POST", path, body=body, auth="signed")

    async def post_public(self, path: str, body: Json = None) -> Json:
        return await self._request("POST", path, body=body)

    async def post_admin(self, path: str, body: Json = None) -> Json:
        return await self._request("POST", path, body=body, auth="admin")

    async def post_agent_auth(self, path: str, body: Json = None) -> Json:
        return await self._request("POST", path, body=body, auth="agent")

    async def post_directory_auth(self, path: str, body: Json = None) -> Json:
        return await self._request("POST", path, body=body, auth="directory")

    async def post_directory_auth_as(self, path: str, actor: str, body: Json = None) -> Json:
        return await self._request("POST", path, body=body, auth="directory", actor=actor)

    async def put(self, path: str, body: Json = None) -> Json:
        return await self._request("PUT", path, body=body, auth="signed")

    async def put_directory_auth(self, path: str, body: Json = None) -> Json:
        return await self._request("PUT", path, body=body, auth="directory")

    async def put_directory_auth_as(self, path: str, actor: str, body: Json = None) -> Json:
        return await self._request("PUT", path, body=body, auth="directory", actor=actor)

    async def put_agent_auth(self, path: str, body: Json = None) -> Json:
        return await self._request("PUT", path, body=body, auth="agent")

    async def delete(self, path: str, body: Json = None) -> Json:
        return await self._request("DELETE", path, body=body, auth="signed")

    async def delete_public(
        self,
        path: str,
        body: Json = None,
        headers: Headers | None = None,
    ) -> Json:
        return await self._request("DELETE", path, body=body, headers=headers)

    async def delete_directory_auth(self, path: str, body: Json = None) -> Json:
        return await self._request("DELETE", path, body=body, auth="directory")

    async def delete_directory_auth_as(self, path: str, actor: str, body: Json = None) -> Json:
        return await self._request("DELETE", path, body=body, auth="directory", actor=actor)

    async def delete_agent_auth(self, path: str, body: Json = None) -> Json:
        return await self._request("DELETE", path, body=body, auth="agent")

    async def _request(
        self,
        method: str,
        path: str,
        *,
        query: Query = None,
        body: Json = None,
        auth: str | None = None,
        actor: str | None = None,
        headers: Headers | None = None,
        response_type: str = "json",
    ) -> Json:
        query_string = _build_query(query)
        request_uri = f"{path}{query_string}"
        url = f"{self.base_url}{request_uri}"
        body_text = "" if body is None else json.dumps(body, separators=(",", ":"))
        request_headers = {"Content-Type": "application/json", **(headers or {})}

        await self._apply_auth(request_headers, auth, method, request_uri, body_text, actor)
        session = self._get_session()
        response = await session.request(
            method,
            url,
            headers=request_headers,
            data=body_text or None,
        )

        if response.status < 200 or response.status >= 300:
            await self._raise_error(path, response)

        if response.status == 204:
            return None
        if response_type == "raw":
            return response
        if response_type == "text":
            return await response.text()
        text = await response.text()
        return None if text == "" else json.loads(text)

    async def _apply_auth(
        self,
        headers: Headers,
        auth: str | None,
        method: str,
        request_uri: str,
        body: str,
        actor: str | None,
    ) -> None:
        if auth == "admin" and self.admin_signer:
            headers.update(
                await sign_admin_request(self.admin_signer, method, request_uri, body, self.admin)
            )
        elif auth in ("directory", "agent") and self.signer and self.public_key_base64:
            headers.update(
                await sign_directory_write(
                    self.signer,
                    self.public_key_base64,
                    method,
                    request_uri,
                    body,
                )
            )
            headers["X-Agent-ID"] = self.signer.agent_id if auth == "agent" else actor or self.public_key_base64
        elif auth == "signed" and self.signer:
            headers.update(await sign_request(self.signer, body))

    async def _raise_error(self, path: str, response: Any) -> None:
        text = await response.text()
        try:
            body = json.loads(text)
        except json.JSONDecodeError:
            body = text
        headers = {str(k): str(v) for k, v in getattr(response, "headers", {}).items()}
        if response.status in (401, 403) and self._on_auth_invalid:
            self._on_auth_invalid(response.status, body)
        raise TinyPlaceError(
            response.status,
            body,
            f"HTTP {response.status}: {path}",
            headers=headers,
            payment_required=_payment_required_from_header(headers),
        )

    def _get_session(self) -> Any:
        if self._session is None:
            self._session = aiohttp.ClientSession()
        return self._session


def encode(value: str) -> str:
    return quote(value, safe="")


def _build_query(query: Query) -> str:
    if not query:
        return ""
    pairs: list[tuple[str, str]] = []
    for key, value in query.items():
        if value is None:
            continue
        if isinstance(value, list):
            pairs.extend((key, str(item)) for item in value)
        else:
            pairs.append((key, str(value)))
    return f"?{urlencode(pairs)}" if pairs else ""


def _payment_required_from_body(body: Json) -> PaymentRequiredChallenge | None:
    if isinstance(body, dict) and isinstance(body.get("payment"), dict):
        return PaymentRequiredChallenge(error=body.get("error"), payment=body["payment"])
    return None


def _payment_required_from_header(headers: Headers) -> PaymentRequiredChallenge | None:
    value = headers.get("X-Payment-Required") or headers.get("x-payment-required")
    if not value:
        return None
    parsed = _decode_payment_header(value)
    if isinstance(parsed, dict) and isinstance(parsed.get("payment"), dict):
        return PaymentRequiredChallenge(error=parsed.get("error"), payment=parsed["payment"])
    return None


def _decode_payment_header(value: str) -> Any:
    """Decode an ``X-Payment-Required`` header to its JSON object.

    The backend sends base64url-encoded JSON (matching the TS SDK's
    ``base64UrlDecode`` + ``JSON.parse``); fall back to raw JSON for resilience.
    """
    try:
        padded = value + "=" * (-len(value) % 4)
        return json.loads(base64.urlsafe_b64decode(padded))
    except (ValueError, json.JSONDecodeError):
        pass
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None
