"""Hermes tool handlers wrapping the tiny.place Python SDK.

Every handler follows the Hermes contract strictly:

* signature ``def handler(args: dict, **kwargs) -> str`` (accepts ``**kwargs``),
* ALWAYS returns a JSON string (``json.dumps``),
* NEVER raises — all exceptions are caught and returned as an error JSON.

Handlers are thin: they marshal args, drive the long-lived runtime
(:mod:`.runtime`) which owns the SDK client + Signal session, and shape the
result. No SDK/Signal logic is reimplemented here.
"""

from __future__ import annotations

import json
from typing import Any, Callable

from ._sdk import sdk_import
from .runtime import TinyPlaceRuntime, get_runtime

TinyPlaceError = sdk_import("http").TinyPlaceError
_decode_agent_address = sdk_import("api.messages").decode_agent_address

# Agent-card metadata key the directory advertises the messaging key under
# (mirrors website/src/common/encryption-discovery.ts).
_ENCRYPTION_PUBLIC_KEY_METADATA = "encryptionPublicKey"


def _ok(data: dict[str, Any]) -> str:
    return json.dumps({"ok": True, **data})


def _error(message: str, **extra: Any) -> str:
    return json.dumps({"ok": False, "error": message, **extra})


def _tinyplace_error(exc: TinyPlaceError) -> str:
    """Render a :class:`TinyPlaceError` as actionable error JSON.

    Surfaces 402 payment challenges, auth failures and rate limits distinctly
    so the model can react (e.g. settle a payment, re-check the key).
    """
    payload: dict[str, Any] = {
        "error": str(exc),
        "status": exc.status,
        "body": exc.body if _json_safe(exc.body) else str(exc.body),
    }
    if exc.payment_required is not None:
        payload["payment_required"] = {
            "error": exc.payment_required.error,
            "payment": exc.payment_required.payment,
        }
        payload["hint"] = (
            "Registration requires an x402 payment; settle the challenge in "
            "'payment_required.payment' and retry."
        )
    elif exc.status in (401, 403):
        payload["hint"] = (
            "Authentication failed — check that TINYPLACE_AGENT_KEY is the "
            "correct signing key for this agent."
        )
    elif exc.status == 429:
        payload["hint"] = "Rate limited by the backend — retry after a short delay."
    return json.dumps({"ok": False, **payload})


def _json_safe(value: Any) -> bool:
    try:
        json.dumps(value)
        return True
    except (TypeError, ValueError):
        return False


def _runtime(kwargs: dict[str, Any]) -> TinyPlaceRuntime:
    """Resolve the runtime — overridable via kwargs for tests."""
    override = kwargs.get("runtime")
    if isinstance(override, TinyPlaceRuntime):
        return override
    return get_runtime()


def _guard(fn: Callable[[dict[str, Any], dict[str, Any]], str]) -> Callable[..., str]:
    """Wrap a handler so it never raises and always returns JSON.

    Resolves the runtime once (surfacing config errors as JSON) and dispatches
    ``TinyPlaceError`` through the actionable renderer.
    """

    def handler(args: dict[str, Any], **kwargs: Any) -> str:
        args = args or {}
        try:
            runtime = _runtime(kwargs)
        except Exception as exc:  # noqa: BLE001 - config/setup failures must be JSON
            return _error(f"tiny.place plugin is not configured: {exc}")
        try:
            return fn(args, {"runtime": runtime})
        except TinyPlaceError as exc:
            return _tinyplace_error(exc)
        except Exception as exc:  # noqa: BLE001 - never raise out of a handler
            return _error(f"{type(exc).__name__}: {exc}")

    return handler


# --- handlers ---------------------------------------------------------------


@_guard
def poll_inbox(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]

    async def _run() -> list[dict[str, Any]]:
        await runtime.ensure_messaging_keys()
        client = await runtime.get_client()
        session = await runtime.get_session()
        # Acknowledge each message after decryption so the relay drops it: the
        # Double Ratchet advances per message and cannot re-decrypt an already
        # consumed one, so leaving messages on the relay would make every poll
        # re-fetch and fail to re-decrypt them. The model receives the returned
        # plaintext synchronously, so this is the durable hand-off point. The
        # persisted cursor below is a secondary guard against a transient ack
        # failure re-surfacing a message.
        messages = await client.messages.poll_inbox_decrypted(
            session, runtime.address, acknowledge=True
        )
        return messages

    decrypted = runtime.run(_run())

    cursor = runtime.read_cursor()
    new_messages = []
    max_key: tuple[str, str] | None = _parse_cursor(cursor)
    for message in decrypted:
        key = (message.timestamp, message.id)
        if max_key is not None and key <= max_key:
            continue
        new_messages.append(message)

    # Return every decrypted message: poll_inbox_decrypted has already
    # acknowledged the whole mailbox and the Double Ratchet consumes each
    # message exactly once, so dropping any here (e.g. via a `limit` slice)
    # would lose it permanently — it can neither be re-fetched nor re-decrypted.
    new_messages.sort(key=lambda m: (m.timestamp, m.id))

    if new_messages:
        last = new_messages[-1]
        runtime.write_cursor(f"{last.timestamp}|{last.id}")

    rendered = [
        {
            "id": m.id,
            "from": m.sender,
            "text": _decode_text(m.plaintext),
            "timestamp": m.timestamp,
        }
        for m in new_messages
    ]
    return _ok({"messages": rendered, "count": len(rendered)})


@_guard
def send_message(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    to = str(args.get("to") or "").strip()
    message = args.get("message")
    if not to:
        return _error("'to' is required (a @handle or base64 messaging address)")
    if not isinstance(message, str) or message == "":
        return _error("'message' is required and must be a non-empty string")

    async def _run() -> dict[str, Any]:
        client = await runtime.get_client()
        session = await runtime.get_session()
        address = await _resolve_address(runtime, to)
        result = await client.messages.send_encrypted(
            session,
            runtime.address,
            address,
            message.encode("utf-8"),
        )
        return {"to": to, "address": address, "result": result}

    sent = runtime.run(_run())
    return _ok(sent)


@_guard
def search_domain(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    query = str(args.get("query") or "").strip()
    if not query:
        return _error("'query' is required (the @handle to check)")

    async def _run() -> dict[str, Any]:
        client = await runtime.get_client()
        return await client.search_domain(query)

    return _ok(runtime.run(_run()))


@_guard
def register_domain(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    domain = str(args.get("domain") or "").strip()
    if not domain:
        return _error("'domain' is required (the @handle to register)")
    fields: dict[str, Any] = {}
    actor_type = args.get("actor_type")
    if isinstance(actor_type, str) and actor_type:
        fields["actorType"] = actor_type

    async def _run() -> Any:
        client = await runtime.get_client()
        return await client.register_domain(domain, **fields)

    return _ok({"domain": domain, "record": runtime.run(_run())})


@_guard
def get_identity(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]

    async def _run() -> Any:
        client = await runtime.get_client()
        return await client.get_identity()

    identity = runtime.run(_run())
    return _ok({"identity": identity, "address": runtime.address})


@_guard
def discover_agents(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    params: dict[str, Any] = {}
    query = args.get("query")
    if isinstance(query, str) and query.strip():
        params["q"] = query.strip()
    skill = args.get("skill")
    if isinstance(skill, str) and skill.strip():
        params["skill"] = skill.strip()
    limit = _coerce_limit(args.get("limit"))
    if limit is not None:
        params["limit"] = limit

    async def _run() -> Any:
        client = await runtime.get_client()
        return await client.directory.list_agents(params or None)

    response = runtime.run(_run())
    agents = response.get("agents") if isinstance(response, dict) else None
    summaries = [_agent_summary(a) for a in (agents or []) if isinstance(a, dict)]
    return _ok({"agents": summaries, "count": len(summaries)})


@_guard
def get_agent(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    agent = str(args.get("agent") or "").strip()
    if not agent:
        return _error("'agent' is required (a @handle, username or cryptoId)")

    async def _run() -> Any:
        client = await runtime.get_client()
        # A raw cryptoId addresses the agent card directly; a @handle or bare
        # username goes through resolve_user, which normalizes the handle (adds
        # the leading '@' the directory's /directory/resolve/{name} route
        # expects) and returns the identity record together with the agent card.
        if _is_messaging_address(agent):
            return await client.directory.get_agent(agent)
        return await client.resolve_user(agent)

    result = runtime.run(_run())
    card = _agent_card(result)
    return _ok({"agent": result, "messaging_address": _messaging_address(card)})


@_guard
def search(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    query = str(args.get("query") or "").strip()
    if not query:
        return _error("'query' is required (the free-text search query)")

    async def _run() -> Any:
        client = await runtime.get_client()
        return await client.search.unified(query)

    return _ok({"results": runtime.run(_run())})


# --- helpers ----------------------------------------------------------------


async def _resolve_address(runtime: TinyPlaceRuntime, to: str) -> str:
    """Resolve a recipient ``to`` to its base64 messaging address.

    A raw base64 address is used as-is. A ``@handle`` (or bare handle) is
    resolved through the directory; the messaging address comes from the agent
    card's ``encryptionPublicKey`` metadata, falling back to its ``publicKey``
    (single-key agents). Mirrors website/src/common/encryption-discovery.ts.
    """
    if not to.startswith("@") and _is_messaging_address(to):
        return to

    client = await runtime.get_client()
    resolved = await client.resolve_user(to)
    address = _messaging_address(_agent_card(resolved))
    if address:
        return address
    raise ValueError(
        f"Could not resolve a messaging address for '{to}' — the agent has no "
        "advertised encryption key."
    )


def _agent_card(resolved: Any) -> dict[str, Any]:
    """Extract the agent card from a directory resolve response."""
    if not isinstance(resolved, dict):
        return {}
    for key in ("agentCard", "agent", "card"):
        candidate = resolved.get(key)
        if isinstance(candidate, dict):
            return candidate
    return resolved


def _messaging_address(card: dict[str, Any]) -> str | None:
    """The base64 messaging key an agent advertises, or ``None``.

    Prefers the agent card's ``encryptionPublicKey`` metadata, falling back to
    its ``publicKey`` (single-key agents). Mirrors
    website/src/common/encryption-discovery.ts.
    """
    metadata = card.get("metadata") if isinstance(card, dict) else None
    if isinstance(metadata, dict):
        advertised = metadata.get(_ENCRYPTION_PUBLIC_KEY_METADATA)
        if isinstance(advertised, str) and advertised:
            return advertised
    public_key = card.get("publicKey") if isinstance(card, dict) else None
    return public_key if isinstance(public_key, str) and public_key else None


def _agent_summary(card: dict[str, Any]) -> dict[str, Any]:
    """A compact, model-friendly view of an agent card.

    Carries the messaging address so a discovered agent can be handed straight
    to ``tinyplace_send_message``.
    """
    return {
        "agentId": card.get("agentId"),
        "cryptoId": card.get("cryptoId"),
        "username": card.get("username"),
        "name": card.get("name"),
        "description": card.get("description") or card.get("bio"),
        "skills": card.get("skills"),
        "tags": card.get("tags"),
        "messaging_address": _messaging_address(card),
    }


def _coerce_limit(value: Any) -> int | None:
    """Coerce a user-supplied limit to a positive int, else ``None``."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        return parsed if parsed > 0 else None
    return None


def _is_messaging_address(value: str) -> bool:
    """True if ``value`` is a raw messaging address, not a handle to resolve.

    A messaging address is the agent's 32-byte Ed25519 key encoded as a base58
    cryptoId (the canonical form) or base64. Anything else (e.g. a bare handle
    like ``alice``) is resolved through the directory.
    """
    try:
        _decode_agent_address(value)
        return True
    except Exception:  # noqa: BLE001 - not a 32-byte address; treat as a handle
        return False


def _decode_text(plaintext: bytes) -> str:
    try:
        return plaintext.decode("utf-8")
    except UnicodeDecodeError:
        import base64

        return base64.b64encode(plaintext).decode("ascii")


def _parse_cursor(cursor: str | None) -> tuple[str, str] | None:
    if not cursor:
        return None
    timestamp, _, message_id = cursor.rpartition("|")
    return (timestamp, message_id) if timestamp else (message_id, "")
