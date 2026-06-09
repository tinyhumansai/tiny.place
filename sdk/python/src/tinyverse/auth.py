from __future__ import annotations

import base64
from datetime import datetime, timezone
from typing import Protocol, runtime_checkable


@runtime_checkable
class SigningKey(Protocol):
    @property
    def agent_id(self) -> str: ...

    async def sign(self, data: bytes) -> bytes: ...


def build_auth_header(
    agent_id: str,
    signature: str,
    timestamp: str,
) -> dict[str, str]:
    return {"Authorization": f"TinyVerse {agent_id}:{signature}:{timestamp}"}


async def sign_request(
    key: SigningKey,
    body: str,
) -> dict[str, str]:
    timestamp = datetime.now(timezone.utc).isoformat()
    payload = (body + timestamp).encode()
    signature = await key.sign(payload)
    return build_auth_header(key.agent_id, base64.b64encode(signature).decode(), timestamp)
