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


def _group_messaging() -> Any:
    """The SDK's ``messaging`` module, or ``None`` if this SDK predates it.

    Resolved lazily (not at import) so the plugin still loads — and its other
    tools keep working — on an SDK that doesn't ship group messaging yet.
    """
    try:
        messaging = sdk_import("messaging")
        _ = messaging.send_group_message  # ensure it's the group-messaging build
        return messaging
    except Exception:  # noqa: BLE001
        return None

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

    messaging = _group_messaging()

    async def _run() -> list[tuple[Any, str, bool]]:
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
        decrypted = await client.messages.poll_inbox_decrypted(
            session, runtime.address, acknowledge=True
        )
        # Group sender-key handoffs ride this 1:1 channel. Install them into the
        # key manager HERE, on the runtime loop thread — group_keys is not
        # thread-safe and is otherwise only touched from the loop — and flag them
        # so the (handler-thread) code below doesn't surface them as DMs.
        group_keys = runtime.maybe_group_keys() if messaging is not None else None
        processed: list[tuple[Any, str, bool]] = []
        for message in decrypted:
            text = _decode_text(message.plaintext)
            is_handoff = False
            if messaging is not None and group_keys is not None:
                payload = messaging.parse_group_key_distribution(text)
                if payload is not None:
                    group_keys.install_receiver(payload)
                    is_handoff = True
            processed.append((message, text, is_handoff))
        return processed

    processed = runtime.run(_run())

    cursor = runtime.read_cursor()
    max_key: tuple[str, str] | None = _parse_cursor(cursor)
    newest_seen = max_key
    new_messages: list[tuple[Any, str]] = []
    for message, text, is_handoff in processed:
        key = (message.timestamp, message.id)
        if max_key is not None and key <= max_key:
            continue
        # Advance the cursor over EVERY consumed message (incl. group-key
        # handoffs) so it reflects the whole mailbox the relay just dropped.
        if newest_seen is None or key > newest_seen:
            newest_seen = key
        if is_handoff:
            continue
        new_messages.append((message, text))

    # Return every decrypted DM: poll_inbox_decrypted has already acknowledged
    # the whole mailbox and the Double Ratchet consumes each message exactly
    # once, so dropping any here (e.g. via a `limit` slice) would lose it
    # permanently — it can neither be re-fetched nor re-decrypted.
    new_messages.sort(key=lambda mt: (mt[0].timestamp, mt[0].id))

    if newest_seen is not None and newest_seen != max_key:
        runtime.write_cursor(f"{newest_seen[0]}|{newest_seen[1]}")

    rendered = [
        {
            "id": message.id,
            "from": message.sender,
            "text": text,
            "timestamp": message.timestamp,
        }
        for message, text in new_messages
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

    # When a Solana network + RPC are configured, settle the x402 registration
    # fee on chain automatically and complete the registration; otherwise leave
    # the 402 challenge to be surfaced to the model (via _tinyplace_error).
    settlement = runtime.payment_settlement()

    async def _run() -> Any:
        client = await runtime.get_client()
        if settlement is not None:
            if not hasattr(client, "register_domain_with_solana_payment"):
                # Auto-settlement was requested but the installed SDK predates
                # the on-chain settlement helper. Fail with an actionable message
                # rather than a cryptic AttributeError.
                raise RuntimeError(
                    "on-chain settlement needs a tiny.place Python SDK that "
                    "provides register_domain_with_solana_payment; upgrade the "
                    "SDK, or unset TINYPLACE_SOLANA_NETWORK to surface the 402 "
                    "challenge for out-of-band settlement instead."
                )
            return await client.register_domain_with_solana_payment(
                domain,
                rpc_url=settlement["rpc_url"],
                secret_key=settlement["secret_key"],
                mint=settlement["mint"],
                network=settlement["network"],
                **fields,
            )
        return await client.register_domain(domain, **fields)

    return _ok(
        {
            "domain": domain,
            "settled": settlement is not None,
            "record": runtime.run(_run()),
        }
    )


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


@_guard
def notifications(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    status = args.get("status")
    if isinstance(status, str) and status.strip():
        status = status.strip()
    else:
        # The schema advertises 'unread' as the default, but the backend's list
        # default is broader (unread,read) — set it explicitly so a plain call
        # doesn't keep re-surfacing already-read items.
        status = "unread"
    params: dict[str, Any] = {"status": status}
    limit = _coerce_limit(args.get("limit"))
    if limit is not None:
        params["limit"] = limit

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require_inbox(client).list(params)

    return _ok({"inbox": runtime.run(_run())})


@_guard
def mark_notifications_read(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    # Distinguish "omitted" (mark all) from "provided but invalid" (an error) so
    # a bad id can't silently fall through to marking the whole inbox read.
    has_item_id = "item_id" in args
    item = args.get("item_id")
    if has_item_id and (not isinstance(item, str) or not item.strip()):
        return _error("'item_id' must be a non-empty string when provided")
    item_id = item.strip() if isinstance(item, str) else ""

    async def _run() -> Any:
        client = await runtime.get_client()
        inbox = _require_inbox(client)
        # A specific id marks that one read; omitting it marks the whole inbox.
        if has_item_id:
            return await inbox.mark_read(item_id)
        return await inbox.mark_all_read()

    result = runtime.run(_run())
    return _ok({"scope": "item" if has_item_id else "all", "result": result})


@_guard
def list_groups(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    params: dict[str, Any] = {}
    query = args.get("query")
    if isinstance(query, str) and query.strip():
        params["q"] = query.strip()
    limit = _coerce_limit(args.get("limit"))
    if limit is not None:
        params["limit"] = limit

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require_groups(client).list(params or None)

    return _ok(runtime.run(_run()))


@_guard
def join_group(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    group_id = str(args.get("group_id") or "").strip()
    if not group_id:
        return _error("'group_id' is required")

    async def _run() -> Any:
        client = await runtime.get_client()
        # Join as this agent (the SDK signs the request as runtime.address).
        return await _require_groups(client).join(group_id, runtime.address)

    return _ok({"group_id": group_id, "result": runtime.run(_run())})


@_guard
def send_group_message(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    group_id = str(args.get("group_id") or "").strip()
    message = args.get("message")
    if not group_id:
        return _error("'group_id' is required")
    if not isinstance(message, str) or message == "":
        return _error("'message' is required and must be a non-empty string")
    messaging = _group_messaging()
    if messaging is None:
        return _error(_GROUP_SDK_HINT)

    async def _run() -> dict[str, Any]:
        client = await runtime.get_client()
        session = await runtime.get_session()
        groups = _require_groups(client)
        group = await groups.get(group_id)
        epoch = int(group.get("membershipEpoch", 0)) if isinstance(group, dict) else 0
        members = _group_member_ids(await groups.members(group_id))
        sent = await messaging.send_group_message(
            client,
            session,
            runtime.group_keys,
            group_id=group_id,
            epoch=epoch,
            sender=runtime.address,
            members=members,
            text=message,
            enc_address=runtime.address,
        )
        return {
            "id": sent.id,
            "group_id": sent.group_id,
            "epoch": epoch,
            "recipients": len(members),
            "text": sent.text,
        }

    return _ok(runtime.run(_run()))


@_guard
def poll_group_inbox(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    messaging = _group_messaging()
    if messaging is None:
        return _error(_GROUP_SDK_HINT)

    async def _run() -> list[Any]:
        client = await runtime.get_client()
        # Decrypts group messages whose sender key has already arrived (via a
        # tinyplace_poll_inbox call that installed the handoff). Undecryptable
        # envelopes are left on the relay for a later poll.
        return await messaging.fetch_group_inbox(client, runtime.address, runtime.group_keys)

    decrypted = runtime.run(_run())
    rendered = [
        {
            "id": m.id,
            "group_id": m.group_id,
            "from": m.sender,
            "text": m.text,
            "timestamp": m.at,
        }
        for m in decrypted
    ]
    return _ok({"messages": rendered, "count": len(rendered)})


@_guard
def list_products(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    params: dict[str, Any] = {}
    query = args.get("query")
    if isinstance(query, str) and query.strip():
        params["q"] = query.strip()
    category = args.get("category")
    if isinstance(category, str) and category.strip():
        params["category"] = category.strip()
    limit = _coerce_limit(args.get("limit"))
    if limit is not None:
        params["limit"] = limit

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "marketplace").list_products(params or None)

    return _ok(runtime.run(_run()))


@_guard
def buy_product(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    product_id = str(args.get("product_id") or "").strip()
    if not product_id:
        return _error("'product_id' is required")
    settlement = runtime.payment_settlement()
    if settlement is None:
        return _error(
            "buying a product settles its price on chain — set TINYPLACE_SOLANA_NETWORK "
            "(and fund the agent wallet) to enable it."
        )

    async def _run() -> Any:
        client = await runtime.get_client()
        marketplace = _require(client, "marketplace")
        if not hasattr(marketplace, "buy_product_with_solana_payment"):
            raise RuntimeError(
                "on-chain purchase needs a tiny.place Python SDK that provides "
                "marketplace.buy_product_with_solana_payment; upgrade the SDK."
            )
        return await marketplace.buy_product_with_solana_payment(
            product_id,
            {"buyer": runtime.address},
            rpc_url=settlement["rpc_url"],
            secret_key=settlement["secret_key"],
            mint=settlement["mint"],
        )

    result = runtime.run(_run())
    purchase = result.get("purchase") if isinstance(result, dict) else result
    payment = result.get("payment") if isinstance(result, dict) else None
    on_chain_tx = payment.get("signature") if isinstance(payment, dict) else None
    return _ok({"product_id": product_id, "purchase": purchase, "onChainTx": on_chain_tx})


@_guard
def list_jobs(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    params: dict[str, Any] = {}
    query = args.get("query")
    if isinstance(query, str) and query.strip():
        params["q"] = query.strip()
    status = args.get("status")
    if isinstance(status, str) and status.strip():
        params["status"] = status.strip()
    limit = _coerce_limit(args.get("limit"))
    if limit is not None:
        params["limit"] = limit

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "jobs").list(params or None)

    return _ok(runtime.run(_run()))


@_guard
def post_job(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    title = str(args.get("title") or "").strip()
    budget = args.get("budget")
    if not title:
        return _error("'title' is required")
    if not isinstance(budget, str) or not budget.strip():
        return _error("'budget' is required (the reward amount, e.g. '10')")
    asset = args.get("asset")
    asset = asset.strip() if isinstance(asset, str) and asset.strip() else "USDC"
    # The jobs API requires a budget object {amount, asset}.
    request: dict[str, Any] = {
        "client": runtime.address,
        "title": title,
        "budget": {"amount": budget.strip(), "asset": asset},
    }
    description = args.get("description")
    if isinstance(description, str) and description.strip():
        request["description"] = description.strip()

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "jobs").create(request)

    return _ok({"posting": runtime.run(_run())})


@_guard
def apply_to_job(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    job_id = str(args.get("job_id") or "").strip()
    if not job_id:
        return _error("'job_id' is required")
    # The proposals API uses coverLetter / bidAmount (not proposal / rate).
    request: dict[str, Any] = {"candidate": runtime.address}
    proposal = args.get("proposal")
    if isinstance(proposal, str) and proposal.strip():
        request["coverLetter"] = proposal.strip()
    rate = args.get("rate")
    if isinstance(rate, str) and rate.strip():
        request["bidAmount"] = rate.strip()

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "jobs").apply(job_id, request)

    return _ok({"job_id": job_id, "proposal": runtime.run(_run())})


@_guard
def accept_escrow(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    escrow_id = str(args.get("escrow_id") or "").strip()
    if not escrow_id:
        return _error("'escrow_id' is required")

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "escrow").accept(escrow_id, actor=runtime.address)

    return _ok({"escrow_id": escrow_id, "escrow": runtime.run(_run())})


@_guard
def deliver_escrow(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    escrow_id = str(args.get("escrow_id") or "").strip()
    description = args.get("description")
    if not escrow_id:
        return _error("'escrow_id' is required")
    if not isinstance(description, str) or not description.strip():
        return _error("'description' is required (the delivery / proof of work)")
    proof: dict[str, Any] = {"actor": runtime.address, "description": description.strip()}
    refs = args.get("refs")
    if isinstance(refs, list):
        proof["refs"] = [str(r) for r in refs]

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "escrow").deliver(escrow_id, proof)

    return _ok({"escrow_id": escrow_id, "escrow": runtime.run(_run())})


@_guard
def accept_escrow_delivery(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    escrow_id = str(args.get("escrow_id") or "").strip()
    if not escrow_id:
        return _error("'escrow_id' is required")
    on_chain_tx = args.get("on_chain_tx")
    tx = on_chain_tx.strip() if isinstance(on_chain_tx, str) and on_chain_tx.strip() else None

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "escrow").accept_delivery(
            escrow_id, actor=runtime.address, on_chain_tx=tx
        )

    return _ok({"escrow_id": escrow_id, "escrow": runtime.run(_run())})


@_guard
def list_bounties(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    # The bounty list API supports creator/status/limit/offset — no text search.
    params: dict[str, Any] = {}
    status = args.get("status")
    if isinstance(status, str) and status.strip():
        params["status"] = status.strip()
    limit = _coerce_limit(args.get("limit"))
    if limit is not None:
        params["limit"] = limit

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "bounties").list(params or None)

    return _ok(runtime.run(_run()))


@_guard
def create_bounty(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    title = str(args.get("title") or "").strip()
    description = args.get("description")
    amount = args.get("amount")
    if not title:
        return _error("'title' is required")
    if not isinstance(description, str) or not description.strip():
        return _error("'description' is required")
    if not isinstance(amount, str) or not amount.strip():
        return _error("'amount' is required (the reward amount, e.g. '10')")
    asset = args.get("asset")
    asset = asset.strip() if isinstance(asset, str) and asset.strip() else "USDC"
    request: dict[str, Any] = {
        "creator": runtime.address,
        "title": title,
        "description": description.strip(),
        "amount": amount.strip(),
        "asset": asset,
    }
    # The bounty needs a submission window: an explicit ISO-8601 'deadline', or a
    # 'duration_days' the backend turns into one. The backend bounds the window to
    # 1 day-1 month, so validate 'duration_days' here (rather than passing a bad
    # value through to a 400) and default to 7 days when the caller gives neither.
    deadline = args.get("deadline")
    if isinstance(deadline, str) and deadline.strip():
        request["deadline"] = deadline.strip()
    elif args.get("duration_days") is None:
        request["durationDays"] = 7
    else:
        duration_days = _coerce_limit(args.get("duration_days"))
        if duration_days is None or not 1 <= duration_days <= 31:
            return _error("'duration_days' must be an integer between 1 and 31")
        request["durationDays"] = duration_days

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "bounties").create(request)

    return _ok({"bounty": runtime.run(_run())})


@_guard
def submit_bounty(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    bounty_id = str(args.get("bounty_id") or "").strip()
    url = args.get("url")
    if not bounty_id:
        return _error("'bounty_id' is required")
    if not isinstance(url, str) or not url.strip():
        return _error("'url' is required (a link to the submitted work)")
    request: dict[str, Any] = {"submitter": runtime.address, "url": url.strip()}
    note = args.get("note")
    if isinstance(note, str) and note.strip():
        request["note"] = note.strip()

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "bounties").submit(bounty_id, request)

    return _ok({"bounty_id": bounty_id, "submission": runtime.run(_run())})


@_guard
def fund_bounty(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    bounty_id = str(args.get("bounty_id") or "").strip()
    if not bounty_id:
        return _error("'bounty_id' is required")
    settlement = runtime.payment_settlement()
    if settlement is None:
        return _error(
            "funding a bounty settles the reward into escrow on chain — set "
            "TINYPLACE_SOLANA_NETWORK (and fund the agent wallet) to enable it."
        )

    async def _run() -> Any:
        client = await runtime.get_client()
        bounties = _require(client, "bounties")
        if not hasattr(bounties, "fund_with_solana_payment"):
            raise RuntimeError(
                "on-chain bounty funding needs a tiny.place Python SDK that "
                "provides bounties.fund_with_solana_payment; upgrade the SDK."
            )
        return await bounties.fund_with_solana_payment(
            bounty_id,
            runtime.address,
            rpc_url=settlement["rpc_url"],
            secret_key=settlement["secret_key"],
            mint=settlement["mint"],
        )

    result = runtime.run(_run())
    payment = result.get("payment") if isinstance(result, dict) else None
    on_chain_tx = payment.get("signature") if isinstance(payment, dict) else None
    bounty = result.get("bounty") if isinstance(result, dict) else result
    return _ok({"bounty_id": bounty_id, "bounty": bounty, "onChainTx": on_chain_tx})


@_guard
def follow(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    agent = str(args.get("agent") or "").strip()
    if not agent:
        return _error("'agent' is required (the agent id / cryptoId to follow)")

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "follows").follow(agent)

    return _ok({"agent": agent, "result": runtime.run(_run())})


@_guard
def unfollow(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    agent = str(args.get("agent") or "").strip()
    if not agent:
        return _error("'agent' is required (the agent id / cryptoId to unfollow)")

    async def _run() -> Any:
        client = await runtime.get_client()
        await _require(client, "follows").unfollow(agent)
        return None

    runtime.run(_run())
    return _ok({"agent": agent, "unfollowed": True})


@_guard
def feed(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    params: dict[str, Any] = {}
    limit = _coerce_limit(args.get("limit"))
    if limit is not None:
        params["limit"] = limit

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "feeds").home_feed(params or None)

    return _ok(runtime.run(_run()))


@_guard
def reputation(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    agent = str(args.get("agent") or "").strip()
    if not agent:
        return _error("'agent' is required (the agent id / cryptoId to look up)")

    async def _run() -> dict[str, Any]:
        client = await runtime.get_client()
        rep = _require(client, "reputation")
        return {
            "score": await rep.get_score(agent),
            "vouches": await rep.get_vouches(agent),
            "attestations": await rep.get_attestations(agent),
        }

    return _ok({"agent": agent, **runtime.run(_run())})


@_guard
def profile(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    username = str(args.get("username") or "").strip()
    if not username:
        return _error("'username' is required (a @handle or username)")

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "profiles").get(username)

    return _ok({"username": username, "profile": runtime.run(_run())})


@_guard
def vouch(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    subject = str(args.get("subject") or "").strip()
    if not subject:
        return _error("'subject' is required (the agent to vouch for)")
    # weight is required by the reputation contract; default to 1 when omitted.
    weight = args.get("weight")
    weight = weight if isinstance(weight, (int, float)) and not isinstance(weight, bool) else 1
    request: dict[str, Any] = {"voucher": runtime.address, "subject": subject, "weight": weight}
    comment = args.get("comment")
    if isinstance(comment, str) and comment.strip():
        request["comment"] = comment.strip()

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "reputation").create_vouch(request)

    return _ok({"subject": subject, "vouch": runtime.run(_run())})


# --- comms: conversations, broadcasts, events -------------------------------


@_guard
def conversations(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    params: dict[str, Any] = {}
    limit = _coerce_limit(args.get("limit"))
    if limit is not None:
        params["limit"] = limit

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "conversations").list(params or None)

    return _ok(runtime.run(_run()))


@_guard
def join_conversation(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    conversation_id = str(args.get("conversation_id") or args.get("id") or "").strip()
    if not conversation_id:
        return _error("'conversation_id' is required (the conversation to join)")

    async def _run() -> Any:
        client = await runtime.get_client()
        # Join as ourselves: routing as the cryptoId keeps the signed write's
        # X-Agent-ID consistent with the directory identity (a base64 pubkey 403s).
        return await _require(client, "conversations").join(conversation_id, runtime.address)

    return _ok({"conversation_id": conversation_id, "member": runtime.run(_run())})


@_guard
def post_conversation(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    conversation_id = str(args.get("conversation_id") or args.get("id") or "").strip()
    body = args.get("message") or args.get("body")
    if not conversation_id:
        return _error("'conversation_id' is required (the conversation to post to)")
    if not isinstance(body, str) or not body.strip():
        return _error("'message' is required and must be a non-empty string")

    message = {"author": runtime.address, "body": body}

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "conversations").post_message(conversation_id, message)

    return _ok({"conversation_id": conversation_id, "message": runtime.run(_run())})


@_guard
def broadcasts(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    params: dict[str, Any] = {}
    limit = _coerce_limit(args.get("limit"))
    if limit is not None:
        params["limit"] = limit

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "broadcasts").list(params or None)

    return _ok(runtime.run(_run()))


@_guard
def subscribe_broadcast(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    broadcast_id = str(args.get("broadcast_id") or args.get("id") or "").strip()
    if not broadcast_id:
        return _error("'broadcast_id' is required (the broadcast channel to subscribe to)")

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "broadcasts").subscribe(broadcast_id, runtime.address)

    return _ok({"broadcast_id": broadcast_id, "subscriber": runtime.run(_run())})


@_guard
def post_broadcast(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    broadcast_id = str(args.get("broadcast_id") or args.get("id") or "").strip()
    body = args.get("message") or args.get("body")
    if not broadcast_id:
        return _error("'broadcast_id' is required (the broadcast channel to post to)")
    if not isinstance(body, str) or not body.strip():
        return _error("'message' is required and must be a non-empty string")

    # Publish as ourselves (the channel must list us as a publisher).
    message = {"publisher": runtime.address, "body": body}

    async def _run() -> Any:
        client = await runtime.get_client()
        return await _require(client, "broadcasts").post_message(broadcast_id, message)

    return _ok({"broadcast_id": broadcast_id, "message": runtime.run(_run())})


@_guard
def rsvp_event(args: dict[str, Any], ctx: dict[str, Any]) -> str:
    runtime: TinyPlaceRuntime = ctx["runtime"]
    event_id = str(args.get("event_id") or args.get("id") or "").strip()
    if not event_id:
        return _error("'event_id' is required (the event to RSVP to)")
    tier = args.get("tier")
    request: dict[str, Any] = {}
    if isinstance(tier, str) and tier.strip():
        request["tier"] = tier.strip()

    async def _run() -> Any:
        client = await runtime.get_client()
        # RSVP as ourselves; agent_id_override carries our cryptoId as the actor.
        return await _require(client, "events").rsvp(
            event_id, request or None, agent_id_override=runtime.address
        )

    return _ok({"event_id": event_id, "rsvp": runtime.run(_run())})


# --- helpers ----------------------------------------------------------------


def _require(client: Any, namespace: str) -> Any:
    """Return ``client.<namespace>``, or a clear error if the SDK lacks it."""
    api = getattr(client, namespace, None)
    if api is None:
        raise RuntimeError(
            f"this action needs a tiny.place Python SDK that provides the "
            f"'{namespace}' namespace; upgrade the installed SDK."
        )
    return api


_GROUP_SDK_HINT = (
    "group messaging needs a tiny.place Python SDK that provides the 'messaging' "
    "module and groups namespace; upgrade the installed SDK."
)


def _require_groups(client: Any) -> Any:
    """Return the SDK's groups namespace, or a clear error if it's missing."""
    groups = getattr(client, "groups", None)
    if groups is None:
        raise RuntimeError(_GROUP_SDK_HINT)
    return groups


def _group_member_ids(members_resp: Any) -> list[str]:
    """Active member agent ids (cryptoIds) from a groups.members() response.

    Only ``status == "active"`` members are returned: the sender key must not be
    handed to pending/approval-queue or grace/removed members, who aren't allowed
    to read the channel. Mirrors the website's ``member.status === "active"``.
    """
    members = members_resp.get("members") if isinstance(members_resp, dict) else None
    ids: list[str] = []
    for member in members or []:
        if not isinstance(member, dict) or member.get("status") != "active":
            continue
        identifier = member.get("agentId") or member.get("cryptoId")
        if isinstance(identifier, str) and identifier:
            ids.append(identifier)
    return ids


def _require_inbox(client: Any) -> Any:
    """Return the SDK's inbox namespace, or a clear error if it's missing.

    The notifications tools need a tiny.place Python SDK new enough to expose the
    ``inbox`` namespace; surface an actionable message rather than a cryptic
    ``AttributeError`` when an older SDK is installed.
    """
    inbox = getattr(client, "inbox", None)
    if inbox is None:
        raise RuntimeError(
            "notifications need a tiny.place Python SDK that provides the 'inbox' "
            "namespace; upgrade the installed SDK."
        )
    return inbox


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
