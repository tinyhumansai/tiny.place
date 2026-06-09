import type { LedgerReference, LedgerStatus, LedgerType, LedgerVisibility } from "./ledger.js";

export interface ExplorerFeeSummary {
  txId: string;
  amount: string;
  rate?: string;
}

export interface ExplorerFeeDetail {
  txId: string;
  amount: string;
  amountFormatted: string;
  rate?: string;
}

export interface ExplorerTransactionSummary {
  txId: string;
  visibility: LedgerVisibility;
  type: LedgerType;
  from?: string | null;
  to?: string | null;
  amount?: string | null;
  asset?: string | null;
  network: string;
  timestamp: string;
  onChainTx: string;
  status: LedgerStatus;
  fee?: ExplorerFeeSummary;
}

export interface ExplorerParty {
  username?: string;
  cryptoId?: string;
  reputation: number;
}

export interface ExplorerRelatedTransaction {
  txId: string;
  type: LedgerType;
  relationship: string;
}

export interface ExplorerTransactionDetail {
  txId: string;
  visibility: LedgerVisibility;
  type: LedgerType;
  from?: ExplorerParty | null;
  to?: ExplorerParty | null;
  amount?: string | null;
  amountFormatted?: string | null;
  asset?: string | null;
  network: string;
  timestamp: string;
  onChainTx: string;
  onChainVerified: boolean;
  blockNumber?: number;
  confirmations?: number;
  status: LedgerStatus;
  reference?: LedgerReference | null;
  fee?: ExplorerFeeDetail;
  relatedTransactions: Array<ExplorerRelatedTransaction>;
}

export interface ExplorerVerification {
  txId: string;
  onChainTx: string;
  network: string;
  verified: boolean;
  blockNumber?: number;
  blockTimestamp?: string;
  confirmations?: number;
  explorerUrl?: string;
  error?: string;
}

export interface ExplorerVolumeCount {
  count: number;
  volumeUsd: string;
}

export interface ExplorerFeeCount {
  count: number;
  totalUsd: string;
}

export interface ExplorerCounterparty {
  username: string;
  transactionCount: number;
  volumeUsd: string;
}

export interface ExplorerNetworkActivity {
  count: number;
  volumeUsd: string;
}

export interface ExplorerAgentSummary {
  totalTransactions: number;
  totalVolumeUsd: string;
  sent: ExplorerVolumeCount;
  received: ExplorerVolumeCount;
  feesPaid: ExplorerFeeCount;
  topCounterparties: Array<ExplorerCounterparty>;
  byType: Record<string, number>;
  byNetwork: Record<string, ExplorerNetworkActivity>;
}

export interface ExplorerAgentResponse {
  agent: ExplorerParty;
  summary: ExplorerAgentSummary;
  recentTransactions: Array<ExplorerTransactionSummary>;
}

export interface ExplorerLedgerOverview {
  totalEntries: number;
  latestTxId?: string;
  latestTimestamp?: string;
}

export interface ExplorerActivityWindow {
  transactions: number;
  volumeUsd: string;
  feesUsd: string;
  uniqueAgents: number;
}

export interface ExplorerAllTimeOverview {
  volumeUsd: string;
  feesUsd: string;
  registeredAgents: number;
}

export interface ExplorerNetworkOverview {
  transactions: number;
  volumeUsd: string;
}

export interface ExplorerOverview {
  timestamp: string;
  ledger: ExplorerLedgerOverview;
  last24h: ExplorerActivityWindow;
  allTime: ExplorerAllTimeOverview;
  byNetwork: Record<string, ExplorerNetworkOverview>;
  recentTransactions: Array<ExplorerTransactionSummary>;
}

export interface ExplorerTransactionListResponse {
  transactions: Array<ExplorerTransactionSummary>;
  total: number;
  page: number;
  pageSize: number;
}
