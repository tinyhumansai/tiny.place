from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional


EscrowStatus = Literal[
    "funded",
    "accepted",
    "delivered",
    "revision_requested",
    "settled",
    "cancelled",
    "disputed",
    "resolved",
    "expired",
]

EscrowDisputeTier = Literal["mediation", "arbitration"]

EscrowDisputeStatus = Literal["open", "proposed", "accepted", "escalated", "resolved"]

EscrowEvidenceType = Literal["message", "delivery", "file", "external_link", "transaction"]


@dataclass
class EscrowTerms:
    description: str
    deadline: str
    max_revisions: int
    deliverables: Optional[list[str]] = None
    auto_release_after: Optional[str] = None


@dataclass
class EscrowMilestone:
    milestone_id: str
    title: str
    amount: str
    deadline: str
    status: str
    revision_count: int


@dataclass
class EscrowDelivery:
    delivery_id: str
    submitted_by: str
    description: str
    submitted_at: str
    refs: Optional[list[str]] = None


@dataclass
class EscrowExtension:
    extension_id: str
    requested_by: str
    deadline: str
    status: str
    requested_at: str
    reason: Optional[str] = None
    approved_at: Optional[str] = None


@dataclass
class EscrowEvidence:
    evidence_id: str
    dispute_id: str
    submitted_by: str
    type: EscrowEvidenceType
    description: str
    submitted_at: str
    ref: Optional[str] = None


@dataclass
class EscrowMediationProposal:
    proposed_at: str
    resolution: str
    client_amount: Optional[str] = None
    provider_amount: Optional[str] = None
    rationale: Optional[str] = None


@dataclass
class EscrowCouncilVote:
    agent: str
    vote: str
    round: int
    voted_at: str
    client_pct: Optional[float] = None
    provider_pct: Optional[float] = None
    rationale: Optional[str] = None


@dataclass
class EscrowArbitrationOutcome:
    resolution: str
    round: int
    resolved_at: str
    client_pct: Optional[float] = None
    provider_pct: Optional[float] = None
    rationale: Optional[str] = None


@dataclass
class EscrowDispute:
    dispute_id: str
    escrow_id: str
    tier: EscrowDisputeTier
    opened_by: str
    reason: str
    status: EscrowDisputeStatus
    opened_at: str
    evidence: Optional[list[EscrowEvidence]] = None
    proposal: Optional[EscrowMediationProposal] = None
    mediation_accepted_by: Optional[list[str]] = None
    arbitration_paid_by: Optional[list[str]] = None
    arbitration_round: Optional[int] = None
    council: Optional[list[EscrowCouncilVote]] = None
    arbitration_outcome: Optional[EscrowArbitrationOutcome] = None
    escalated_at: Optional[str] = None
    resolved_at: Optional[str] = None


@dataclass
class Escrow:
    escrow_id: str
    status: EscrowStatus
    client: str
    provider: str
    amount: str
    asset: str
    network: str
    terms: EscrowTerms
    revision_count: int
    created_at: str
    funded_at: str
    client_crypto_id: Optional[str] = None
    provider_crypto_id: Optional[str] = None
    milestones: Optional[list[EscrowMilestone]] = None
    deliveries: Optional[list[EscrowDelivery]] = None
    extensions: Optional[list[EscrowExtension]] = None
    dispute: Optional[EscrowDispute] = None
    accepted_at: Optional[str] = None
    delivered_at: Optional[str] = None
    resolved_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    on_chain_tx: Optional[str] = None
    ledger_tx_id: Optional[str] = None
    release_ledger_tx_id: Optional[str] = None


@dataclass
class EscrowMilestoneCreate:
    title: str
    amount: str
    deadline: str


@dataclass
class EscrowCreateRequest:
    provider: str
    amount: str
    asset: str
    network: str
    terms: EscrowTerms
    milestones: Optional[list[EscrowMilestoneCreate]] = None
    payment: Optional[dict[str, str]] = None
    signature: Optional[str] = None


@dataclass
class EscrowQueryParams:
    client: Optional[str] = None
    provider: Optional[str] = None
    status: Optional[EscrowStatus] = None
    limit: Optional[int] = None
    offset: Optional[int] = None
