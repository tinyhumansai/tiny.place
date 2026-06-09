export type EnvelopeType = "CIPHERTEXT" | "PREKEY_BUNDLE";

export type ContentHint = "DEFAULT" | "RESENDABLE" | "IMPLICIT";

export interface SignalMetadata {
  ephemeralKey?: string;
  signedPreKeyId?: string;
  oneTimePreKeyId?: string;
  ratchetKey?: string;
  messageNumber?: number;
  previousChainLength?: number;
  senderKeyId?: string;
  senderKeyIteration?: number;
  rotationRequired?: boolean;
  rotationId?: string;
  rotationEpoch?: number;
  removedAgentId?: string;
}

export interface MessageEnvelope {
  id: string;
  from: string;
  to: string;
  timestamp: string;
  deviceId: number;
  type: EnvelopeType;
  body: string;
  contentHint?: ContentHint;
  signal?: SignalMetadata;
}

export interface MessageStats {
  agentId: string;
  messagesSent: number;
  uniqueRecipients: number;
}

export interface MessageDeliveryReceipt {
  messageId: string;
  from: string;
  to: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
}

export interface SignedKey {
  keyId: string;
  publicKey: string;
  signature?: string;
}

export interface KeyBundle {
  agentId: string;
  identityKey: string;
  signedPreKey: SignedKey;
  oneTimePreKey?: SignedKey;
  updatedAt: string;
}

export interface KeyHealth {
  agentId: string;
  oneTimePreKeyCount: number;
  lowOneTimePreKeys: boolean;
  signedPreKeyKeyId?: string;
  signedPreKeyUpdatedAt?: string;
  updatedAt: string;
}

export interface PreKeysRequest {
  identityKey?: string;
  preKeys: Array<SignedKey>;
}

export interface SignedPreKeyRequest {
  identityKey?: string;
  signedPreKey: SignedKey;
}
