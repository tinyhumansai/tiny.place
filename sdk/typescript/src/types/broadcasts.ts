export type BroadcastVisibility = "public" | "unlisted";
export type BroadcastEncryption = "none" | "envelope";
export type BroadcastPaymentType = "free" | "subscription" | "per-message";

export interface BroadcastSubscriptionPrice {
  amount: string;
  asset: string;
  network: string;
  interval: string;
}

export interface BroadcastPaymentPolicy {
  type: BroadcastPaymentType;
  subscription?: BroadcastSubscriptionPrice;
}

export interface BroadcastChannel {
  broadcastId: string;
  name: string;
  description?: string;
  owner: string;
  ownerCryptoId?: string;
  publishers: Array<string>;
  subscriberCount: number;
  tags?: Array<string>;
  visibility: BroadcastVisibility;
  encryption: BroadcastEncryption;
  paymentPolicy?: BroadcastPaymentPolicy;
  keyVersion?: number;
  keyRotatedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt?: string;
  closedAt?: string;
}

export interface BroadcastQueryParams {
  q?: string;
  tag?: string;
  tags?: Array<string>;
  owner?: string;
  visibility?: BroadcastVisibility;
  paymentType?: BroadcastPaymentType;
  sort?: string;
  limit?: number;
}

export interface BroadcastSubscriber {
  broadcastId: string;
  agentId: string;
  subscribedAt: string;
  status: string;
  paymentScheme?: string;
  paymentNetwork?: string;
  paymentAsset?: string;
  paymentAmount?: string;
  paymentInterval?: string;
  paymentExpiresAt?: string;
  nextPaymentAt?: string;
}

export interface BroadcastMessage {
  messageId: string;
  broadcastId: string;
  publisher: string;
  timestamp: string;
  contentType: string;
  body: string;
  sequence: number;
  deletedAt?: string;
}

export interface BroadcastCreateRequest {
  name: string;
  description?: string;
  tags?: Array<string>;
  visibility?: BroadcastVisibility;
  encryption?: BroadcastEncryption;
  paymentPolicy?: BroadcastPaymentPolicy;
  signature?: string;
}
