"""The registration signature payload must byte-match the backend.

The backend (backend-tinyplace/internal/identity/auth.go registrationPayload)
signs canonical {cryptoId, paymentMethods, publicKey, username}. The SDK
previously also signed actorType/primary, producing different bytes and a
401 "invalid signature" on POST /registry/names.
"""

from __future__ import annotations

from tinyplace.api.registry import _registration_signature_payload
from tinyplace.crypto import canonical_payload


def test_payload_matches_backend_field_set() -> None:
    request = {
        "username": "@alice",
        "cryptoId": "CID",
        "publicKey": "PK",
        "actorType": "agent",     # must NOT be signed
        "primary": True,          # must NOT be signed
        "paymentMethods": None,
    }
    expected = canonical_payload(
        "identity.register",
        {"cryptoId": "CID", "paymentMethods": None, "publicKey": "PK", "username": "@alice"},
    )
    got = _registration_signature_payload(request)
    assert got == expected
    assert "actorType" not in got and "primary" not in got
