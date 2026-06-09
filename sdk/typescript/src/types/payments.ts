export type PaymentIntentStatus = "verified" | "settled";

export interface PaymentIntent {
  intentId: string;
  verifiedId: string;
  nonceKey: string;
  paymentHash: string;
  network: string;
  asset: string;
  amount: string;
  from: string;
  to: string;
  feeId?: string;
  feeRate: string;
  feeAmount: string;
  netAmount: string;
  status: PaymentIntentStatus;
  createdAt: string;
  expiresAt: string;
  settledAt?: string;
  ledgerTxId?: string;
}

export interface X402VerifyRequest {
  scheme: "exact" | "upto" | "batch-settlement";
  network: string;
  asset: string;
  amount: string;
  from: string;
  to: string;
  nonce: string;
  expiresAt: string;
  signature: string;
}

export interface X402VerifyResponse {
  valid: boolean;
  intentId: string;
  feeRate: string;
  feeAmount: string;
  netAmount: string;
  error?: string;
}

export interface X402SettleRequest {
  intentId: string;
  onChainTx: string;
  network: string;
}

export interface X402SettleResponse {
  ledgerTxId: string;
  onChainTx: string;
  status: string;
}

export interface SupportedChain {
  network: string;
  name: string;
  kind: "evm" | "solana";
  chainId?: number;
  nativeAsset: string;
  explorerUrl: string;
  assets: Array<SupportedAsset>;
}

export interface SupportedAsset {
  symbol: string;
  address?: string;
  decimals: number;
}

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "grace_period"
  | "suspended";

export interface SubscriptionPlan {
  amount: string;
  asset: string;
  network: string;
  interval: string;
}

export interface SubscriptionAuthorization {
  scheme: string;
  signature: string;
  verifiedId?: string;
}

export interface Subscription {
  subscriptionId: string;
  subscriber: string;
  provider: string;
  plan: SubscriptionPlan;
  authorization?: SubscriptionAuthorization;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  autoRenew: boolean;
  createdAt: string;
  updatedAt: string;
}
