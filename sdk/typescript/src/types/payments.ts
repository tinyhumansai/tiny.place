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
  payer?: string;
  payee?: string;
  nonce: string;
  expiresAt: string;
  signature: string;
  metadata?: Record<string, string>;
}

export interface X402VerifyResponse {
  valid: boolean;
  intentId?: string;
  verifiedId?: string;
  network?: string;
  asset?: string;
  amount?: string;
  expiresAt?: string;
  feeQuoteId?: string;
  feeRate?: string;
  feeAmount?: string;
  netAmount?: string;
  error?: string;
}

export interface X402VerifyUntilValidOptions {
  attempts?: number;
  intervalMs?: number;
  retryErrors?: Array<string>;
}

export interface X402SettleRequest {
  payment: X402VerifyRequest;
  settledAmount?: string;
  feeQuoteId?: string;
  reference?: Record<string, unknown>;
  shielded?: boolean;
  /**
   * Base64 legacy Solana transaction built and session-signed by the client
   * (delegate authority), with the fee-payer slot left for the facilitator. When
   * present the backend validates it, adds the fee-payer signature, and submits
   * it so the payer's own funds move via the session-wallet delegate.
   */
  delegatedTx?: string;
}

export interface X402SettleResponse {
  settled?: boolean;
  ledgerTxId?: string;
  onChainTx?: string;
  batchId?: string;
  status?: string;
  error?: string;
  [key: string]: unknown;
}

export interface PaymentBatchFlushRequest {
  limit?: number;
}

export type PaymentBatchFlushStatus = "flushed" | "failed";

export interface PaymentBatchFlush {
  flushId: string;
  batchId: string;
  status: PaymentBatchFlushStatus;
  itemCount: number;
  itemIds?: Array<string>;
  grossAmount?: string;
  feeAmount?: string;
  netAmount?: string;
  asset?: string;
  network?: string;
  feeLedgerTxIds?: Array<string>;
  parentLedgerTxId?: string;
  onChainTx?: string;
  error?: string;
  metadata?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface PaymentBatchFlushResponse {
  flush: PaymentBatchFlush;
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

export interface SubscriptionCreateRequest {
  subscriptionId?: string;
  subscriber: string;
  provider: string;
  plan: SubscriptionPlan;
  authorization?: Partial<SubscriptionAuthorization>;
  status?: SubscriptionStatus;
  currentPeriodEnd?: string;
  autoRenew?: boolean;
}

export interface SubscriptionRenewRequest {
  paymentAuthorization: string;
  settledAmount?: string;
}

export interface SubscriptionRenewResponse {
  subscription: Subscription;
  settlement: X402SettleResponse;
}

export interface DueRenewalResult {
  renewed: number;
  failed: number;
  suspended: number;
  errors?: Array<string>;
}

export type SignerApprovalStatus =
  | "active"
  | "revoked"
  | "expired"
  | "exhausted";

export interface SignerApproval {
  signerKey: string;
  grantor: string;
  network: string;
  asset: string;
  budget: string;
  spent: string;
  remaining: string;
  expiresAt: string;
  nonce: string;
  status: SignerApprovalStatus;
  createdAt: string;
  /**
   * RFC 3339 time a single-use grant was claimed via POST
   * /signers/{signerKey}/consume (the agent-login link flow). Absent for
   * ordinary multi-use wallet-session grants.
   */
  consumedAt?: string;
}
