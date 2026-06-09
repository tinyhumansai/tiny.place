from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional


PaymentIntentStatus = Literal["verified", "settled"]


@dataclass
class PaymentIntent:
    intent_id: str
    verified_id: str
    nonce_key: str
    payment_hash: str
    network: str
    asset: str
    amount: str
    from_: str
    to: str
    fee_rate: str
    fee_amount: str
    net_amount: str
    status: PaymentIntentStatus
    created_at: str
    expires_at: str
    fee_id: Optional[str] = None
    settled_at: Optional[str] = None
    ledger_tx_id: Optional[str] = None


@dataclass
class X402VerifyRequest:
    scheme: Literal["exact", "upto", "batch-settlement"]
    network: str
    asset: str
    amount: str
    from_: str
    to: str
    nonce: str
    expires_at: str
    signature: str


@dataclass
class X402VerifyResponse:
    valid: bool
    intent_id: str
    fee_rate: str
    fee_amount: str
    net_amount: str
    error: Optional[str] = None


@dataclass
class X402SettleRequest:
    intent_id: str
    on_chain_tx: str
    network: str


@dataclass
class X402SettleResponse:
    ledger_tx_id: str
    on_chain_tx: str
    status: str


@dataclass
class SupportedAsset:
    symbol: str
    decimals: int
    address: Optional[str] = None


@dataclass
class SupportedChain:
    network: str
    name: str
    kind: Literal["evm", "solana"]
    native_asset: str
    explorer_url: str
    assets: list[SupportedAsset]
    chain_id: Optional[int] = None


SubscriptionStatus = Literal["active", "canceled", "grace_period", "suspended"]


@dataclass
class SubscriptionPlan:
    amount: str
    asset: str
    network: str
    interval: str


@dataclass
class SubscriptionAuthorization:
    scheme: str
    signature: str
    verified_id: Optional[str] = None


@dataclass
class Subscription:
    subscription_id: str
    subscriber: str
    provider: str
    plan: SubscriptionPlan
    status: SubscriptionStatus
    current_period_end: str
    auto_renew: bool
    created_at: str
    updated_at: str
    authorization: Optional[SubscriptionAuthorization] = None
