from __future__ import annotations

import base64
import json

from nacl.signing import VerifyKey

from tinyplace import LocalSigner, TinyPlaceClient, canonical_payload

from .helpers import FakeResponse, FakeSession


def _client(signer: LocalSigner, session: FakeSession) -> TinyPlaceClient:
    return TinyPlaceClient(
        base_url="https://api.example.test",
        signer=signer,
        session=session,  # type: ignore[arg-type]
    )


def _verify_fresh(signer: LocalSigner, signature: str, payload: str) -> None:
    version, timestamp, nonce, raw = signature.split(":")
    assert version == "v1"
    signed_at = base64.urlsafe_b64decode(timestamp + "=" * (-len(timestamp) % 4)).decode()
    nonce_value = base64.urlsafe_b64decode(nonce + "=" * (-len(nonce) % 4)).decode()
    VerifyKey(signer.public_key).verify(
        f"{payload}\n{signed_at}\n{nonce_value}".encode(), base64.b64decode(raw)
    )


async def test_marketplace_list_products_is_public() -> None:
    signer = LocalSigner.from_seed(bytes([81]) * 32)
    session = FakeSession([FakeResponse(200, {"products": []})])
    out = await _client(signer, session).marketplace.list_products({"category": "data"})
    assert out == {"products": []}
    assert "/marketplace/products?category=data" in session.requests[0]["url"]


async def test_marketplace_create_product_signs_and_routes_as_seller() -> None:
    signer = LocalSigner.from_seed(bytes([82]) * 32)
    session = FakeSession([FakeResponse(200, {"productId": "prod1"})])
    await _client(signer, session).marketplace.create_product(
        {
            "name": "Dataset",
            "description": "rows",
            "category": "data",
            "deliveryMethod": "download",
            "price": {"amount": "5", "asset": "USDC", "network": "solana:x"},
            "seller": "SellerId",
        }
    )
    req = session.requests[0]
    assert req["url"].endswith("/marketplace/products")
    assert req["headers"]["X-Agent-ID"] == "SellerId"  # routed as seller
    body = json.loads(req["data"])
    assert body["productId"].startswith("prod_")  # id generated
    assert body["signerPublicKey"] == signer.public_key_base64
    # The signature must be over the exact canonical product payload.
    _verify_fresh(
        signer,
        body["signature"],
        canonical_payload(
            "marketplace.product",
            {
                "category": "data",
                "deliveryMethod": "download",
                "description": "rows",
                "name": "Dataset",
                "price": {"amount": "5", "asset": "USDC", "network": "solana:x"},
                "productId": body["productId"],
                "seller": "SellerId",
                "sellerCryptoId": "",
                "stock": None,
                "tags": None,
            },
        ),
    )


async def test_marketplace_buy_product_routes_as_buyer() -> None:
    signer = LocalSigner.from_seed(bytes([83]) * 32)
    session = FakeSession([FakeResponse(200, {"purchaseId": "pur1"})])
    await _client(signer, session).marketplace.buy_product(
        "prod1", {"buyer": "BuyerId", "payment": {"signature": "sig"}}
    )
    req = session.requests[0]
    assert req["url"].endswith("/marketplace/products/prod1/buy")
    assert req["headers"]["X-Agent-ID"] == "BuyerId"


async def test_marketplace_delete_product_uses_public_signed_query() -> None:
    signer = LocalSigner.from_seed(bytes([84]) * 32)
    session = FakeSession([FakeResponse(204, None)])
    await _client(signer, session).marketplace.delete_product("prod1")
    req = session.requests[0]
    assert req["method"] == "DELETE"
    assert req["url"].startswith("https://api.example.test/marketplace/products/prod1?signature=")
    assert "signerPublicKey=" in req["url"]
    # Product delete is the public route (no Authorization header).
    assert "Authorization" not in req["headers"]


async def test_marketplace_identity_and_offer_deletes_stay_signed() -> None:
    signer = LocalSigner.from_seed(bytes([85]) * 32)
    session = FakeSession([FakeResponse(204, None), FakeResponse(204, None)])
    client = _client(signer, session)
    await client.marketplace.delete_identity_listing("listing1")
    await client.marketplace.cancel_offer("offer1")
    for req in session.requests:
        assert req["method"] == "DELETE"
        assert "?signature=" in req["url"]
        # Identity/offer cancellations keep signed (Authorization) auth.
        assert req["headers"]["Authorization"].startswith("tiny.place ")


async def test_buy_product_with_solana_payment_settles_then_buys(monkeypatch) -> None:
    signer = LocalSigner.from_seed(bytes([86]) * 32)
    session = FakeSession(
        [
            FakeResponse(
                200,
                {
                    "productId": "prod1",
                    "seller": "SellerId",
                    "price": {"network": "solana:x", "asset": "USDC", "amount": "5"},
                },
            ),
            FakeResponse(200, {"purchaseId": "pur1"}),
        ]
    )
    client = _client(signer, session)
    captured: dict = {}

    async def fake_exec(**kwargs):
        captured.update(kwargs)
        return {"signature": "sig", "payment": {"signature": "s", "scheme": "exact"}}

    monkeypatch.setattr("tinyplace.api.marketplace.execute_solana_x402_payment", fake_exec)

    out = await client.marketplace.buy_product_with_solana_payment(
        "prod1", {"buyer": "BuyerId"}, rpc_url="https://rpc.example", secret_key=bytes([86]) * 32
    )
    # Paid the product's exact price to the seller, USDC mint defaulted.
    assert captured["payment"]["amount"] == "5"
    assert captured["payment"]["to"] == "SellerId" and captured["payment"]["from"] == "BuyerId"
    assert captured["mint"]
    # The buy POST carried the signed payment map.
    buy_body = json.loads(session.requests[1]["data"])
    assert buy_body["payment"]["signature"] == "s"
    assert out["purchase"]["purchaseId"] == "pur1" and out["payment"]["signature"] == "sig"


async def test_place_bid_with_solana_payment_attaches_upto_authorization() -> None:
    signer = LocalSigner.from_seed(bytes([87]) * 32)
    session = FakeSession(
        [
            FakeResponse(200, {"identities": [{"listingId": "L1", "seller": "SellerId", "name": "@cool"}]}),
            FakeResponse(200, {"listingId": "L1", "status": "bidding"}),
        ]
    )
    client = _client(signer, session)
    out = await client.marketplace.place_bid_with_solana_payment(
        "L1", {"bidder": "BidderId", "price": {"network": "solana:x", "asset": "USDC", "amount": "9"}}
    )
    bid_body = json.loads(session.requests[1]["data"])
    # A signed `upto` x402 authorization is attached (no on-chain transfer).
    assert bid_body["payment"]["scheme"] == "upto"
    assert bid_body["payment"]["amount"] == "9"
    assert bid_body["payment"]["to"] == "SellerId" and bid_body["payment"]["from"] == "BidderId"
    assert "signature" in bid_body["payment"]
    assert out["payment"]["scheme"] == "upto"
