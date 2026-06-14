from __future__ import annotations

import base64
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from .signer import Signer


def build_canonical_message(fields: dict[str, Any]) -> str:
    metadata = fields.get("metadata")
    canonical: dict[str, Any] = {
        "domain": metadata.get("domain") if isinstance(metadata, dict) else None,
        "scheme": fields["scheme"],
        "network": fields["network"],
        "asset": fields["asset"],
        "amount": fields["amount"],
        "from": fields["from"],
        "to": fields["to"],
        "nonce": fields["nonce"],
        "expiresAt": fields.get("expiresAt"),
    }
    if not canonical["domain"]:
        canonical.pop("domain")
    if not canonical["expiresAt"]:
        canonical.pop("expiresAt")
    if isinstance(metadata, dict):
        canonical["metadata"] = [
            {"key": key, "value": metadata[key]} for key in sorted(metadata)
        ]
    return json.dumps(canonical, separators=(",", ":"), ensure_ascii=False)


async def sign_x402_authorization(signer: Signer, fields: dict[str, Any]) -> dict[str, Any]:
    signature = await signer.sign(build_canonical_message(fields).encode("utf-8"))
    return {**fields, "signature": base64.b64encode(signature).decode("ascii")}


async def build_x402_payment_authorization(
    signer: Signer,
    options: dict[str, Any],
) -> dict[str, Any]:
    metadata = {
        "domain": options.get("domain", "tiny.place"),
        "publicKey": options.get("publicKeyBase64", signer.public_key_base64),
        **(options.get("metadata") or {}),
    }
    fields = {
        "scheme": options.get("scheme", "exact"),
        "network": options["network"],
        "asset": options["asset"],
        "amount": options["amount"],
        "from": options.get("from") or signer.agent_id,
        "to": options["to"],
        "nonce": options.get("nonce") or generate_nonce("pay"),
        "expiresAt": options.get("expiresAt") or _expires_at(options.get("expiresInMs")),
        "metadata": metadata,
    }
    return await sign_x402_authorization(signer, fields)


async def build_x402_payment_payload(signer: Signer, options: dict[str, Any]) -> dict[str, Any]:
    references = _payment_references(options)
    return await build_x402_payment_authorization(
        signer,
        {
            **options,
            "metadata": {
                **(options.get("metadata") or {}),
                **references,
            },
        },
    )


async def build_x402_payment_map(signer: Signer, options: dict[str, Any]) -> dict[str, str]:
    references = _payment_references(options)
    authorization = await build_x402_payment_payload(signer, options)
    return {**x402_authorization_to_payment_map(authorization), **references}


def x402_authorization_to_payment_map(authorization: dict[str, Any]) -> dict[str, str]:
    payment = {
        "scheme": str(authorization["scheme"]),
        "network": str(authorization["network"]),
        "asset": str(authorization["asset"]),
        "amount": str(authorization["amount"]),
        "from": str(authorization["from"]),
        "to": str(authorization["to"]),
        "nonce": str(authorization["nonce"]),
        "expiresAt": str(authorization["expiresAt"]),
        "signature": str(authorization["signature"]),
    }
    for key, value in (authorization.get("metadata") or {}).items():
        payment[f"metadata.{key}"] = str(value)
    return payment


def generate_nonce(prefix: str | None = None) -> str:
    value = secrets.token_hex(12)
    return f"{prefix}_{value}" if prefix else value


def _expires_at(expires_in_ms: int | None = None) -> str:
    delta = timedelta(milliseconds=expires_in_ms or 5 * 60 * 1000)
    return (datetime.now(UTC) + delta).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _payment_references(options: dict[str, Any]) -> dict[str, str]:
    references = {}
    for key in ("onChainTx", "tx", "transaction", "ledgerTxId", "verifiedId"):
        value = options.get(key)
        if isinstance(value, str) and value.strip():
            references[key] = value.strip()
    return references
