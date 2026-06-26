from __future__ import annotations

import base64
import json
from typing import Any

from nacl.signing import VerifyKey


def verify_siws_token(signer: Any, token: str) -> bool:
    """Validate a SIWS auth token.

    The signer defaults to SIWS, so request auth carries a
    ``siws:<base64url(json{signedMessage,signature,signatureType})>`` token
    rather than the legacy ``v1:`` freshness signature. This confirms the token
    is well-formed, the embedded Ed25519 signature is valid for the signer over
    its signed message, and the message names the signer's account.
    """
    assert token.startswith("siws:"), f"expected a SIWS token, got: {token[:24]}..."
    encoded = token[len("siws:") :]
    raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
    payload = json.loads(raw)
    message = base64.b64decode(payload["signedMessage"])
    signature = base64.b64decode(payload["signature"])
    VerifyKey(signer.public_key).verify(message, signature)
    assert signer.agent_id in message.decode("utf-8")
    return True


class FakeResponse:
    def __init__(self, status: int, body: Any, headers: dict[str, str] | None = None) -> None:
        self.status = status
        self._body = body
        self.headers = headers or {}

    async def text(self) -> str:
        return self._body if isinstance(self._body, str) else json.dumps(self._body)

    async def json(self) -> Any:
        return self._body

    async def __aenter__(self) -> "FakeResponse":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None


class FakeSession:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self.responses = responses
        self.requests: list[dict[str, Any]] = []
        self.closed = False

    async def request(self, method: str, url: str, **kwargs: Any) -> FakeResponse:
        self.requests.append({"method": method, "url": url, **kwargs})
        return self.responses.pop(0)

    def post(self, url: str, **kwargs: Any) -> FakeResponse:
        self.requests.append({"method": "POST", "url": url, **kwargs})
        return self.responses.pop(0)

    async def close(self) -> None:
        self.closed = True
