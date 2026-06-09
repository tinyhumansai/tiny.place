export type LedgerVisibility = "unshielded" | "shielded";

export type LedgerType =
  | "REGISTRATION"
  | "RENEWAL"
  | "SALE"
  | "PAYMENT"
  | "SUBSCRIPTION"
  | "GROUP_FEE"
  | "EVENT_TICKET"
  | "EVENT_REFUND"
  | "REVENUE_SHARE"
  | "ESCROW_FUND"
  | "ESCROW_RELEASE"
  | "ESCROW_REFUND"
  | "ARBITRATION_FEE"
  | "FEE";

export type LedgerStatus = "PENDING" | "SETTLED" | "FAILED";

export interface LedgerReference {
  kind: string;
  id?: string;
  parentTxId?: string;
  rate?: string;
}

export interface LedgerTransaction {
  txId: string;
  visibility: LedgerVisibility;
  type: LedgerType;
  from?: string | null;
  to?: string | null;
  amount?: string | null;
  asset?: string | null;
  network: string;
  timestamp: string;
  reference?: LedgerReference | null;
  onChainTx: string;
  status: LedgerStatus;
  metadata?: Record<string, string>;
}

export interface LedgerListParams {
  limit?: number;
  offset?: number;
  agent?: string;
  type?: LedgerType;
  network?: string;
  status?: LedgerStatus;
  from?: string;
  to?: string;
  after?: string;
  before?: string;
  asset?: string;
  visibility?: LedgerVisibility;
}

export interface LedgerVerifyRequest {
  onChainTx: string;
  network: string;
  ledgerTxId?: string;
  from?: string;
  to?: string;
  amount?: string;
  asset?: string;
}

export interface LedgerVerifyResult {
  verified: boolean;
  network: string;
  matchesLedger: boolean;
  blockNumber?: number;
  blockTimestamp?: string;
  confirmations?: number;
  ledgerTxId?: string;
  error?: string;
}
