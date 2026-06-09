import type { LedgerType } from "./ledger.js";

export interface MoneyAmount {
  asset: string;
  amount: string;
  network?: string;
}

export interface FeeAmount {
  amount: string;
  asset: string;
  percent?: string;
}

export interface PriceQuote {
  base: string;
  quote: string;
  network?: string;
  bid: string;
  ask: string;
  mid: string;
  volume24h: string;
  change24h: string;
  source: string;
  updatedAt: string;
}

export interface PriceCandle {
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  timestamp: string;
}

export interface PriceHistory {
  base: string;
  quote: string;
  interval: string;
  candles: Array<PriceCandle>;
}

export interface GasEstimate {
  network: string;
  unit: string;
  slow: string;
  standard: string;
  fast: string;
  estimatedFee?: string;
  updatedAt: string;
}

export interface TradePair {
  base: string;
  quote: string;
  networks: Array<string>;
}

export interface SwapQuote {
  quoteId: string;
  from: MoneyAmount;
  to: MoneyAmount;
  rate: string;
  priceImpact: string;
  fee: FeeAmount;
  route: Array<string>;
  expiresAt: string;
  slippageTolerance: string;
}

export interface SwapExecuteRequest {
  quoteId: string;
  paymentAuthorization: string;
  slippageTolerance?: string;
  deadline?: number;
}

export interface SwapExecution {
  swapId: string;
  quoteId: string;
  agentId?: string;
  status: string;
  from: MoneyAmount;
  to: MoneyAmount;
  txHash?: string;
  ledgerEntry?: string;
  completedAt?: string;
  createdAt: string;
}

export interface BridgeRoute {
  provider: string;
  from: MoneyAmount;
  to: MoneyAmount;
  estimatedTime: string;
  fee: FeeAmount;
  minAmount: string;
  maxAmount: string;
}

export interface BridgeQuote {
  quoteId: string;
  from: MoneyAmount;
  to: MoneyAmount;
  provider: string;
  fee: FeeAmount;
  estimatedTime: string;
  expiresAt: string;
}

export interface BridgeExecuteRequest {
  quoteId: string;
  destinationAddress: string;
  paymentAuthorization: string;
}

export interface BridgeExecution {
  bridgeId: string;
  quoteId: string;
  agentId?: string;
  status: string;
  from: MoneyAmount;
  to: MoneyAmount;
  provider: string;
  destinationAddress: string;
  txHash?: string;
  sourceTxHash?: string;
  destinationTxHash?: string;
  ledgerEntry?: string;
  completedAt?: string;
  createdAt: string;
}

export interface FeeConfig {
  feeId: string;
  scope: string;
  transactionType: LedgerType;
  agents: Array<string>;
  rate: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  createdBy: string;
  reason: string;
  revoked: boolean;
  updatedAt: string;
}

export interface AgentPaymentStatus {
  handle: string;
  status: string;
  reason?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface AdminAuditEntry {
  auditId: string;
  action: string;
  actor: string;
  timestamp: string;
  params: Record<string, string>;
  reason: string;
}

export interface SystemConfig {
  key: string;
  value: string;
  updatedBy: string;
  updatedAt: string;
}

export interface StatsSnapshot {
  timestamp: string;
  agents: AgentStats;
  transactions: TransactionStats;
  volume: VolumeStats;
  fees: FeeStats;
}

export interface AgentStats {
  registered: number;
  active_30d: number;
  directory_cards: number;
  groups: number;
}

export interface TransactionStats {
  total: number;
  settled: number;
  by_type: Record<string, number>;
}

export interface VolumeStats {
  total_usd: string;
  by_asset: Record<string, string>;
  by_network: Record<string, string>;
  last_24h_usd: string;
  last_30d_usd: string;
}

export interface FeeStats {
  total_usd: string;
  last_24h_usd: string;
  last_30d_usd: string;
}
