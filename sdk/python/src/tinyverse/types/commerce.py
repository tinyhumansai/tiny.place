from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from .ledger import LedgerType


@dataclass
class MoneyAmount:
    asset: str
    amount: str
    network: Optional[str] = None


@dataclass
class FeeAmount:
    amount: str
    asset: str
    percent: Optional[str] = None


@dataclass
class PriceQuote:
    base: str
    quote: str
    bid: str
    ask: str
    mid: str
    volume_24h: str
    change_24h: str
    source: str
    updated_at: str
    network: Optional[str] = None


@dataclass
class PriceCandle:
    open: str
    high: str
    low: str
    close: str
    volume: str
    timestamp: str


@dataclass
class PriceHistory:
    base: str
    quote: str
    interval: str
    candles: list[PriceCandle]


@dataclass
class GasEstimate:
    network: str
    unit: str
    slow: str
    standard: str
    fast: str
    updated_at: str
    estimated_fee: Optional[str] = None


@dataclass
class TradePair:
    base: str
    quote: str
    networks: list[str]


@dataclass
class SwapQuote:
    quote_id: str
    from_: MoneyAmount
    to: MoneyAmount
    rate: str
    price_impact: str
    fee: FeeAmount
    route: list[str]
    expires_at: str
    slippage_tolerance: str


@dataclass
class SwapExecuteRequest:
    quote_id: str
    payment_authorization: str
    slippage_tolerance: Optional[str] = None
    deadline: Optional[int] = None


@dataclass
class SwapExecution:
    swap_id: str
    quote_id: str
    status: str
    from_: MoneyAmount
    to: MoneyAmount
    created_at: str
    agent_id: Optional[str] = None
    tx_hash: Optional[str] = None
    ledger_entry: Optional[str] = None
    completed_at: Optional[str] = None


@dataclass
class BridgeRoute:
    provider: str
    from_: MoneyAmount
    to: MoneyAmount
    estimated_time: str
    fee: FeeAmount
    min_amount: str
    max_amount: str


@dataclass
class BridgeQuote:
    quote_id: str
    from_: MoneyAmount
    to: MoneyAmount
    provider: str
    fee: FeeAmount
    estimated_time: str
    expires_at: str


@dataclass
class BridgeExecuteRequest:
    quote_id: str
    destination_address: str
    payment_authorization: str


@dataclass
class BridgeExecution:
    bridge_id: str
    quote_id: str
    status: str
    from_: MoneyAmount
    to: MoneyAmount
    provider: str
    destination_address: str
    created_at: str
    agent_id: Optional[str] = None
    tx_hash: Optional[str] = None
    source_tx_hash: Optional[str] = None
    destination_tx_hash: Optional[str] = None
    ledger_entry: Optional[str] = None
    completed_at: Optional[str] = None


@dataclass
class FeeConfig:
    fee_id: str
    scope: str
    transaction_type: LedgerType
    agents: list[str]
    rate: str
    effective_from: str
    created_by: str
    reason: str
    revoked: bool
    updated_at: str
    effective_until: Optional[str] = None


@dataclass
class AgentPaymentStatus:
    handle: str
    status: str
    updated_by: str
    updated_at: str
    reason: Optional[str] = None


@dataclass
class AdminAuditEntry:
    audit_id: str
    action: str
    actor: str
    timestamp: str
    params: dict[str, str]
    reason: str


@dataclass
class SystemConfig:
    key: str
    value: str
    updated_by: str
    updated_at: str


@dataclass
class AgentStats:
    registered: int
    active_30d: int
    directory_cards: int
    groups: int


@dataclass
class TransactionStats:
    total: int
    settled: int
    by_type: dict[str, int]


@dataclass
class VolumeStats:
    total_usd: str
    by_asset: dict[str, str]
    by_network: dict[str, str]
    last_24h_usd: str
    last_30d_usd: str


@dataclass
class FeeStats:
    total_usd: str
    last_24h_usd: str
    last_30d_usd: str


@dataclass
class StatsSnapshot:
    timestamp: str
    agents: AgentStats
    transactions: TransactionStats
    volume: VolumeStats
    fees: FeeStats
