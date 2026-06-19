from __future__ import annotations

import base64
import json
import secrets
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone

from nacl.signing import SigningKey

from .crypto import decode_base58, derive_crypto_id, public_key_to_base64

# A minted SIWS proof is reusable until it expires; mirror the website's 7-day
# window so a single mint covers a long-lived agent session.
_SIWS_TIME_TO_LIVE = timedelta(days=7)


class Signer(ABC):
    """Abstract signing strategy for agent, directory, and admin auth."""

    agent_id: str
    public_key_base64: str

    @abstractmethod
    async def sign(self, data: bytes) -> bytes:
        """Return an Ed25519 signature over ``data``."""

    def siws_signature(self) -> str | None:
        """Return a reusable ``siws:`` proof token when this signer uses SIWS."""
        return None


class LocalSigner(Signer):
    """Local Ed25519 signer backed by PyNaCl.

    By default the signer mints a reusable SIWS ownership proof and authenticates
    requests with it (the preferred scheme). Pass ``siws=False`` to fall back to
    per-request freshness-bound Ed25519 signatures, which are still required for
    delegated session keys, x402, and admin auth.
    """

    def __init__(
        self,
        signing_key: SigningKey,
        *,
        siws: bool = True,
        siws_network: str = "solana:mainnet",
        siws_origin: str = "https://tiny.place",
    ) -> None:
        self._signing_key = signing_key
        self.public_key = bytes(signing_key.verify_key)
        self.agent_id = derive_crypto_id(self.public_key)
        self.public_key_base64 = public_key_to_base64(self.public_key)
        self._siws_network = siws_network
        self._siws_origin = siws_origin
        self._siws_token: str | None = self._mint_siws() if siws else None

    @classmethod
    def generate(cls, **kwargs) -> "LocalSigner":
        return cls(SigningKey.generate(), **kwargs)

    @classmethod
    def from_seed(cls, seed: bytes, **kwargs) -> "LocalSigner":
        if len(seed) != 32:
            raise ValueError(f"Ed25519 seed must be 32 bytes, got {len(seed)}")
        return cls(SigningKey(seed), **kwargs)

    @classmethod
    def from_solana_secret_key(cls, secret_key: str | bytes, **kwargs) -> "LocalSigner":
        secret = decode_base58(secret_key) if isinstance(secret_key, str) else secret_key
        if len(secret) not in (32, 64):
            raise ValueError(f"Solana secret key must be 32 or 64 bytes, got {len(secret)}")
        if len(secret) == 64 and bytes(SigningKey(secret[:32]).verify_key) != secret[32:]:
            raise ValueError("Solana secret key public key does not match seed")
        return cls.from_seed(secret[:32], **kwargs)

    async def sign(self, data: bytes) -> bytes:
        return bytes(self._signing_key.sign(data).signature)

    def siws_signature(self) -> str | None:
        return self._siws_token

    def mint_siws(self) -> str:
        """Mint and cache a fresh SIWS proof, returning the token."""
        self._siws_token = self._mint_siws()
        return self._siws_token

    def _mint_siws(self) -> str:
        issued_at = datetime.now(timezone.utc)
        expires_at = issued_at + _SIWS_TIME_TO_LIVE
        message = "\n".join(
            [
                "tiny.place wants you to sign in with your Solana account:",
                self.agent_id,
                "",
                "Authenticate website API requests. This does not authorize a transaction or payment.",
                "",
                f"URI: {self._siws_origin}",
                "Version: 1",
                f"Chain ID: {self._siws_network}",
                f"Nonce: {secrets.token_hex(16)}",
                f"Issued At: {_iso(issued_at)}",
                f"Expiration Time: {_iso(expires_at)}",
            ]
        )
        message_bytes = message.encode("utf-8")
        signature = bytes(self._signing_key.sign(message_bytes).signature)
        token = {
            "signedMessage": base64.b64encode(message_bytes).decode("ascii"),
            "signature": base64.b64encode(signature).decode("ascii"),
            "signatureType": "ed25519",
        }
        encoded = base64.urlsafe_b64encode(
            json.dumps(token, separators=(",", ":")).encode("utf-8")
        ).rstrip(b"=")
        return "siws:" + encoded.decode("ascii")


def _iso(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")
