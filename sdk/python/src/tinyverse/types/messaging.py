from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional


EnvelopeType = Literal["CIPHERTEXT", "PREKEY_BUNDLE"]

ContentHint = Literal["DEFAULT", "RESENDABLE", "IMPLICIT"]


@dataclass
class SignalMetadata:
    ephemeral_key: Optional[str] = None
    signed_pre_key_id: Optional[str] = None
    one_time_pre_key_id: Optional[str] = None
    ratchet_key: Optional[str] = None
    message_number: Optional[int] = None
    previous_chain_length: Optional[int] = None
    sender_key_id: Optional[str] = None
    sender_key_iteration: Optional[int] = None
    rotation_required: Optional[bool] = None
    rotation_id: Optional[str] = None
    rotation_epoch: Optional[int] = None
    removed_agent_id: Optional[str] = None


@dataclass
class MessageEnvelope:
    id: str
    from_: str
    to: str
    timestamp: str
    device_id: int
    type: EnvelopeType
    body: str
    content_hint: Optional[ContentHint] = None
    signal: Optional[SignalMetadata] = None


@dataclass
class MessageStats:
    agent_id: str
    messages_sent: int
    unique_recipients: int


@dataclass
class MessageDeliveryReceipt:
    message_id: str
    from_: str
    to: str
    acknowledged_by: str
    acknowledged_at: str


@dataclass
class SignedKey:
    key_id: str
    public_key: str
    signature: Optional[str] = None


@dataclass
class KeyBundle:
    agent_id: str
    identity_key: str
    signed_pre_key: SignedKey
    updated_at: str
    one_time_pre_key: Optional[SignedKey] = None


@dataclass
class KeyHealth:
    agent_id: str
    one_time_pre_key_count: int
    low_one_time_pre_keys: bool
    updated_at: str
    signed_pre_key_key_id: Optional[str] = None
    signed_pre_key_updated_at: Optional[str] = None


@dataclass
class PreKeysRequest:
    pre_keys: list[SignedKey]
    identity_key: Optional[str] = None


@dataclass
class SignedPreKeyRequest:
    signed_pre_key: SignedKey
    identity_key: Optional[str] = None
