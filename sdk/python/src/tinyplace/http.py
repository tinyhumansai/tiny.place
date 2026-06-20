from __future__ import annotations

import asyncio
import base64
import json
import random
from dataclasses import dataclass
from typing import Any, Awaitable, Callable
from urllib.parse import quote, urlencode

import aiohttp

from .auth import AdminSigningOptions, sign_admin_request, sign_directory_write, sign_request
from .signer import Signer
from .types import Headers, Json, JsonDict, Query

AuthInvalidHook = Callable[[int, Json], None]

#: Default per-request timeout in seconds when none is configured.
DEFAULT_TIMEOUT = 30.0


@dataclass(frozen=True)
class RetryOptions:
    """Controls automatic retry-with-backoff for transient failures.

    To avoid silently duplicating a write, only idempotent methods are retried
    by default.
    """

    #: Max retry attempts after the first try. ``0`` disables retries.
    retries: int = 2
    #: Base backoff delay in seconds (exponential, with jitter).
    base_delay: float = 0.2
    #: Upper bound on a single backoff delay in seconds.
    max_delay: float = 5.0
    #: HTTP statuses treated as transient.
    retryable_statuses: frozenset[int] = frozenset({408, 429, 500, 502, 503, 504})
    #: HTTP methods eligible for retry (idempotent reads only by default).
    retry_methods: frozenset[str] = frozenset({"GET", "HEAD", "OPTIONS"})
    #: Retry connection-level failures (timeout, refused, DNS) for eligible methods.
    retry_network_errors: bool = True


def _backoff_delay(retry: RetryOptions, attempt: int) -> float:
    """Exponential backoff (capped) with half jitter for ``attempt``."""
    ceiling = min(retry.max_delay, retry.base_delay * (2**attempt))
    half = ceiling / 2
    return half + random.random() * half


def _retry_after_delay(response: Any) -> float | None:
    """Parse a ``Retry-After`` header (delta-seconds form) into seconds."""
    headers = getattr(response, "headers", None) or {}
    value = headers.get("Retry-After") or headers.get("retry-after")
    if not value:
        return None
    try:
        return max(0.0, float(str(value).strip()))
    except ValueError:
        return None


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
        timeout: float | None = None,
        retry: RetryOptions | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.signer = signer
        self.public_key_base64 = signer.public_key_base64 if signer else None
        self.admin_signer = admin_signer
        self.admin = admin or AdminSigningOptions()
        self._session = session
        self._owns_session = session is None
        self._on_auth_invalid = on_auth_invalid
        self._timeout = DEFAULT_TIMEOUT if timeout is None else timeout
        self._retry = retry or RetryOptions()

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

    async def get_directory_auth(
        self, path: str, query: Query = None, headers: Headers | None = None
    ) -> Json:
        return await self._request("GET", path, query=query, auth="directory", headers=headers)

    async def get_directory_auth_as(
        self, path: str, actor: str, query: Query = None, headers: Headers | None = None
    ) -> Json:
        return await self._request(
            "GET", path, query=query, auth="directory", actor=actor, headers=headers
        )

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

    async def graphql(
        self,
        query: str,
        variables: Json = None,
        *,
        auth: str | None = None,
        operation_name: str | None = None,
    ) -> Json:
        """POST a query to the read-only ``/graphql`` gateway and unwrap the envelope.

        Returns ``body["data"]`` on success. If the response carries top-level
        ``errors``, raises :class:`TinyPlaceError` with the joined error messages.
        Pass ``auth="agent"`` for operations that require the signing agent
        (e.g. ``homeFeed``); everything else is public.
        """
        body: JsonDict = {"query": query}
        if variables is not None:
            body["variables"] = variables
        if operation_name is not None:
            body["operationName"] = operation_name
        result = await self._request("POST", "/graphql", body=body, auth=auth)
        errors = result.get("errors") if isinstance(result, dict) else None
        if errors:
            message = "; ".join(
                str(error.get("message", error)) if isinstance(error, dict) else str(error)
                for error in errors
            )
            raise TinyPlaceError(200, result, f"GraphQL error: {message}")
        return result.get("data") if isinstance(result, dict) else None

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

        retry = self._retry
        eligible = retry.retries > 0 and method.upper() in retry.retry_methods
        attempt = 0
        while True:
            # Re-sign on every attempt so retries carry a fresh timestamp/nonce
            # and are never rejected as a replay.
            request_headers = {"Content-Type": "application/json", **(headers or {})}
            await self._apply_auth(
                request_headers, auth, method, request_uri, body_text, actor
            )
            session = self._get_session()
            try:
                response = await session.request(
                    method,
                    url,
                    headers=request_headers,
                    data=body_text or None,
                    **self._timeout_kwargs(),
                )
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                # Connection-level failure (timeout, refused, DNS): retry eligible
                # idempotent methods, otherwise surface a typed error so callers
                # see one error type whether or not the backend answered.
                if eligible and attempt < retry.retries and retry.retry_network_errors:
                    await asyncio.sleep(_backoff_delay(retry, attempt))
                    attempt += 1
                    continue
                raise TinyPlaceError(
                    0, str(exc), f"Request to {path} failed: {exc}"
                ) from exc

            if response.status < 200 or response.status >= 300:
                if (
                    eligible
                    and attempt < retry.retries
                    and response.status in retry.retryable_statuses
                ):
                    delay = _retry_after_delay(response) or _backoff_delay(retry, attempt)
                    await asyncio.sleep(delay)
                    attempt += 1
                    continue
                await self._raise_error(path, response)
            break

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

    def _timeout_kwargs(self) -> dict[str, Any]:
        """Per-request timeout kwargs for ``session.request`` (empty if disabled)."""
        if self._timeout and self._timeout > 0:
            return {"timeout": aiohttp.ClientTimeout(total=self._timeout)}
        return {}


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
