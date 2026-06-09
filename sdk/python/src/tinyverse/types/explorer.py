from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .ledger import LedgerReference, LedgerStatus, LedgerType, LedgerVisibility


@dataclass
class ExplorerFeeSummary:
    tx_id: str
    amount: str
    rate: Optional[str] = None


@dataclass
class ExplorerFeeDetail:
    tx_id: str
    amount: str
    amount_formatted: str
    rate: Optional[str] = None


@dataclass
class ExplorerTransactionSummary:
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
    fee: Optional[ExplorerFeeSummary] = None


@dataclass
class ExplorerParty:
    reputation: int
    username: Optional[str] = None
    crypto_id: Optional[str] = None


@dataclass
class ExplorerRelatedTransaction:
    tx_id: str
    type: LedgerType
    relationship: str


@dataclass
class ExplorerTransactionDetail:
    tx_id: str
    visibility: LedgerVisibility
    type: LedgerType
    network: str
    timestamp: str
    on_chain_tx: str
    on_chain_verified: bool
    status: LedgerStatus
    related_transactions: list[ExplorerRelatedTransaction]
    from_: Optional[ExplorerParty] = None
    to: Optional[ExplorerParty] = None
    amount: Optional[str] = None
    amount_formatted: Optional[str] = None
    asset: Optional[str] = None
    block_number: Optional[int] = None
    confirmations: Optional[int] = None
    reference: Optional[LedgerReference] = None
    fee: Optional[ExplorerFeeDetail] = None


@dataclass
class ExplorerVerification:
    tx_id: str
    on_chain_tx: str
    network: str
    verified: bool
    block_number: Optional[int] = None
    block_timestamp: Optional[str] = None
    confirmations: Optional[int] = None
    explorer_url: Optional[str] = None
    error: Optional[str] = None


@dataclass
class ExplorerVolumeCount:
    count: int
    volume_usd: str


@dataclass
class ExplorerFeeCount:
    count: int
    total_usd: str


@dataclass
class ExplorerCounterparty:
    username: str
    transaction_count: int
    volume_usd: str


@dataclass
class ExplorerNetworkActivity:
    count: int
    volume_usd: str


@dataclass
class ExplorerAgentSummary:
    total_transactions: int
    total_volume_usd: str
    sent: ExplorerVolumeCount
    received: ExplorerVolumeCount
    fees_paid: ExplorerFeeCount
    top_counterparties: list[ExplorerCounterparty]
    by_type: dict[str, int]
    by_network: dict[str, ExplorerNetworkActivity]


@dataclass
class ExplorerAgentResponse:
    agent: ExplorerParty
    summary: ExplorerAgentSummary
    recent_transactions: list[ExplorerTransactionSummary]


@dataclass
class ExplorerLedgerOverview:
    total_entries: int
    latest_tx_id: Optional[str] = None
    latest_timestamp: Optional[str] = None


@dataclass
class ExplorerActivityWindow:
    transactions: int
    volume_usd: str
    fees_usd: str
    unique_agents: int


@dataclass
class ExplorerAllTimeOverview:
    volume_usd: str
    fees_usd: str
    registered_agents: int


@dataclass
class ExplorerNetworkOverview:
    transactions: int
    volume_usd: str


@dataclass
class ExplorerOverview:
    timestamp: str
    ledger: ExplorerLedgerOverview
    last_24h: ExplorerActivityWindow
    all_time: ExplorerAllTimeOverview
    by_network: dict[str, ExplorerNetworkOverview]
    recent_transactions: list[ExplorerTransactionSummary]


@dataclass
class ExplorerTransactionListResponse:
    transactions: list[ExplorerTransactionSummary]
    total: int
    page: int
    page_size: int
