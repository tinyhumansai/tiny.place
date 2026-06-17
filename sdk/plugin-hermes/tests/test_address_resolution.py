"""send_message must treat a raw messaging address (cryptoId/base64) as-is.

Regression: after addressing switched to base58 cryptoIds, _resolve_address
mis-classified a cryptoId as a @handle and hit /directory/resolve/@<cryptoId>
(404). A raw 32-byte address must be used directly; only handles resolve.
"""

from __future__ import annotations

from conftest import tools
from tinyplace import LocalSigner


def test_cryptoid_and_base64_are_recognized_as_addresses() -> None:
    signer = LocalSigner.from_seed(bytes(range(32)))
    assert tools._is_messaging_address(signer.agent_id) is True            # base58 cryptoId
    assert tools._is_messaging_address(signer.public_key_base64) is True    # base64 key


def test_handles_are_not_addresses() -> None:
    assert tools._is_messaging_address("alice") is False
    assert tools._is_messaging_address("@alice") is False
    assert tools._is_messaging_address("") is False
