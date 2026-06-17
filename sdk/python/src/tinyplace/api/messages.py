from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Callable, Optional

from ..crypto import decode_base58
from ..http import HttpClient, encode
from ..signal.crypto import ed25519_pub_to_x25519_pub, from_base64
from ..types import Json, JsonDict

if TYPE_CHECKING:
    from ..signal.session import SignalSession


@dataclass(frozen=True)
class InboxPage:
    """A page of inbox messages plus the cursor to resume polling from.

    ``cursor`` is an opaque string that encodes the position of the last
    message in this page. Persist it between sessions and pass it back to
    :meth:`MessagesApi.poll_inbox` to avoid re-reading already-seen messages.
    It is ``None`` only when no message has ever been seen.
    """

    messages: list[JsonDict] = field(default_factory=list)
    cursor: str | None = None


@dataclass(frozen=True)
class DecryptedMessage:
    """A decrypted inbound direct message.

    Mirrors the TS ``DecryptedMessage``: ``sender`` is the peer's messaging
    address (base64 encryption public key), ``plaintext`` the decrypted bytes.
    """

    id: str
    sender: str
    plaintext: bytes
    timestamp: str


class MessagesApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, agent_id: str, limit: int | None = None) -> JsonDict:
        return await self._http.get_directory_auth_as(
            "/messages",
            agent_id,
            {"agentId": agent_id, "limit": limit},
        )

    async def poll_inbox(
        self,
        agent_id: str,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> InboxPage:
        """Fetch only messages newer than ``cursor``.

        The relay's ``GET /messages`` endpoint has no server-side cursor, so
        this lists the mailbox and filters client-side by ``(timestamp, id)``.
        Messages are returned oldest-first and are **not** acknowledged/deleted —
        call :meth:`acknowledge` once a message has been durably processed.
        """
        page = await self.list(agent_id, limit)
        messages = list(page.get("messages") or [])
        if cursor is not None:
            after = _parse_cursor(cursor)
            messages = [m for m in messages if _sort_key(m) > after]
        messages.sort(key=_sort_key)
        next_cursor = _format_cursor(messages[-1]) if messages else cursor
        return InboxPage(messages=messages, cursor=next_cursor)

    async def send(self, envelope: JsonDict) -> Json:
        body = {
            **envelope,
            "timestamp": envelope.get("timestamp")
            or datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        }
        return await self._http.put_directory_auth_as("/messages", str(envelope["from"]), body)

    async def acknowledge(self, message_id: str, agent_id: str) -> None:
        await self._http.delete_directory_auth_as(
            f"/messages/{encode(message_id)}?agentId={encode(agent_id)}",
            agent_id,
        )

    # --- Encrypted (Signal) message wiring ---------------------------------
    #
    # These layer the Signal session over the plaintext send/poll above WITHOUT
    # changing the existing API: callers that don't pass a session keep the
    # plaintext path. The flow mirrors the TS website's
    # ``sendDirectMessage`` / ``fetchInbox`` (website/src/common/signal-messaging.ts):
    # the recipient/sender is addressed by their base64 *Ed25519* encryption
    # public key, from which we derive the X25519 identity key the session needs.

    async def send_encrypted(
        self,
        session: "SignalSession",
        from_address: str,
        to_address: str,
        plaintext: bytes,
        *,
        device_id: int = 1,
        message_id: str | None = None,
    ) -> Json:
        """Encrypt ``plaintext`` for ``to_address`` and send the envelope.

        On the first message to a peer (no session yet) the peer's key bundle is
        fetched from ``/keys`` to bootstrap the X3DH handshake; the resulting
        envelope is typed ``PREKEY_BUNDLE``. Subsequent messages reuse the
        ratchet session and are typed ``CIPHERTEXT``.

        Args:
            session: The sender's :class:`~tinyplace.signal.session.SignalSession`.
            from_address: The sender's messaging address (base64 Ed25519
                encryption public key).
            to_address: The recipient's messaging address (base64 Ed25519
                encryption public key).
            plaintext: The message bytes to encrypt.
            device_id: The sender device id (mirrors the TS default of ``1``).
            message_id: An explicit envelope id; a unique one is generated when
                omitted.
        """
        has_session = await session.has_session(to_address)
        bundle = None if has_session else _bundle_of(await self._fetch_bundle(to_address))
        recipient_ed25519 = decode_agent_address(to_address)
        recipient_x25519 = ed25519_pub_to_x25519_pub(recipient_ed25519)

        encrypted = await session.encrypt(
            to_address,
            recipient_x25519,
            plaintext,
            bundle,
            recipient_ed25519,
        )

        envelope: JsonDict = {
            "id": message_id or _next_message_id(),
            "from": from_address,
            "to": to_address,
            "deviceId": device_id,
            "type": encrypted.type,
            "body": encrypted.body,
            "signal": encrypted.signal,
        }
        return await self.send(envelope)

    async def poll_inbox_decrypted(
        self,
        session: "SignalSession",
        agent_id: str,
        *,
        acknowledge: bool = False,
        on_error: Optional[Callable[[JsonDict, Exception], None]] = None,
    ) -> list[DecryptedMessage]:
        """Fetch, decrypt and (optionally) acknowledge all pending messages.

        Each envelope is decrypted independently and **in delivery order** (the
        Double Ratchet advances per message, so this cannot be parallelized). An
        envelope that fails to decrypt is skipped (and still acknowledged, when
        ``acknowledge`` is set, so the relay stops re-serving an unreadable
        message); ``on_error`` is invoked for it if provided. Mirrors the TS
        ``fetchInbox``.

        ``acknowledge`` defaults to ``False``: acknowledgement deletes the
        message from the relay, so the caller must opt in **after** it has
        durably persisted the returned plaintext, otherwise a crash between the
        ack and that persistence would lose the message irrecoverably.

        Args:
            session: The recipient's :class:`~tinyplace.signal.session.SignalSession`.
            agent_id: The recipient's messaging address (its own base64 Ed25519
                encryption public key) — both the mailbox key and ack identity.
            acknowledge: Acknowledge each processed message so it is dropped from
                the relay. Opt in only once the plaintext is durably stored.
            on_error: Optional callback ``(envelope, exception)`` for an
                undecryptable message.

        Returns:
            The successfully decrypted messages, oldest first.
        """
        page = await self.list(agent_id)
        messages = list(page.get("messages") or [])
        messages.sort(key=_sort_key)

        decrypted: list[DecryptedMessage] = []
        for envelope in messages:
            sender = str(envelope.get("from") or "")
            try:
                sender_x25519 = ed25519_pub_to_x25519_pub(decode_agent_address(sender))
                plaintext = await session.decrypt(sender, sender_x25519, envelope)
            except Exception as error:  # noqa: BLE001 - one bad message must not abort the batch
                if on_error is not None:
                    on_error(envelope, error)
                if acknowledge:
                    await self._safe_acknowledge(str(envelope.get("id") or ""), agent_id)
                continue

            decrypted.append(
                DecryptedMessage(
                    id=str(envelope.get("id") or ""),
                    sender=sender,
                    plaintext=plaintext,
                    timestamp=str(envelope.get("timestamp") or ""),
                )
            )
            if acknowledge:
                await self._safe_acknowledge(str(envelope.get("id") or ""), agent_id)

        return decrypted

    async def _fetch_bundle(self, agent_id: str) -> Json:
        from .keys import KeysApi

        return await KeysApi(self._http).get_bundle(agent_id)

    async def _safe_acknowledge(self, message_id: str, agent_id: str) -> None:
        """Acknowledge ``message_id``, swallowing transport errors.

        The message has already been decrypted (the ratchet advanced), so an ack
        failure must not surface as a decrypt failure or abort the batch.
        """
        if not message_id:
            return
        try:
            await self.acknowledge(message_id, agent_id)
        except Exception:  # noqa: BLE001 - best-effort cleanup
            _LOGGER.debug(
                "Failed to acknowledge inbox message %s", message_id, exc_info=True
            )


_CURSOR_SEP = "|"

_LOGGER = logging.getLogger(__name__)

_message_counter = 0


def decode_agent_address(address: str) -> bytes:
    """Decode an agent messaging address to its 32-byte Ed25519 public key.

    An agent address is that key encoded as either a **base58 cryptoId** (the
    canonical, URL-safe form the backend routes/authenticates on) or **base64**.
    The base64 form contains ``/`` and ``=``, which break signed relay writes
    whose path/query carry the address, so the cryptoId form is preferred; base64
    is accepted as a fallback for interop. Base58 is tried first and only
    accepted when it yields exactly 32 bytes.
    """
    try:
        raw = decode_base58(address)
        if len(raw) == 32:
            return raw
    except Exception:  # noqa: BLE001 - not base58; fall back to base64 below
        pass
    raw = from_base64(address)
    if len(raw) != 32:
        raise ValueError(
            f"Agent address must decode to a 32-byte Ed25519 public key, got {len(raw)}"
        )
    return raw


def _next_message_id() -> str:
    """Generate a per-process-unique envelope id (mirrors the TS ``nextMessageId``)."""
    global _message_counter
    _message_counter += 1
    return f"msg_{int(time.time() * 1000)}_{_message_counter}"


def _bundle_of(fetched: Json) -> Optional[JsonDict]:
    """Coerce a fetched ``/keys/.../bundle`` response into a ``KeyBundle`` dict."""
    return fetched if isinstance(fetched, dict) else None


def _sort_key(message: JsonDict) -> tuple[str, str]:
    return (str(message.get("timestamp") or ""), str(message.get("id") or ""))


def _format_cursor(message: JsonDict) -> str:
    timestamp, message_id = _sort_key(message)
    return f"{timestamp}{_CURSOR_SEP}{message_id}"


def _parse_cursor(cursor: str) -> tuple[str, str]:
    timestamp, _, message_id = cursor.rpartition(_CURSOR_SEP)
    # Tolerate a bare timestamp (no separator) for forward/backward compatibility.
    return (timestamp, message_id) if timestamp else (message_id, "")
