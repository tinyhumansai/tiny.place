from __future__ import annotations

import base64
import json

from nacl.signing import VerifyKey

from tinyplace import (
    LocalSigner,
    Signer,
    canonical_payload,
    sign_directory_write,
    sign_fresh_canonical_payload,
    sign_request,
)


class SiwsSigner(Signer):
    agent_id = "wallet-address"
    public_key_base64 = "wallet-public-key"

    async def sign(self, data: bytes) -> bytes:
        raise AssertionError("SIWS auth should not call sign()")

    def siws_signature(self) -> str | None:
        return "siws:test-token"


def test_local_signer_from_seed_is_deterministic() -> None:
    signer = LocalSigner.from_seed(bytes(range(32)))
    same = LocalSigner.from_seed(bytes(range(32)))

    assert signer.agent_id == same.agent_id
    assert signer.public_key_base64 == same.public_key_base64


async def test_sign_request_can_be_verified() -> None:
    signer = LocalSigner.from_seed(bytes(range(32)), siws=False)
    headers = await sign_request(signer, '{"ok":true}')
    scheme, credentials = headers["Authorization"].split(" ", 1)
    agent_id, signature, signed_at = credentials.split(":", 2)

    VerifyKey(signer.public_key).verify(
        f'{{"ok":true}}{signed_at}'.encode("utf-8"),
        base64.b64decode(signature),
    )
    assert scheme == "tiny.place"
    assert agent_id == signer.agent_id


async def test_fresh_canonical_signature_shape() -> None:
    signer = LocalSigner.from_seed(bytes(range(32)), siws=False)
    payload = canonical_payload("identity.renew", {"username": "@alice"})
    token = await sign_fresh_canonical_payload(signer, payload)

    assert token.startswith("v1:")
    assert len(token.split(":")) == 4


async def test_local_signer_defaults_to_siws() -> None:
    signer = LocalSigner.from_seed(bytes(range(32)))
    token = signer.siws_signature()
    assert token is not None and token.startswith("siws:")

    # The minted proof is signed by this key and names this wallet address.
    decoded = json.loads(base64.urlsafe_b64decode(token[len("siws:") :] + "=="))
    message = base64.b64decode(decoded["signedMessage"])
    assert message.decode("utf-8").split("\n")[1] == signer.agent_id
    VerifyKey(signer.public_key).verify(message, base64.b64decode(decoded["signature"]))

    # The auth helpers emit the SIWS token by default.
    assert (await sign_fresh_canonical_payload(signer, "{}")).startswith("siws:")


async def test_siws_signer_passes_token_through() -> None:
    signer = SiwsSigner()

    request_headers = await sign_request(signer, "{}")
    directory_headers = await sign_directory_write(signer, "wallet-public-key", "PUT", "/directory/agents/x", "{}")
    canonical = await sign_fresh_canonical_payload(signer, "{}")

    assert request_headers["Authorization"].startswith("tiny.place wallet-address:siws:test-token:")
    assert directory_headers["X-TinyPlace-Signature"] == "siws:test-token"
    assert canonical == "siws:test-token"
