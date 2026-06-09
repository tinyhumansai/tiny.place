from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from .identity import Identity, PaymentMethod


@dataclass
class AgentInterface:
    url: str
    binding: str
    version: str


@dataclass
class AgentPayment:
    network: str
    asset: str
    rate_type: str
    amount: str


@dataclass
class AgentDocs:
    swagger_json: Optional[str] = None
    swagger_md: Optional[str] = None
    skill_md: Optional[str] = None
    swagger_json_url: Optional[str] = None
    swagger_md_url: Optional[str] = None
    skill_md_url: Optional[str] = None


@dataclass
class AgentWebhook:
    event: str
    url: str
    secret_ref: Optional[str] = None
    description: Optional[str] = None
    metadata: Optional[dict[str, str]] = None


@dataclass
class AgentCard:
    agent_id: str
    name: str
    crypto_id: str
    created_at: str
    updated_at: str
    description: Optional[str] = None
    username: Optional[str] = None
    public_key: Optional[str] = None
    url: Optional[str] = None
    endpoint: Optional[str] = None
    supported_interfaces: Optional[list[AgentInterface]] = None
    skills: Optional[list[str]] = None
    capabilities: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    payment_methods: Optional[list[PaymentMethod]] = None
    payment_requirements: Optional[AgentPayment] = None
    groups: Optional[list[str]] = None
    docs: Optional[AgentDocs] = None
    webhooks: Optional[list[AgentWebhook]] = None
    metadata: Optional[dict[str, str]] = None
    signature: Optional[str] = None


@dataclass
class AgentInternalAPI:
    docs_url: Optional[str] = None
    endpoints: Optional[list[AgentInterface]] = None
    details: Optional[dict[str, str]] = None


@dataclass
class ExtendedAgentCard:
    agent_id: str
    agent: AgentCard
    updated_at: str
    private_skills: Optional[list[str]] = None
    rate_limits: Optional[dict[str, str]] = None
    internal_api: Optional[AgentInternalAPI] = None
    metadata: Optional[dict[str, str]] = None


@dataclass
class AgentQueryParams:
    q: Optional[str] = None
    skill: Optional[str] = None
    capability: Optional[str] = None
    tag: Optional[str] = None
    tags: Optional[list[str]] = None
    username: Optional[str] = None
    crypto_id: Optional[str] = None
    network: Optional[str] = None
    asset: Optional[str] = None
    max_amount: Optional[str] = None
    group: Optional[str] = None
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass
class ResolveResponse:
    identity: Optional[Identity]
    agent: Optional[AgentCard] = None


@dataclass
class ReverseResponse:
    crypto_id: str
    identities: list[Identity]
    agents: Optional[list[AgentCard]] = None
