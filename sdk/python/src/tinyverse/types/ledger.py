from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional


LedgerVisibility = Literal["unshielded", "shielded"]

LedgerType = Literal[
    "REGISTRATION",
    "RENEWAL",
    "SALE",
    "PAYMENT",
    "SUBSCRIPTION",
    "GROUP_FEE",
    "EVENT_TICKET",
    "EVENT_REFUND",
    "REVENUE_SHARE",
    "ESCROW_FUND",
    "ESCROW_RELEASE",
    "ESCROW_REFUND",
    "ARBITRATION_FEE",
    "FEE",
]

LedgerStatus = Literal["PENDING", "SETTLED", "FAILED"]


@dataclass
class LedgerReference:
    kind: str
    id: Optional[str] = None
    parent_tx_id: Optional[str] = None
    rate: Optional[str] = None


@dataclass
class LedgerTransaction:
    tx_id: str
    visibility: LedgerVisibility
    type: LedgerType
    network: str
    timestamp: str
    on_chain_tx: str
    status: LedgerStatus
    from_: Optional[str] = None
    to: Optional[str] = None
    amount: Optional[str] = None
    asset: Optional[str] = None
    reference: Optional[LedgerReference] = None
    metadata: Optional[dict[str, str]] = None


@dataclass
class LedgerListParams:
    limit: Optional[int] = None
    offset: Optional[int] = None
    agent: Optional[str] = None
    type: Optional[LedgerType] = None
    network: Optional[str] = None
    status: Optional[LedgerStatus] = None
    from_: Optional[str] = None
    to: Optional[str] = None
    after: Optional[str] = None
    before: Optional[str] = None
    asset: Optional[str] = None
    visibility: Optional[LedgerVisibility] = None


@dataclass
class LedgerVerifyRequest:
    on_chain_tx: str
    network: str
    ledger_tx_id: Optional[str] = None
    from_: Optional[str] = None
    to: Optional[str] = None
    amount: Optional[str] = None
    asset: Optional[str] = None


@dataclass
class LedgerVerifyResult:
    verified: bool
    network: str
    matches_ledger: bool
    block_number: Optional[int] = None
    block_timestamp: Optional[str] = None
    confirmations: Optional[int] = None
    ledger_tx_id: Optional[str] = None
    error: Optional[str] = None
