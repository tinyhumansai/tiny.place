export type IdentityStatus =
  | "active"
  | "expiring"
  | "auction"
  | "expired"
  | "released"
  | "deleted";

export interface PaymentMethod {
  network: string;
  address: string;
  assets: Array<string>;
}

export interface Identity {
  username: string;
  cryptoId: string;
  publicKey: string;
  registeredAt: string;
  expiresAt: string;
  status: IdentityStatus;
  registrationTx?: string;
  paymentMethods?: Array<PaymentMethod>;
  /**
   * Whether this name is the owner wallet's assigned/primary handle. At most
   * one name per wallet is primary; a primary name is locked from sale.
   */
  primary?: boolean;
  subnames?: Array<Subname>;
  signature?: string;
  payment?: Record<string, string>;
  lastRenewalTx?: string;
  updatedAt: string;
}

export interface Subname {
  subname: string;
  target: string;
  bio?: string;
  createdAt: string;
}

export interface RenewalRequest {
  payment?: Record<string, string>;
  signature?: string;
}

export interface IdentityClaimRequest {
  cryptoId: string;
  publicKey: string;
  payment?: Record<string, string>;
  signature?: string;
}

/**
 * Request body for a direct, no-payment transfer of a @handle to another
 * wallet. `cryptoId`/`publicKey` identify the recipient; `signature` is the
 * CURRENT owner's authorization over the `identity.transfer` payload.
 */
export interface IdentityTransferRequest {
  cryptoId: string;
  publicKey: string;
  signature?: string;
}

export interface SubnameCreateRequest {
  subname: string;
  target: string;
  bio?: string;
  createdAt?: string;
  signature?: string;
}

export interface AvailabilityResponse {
  available: boolean;
  name: string;
  identity?: Identity;
  lifecycle?: IdentityLifecycle;
}

export interface IdentityExport {
  identity: Identity;
  ledgerTransactions: Array<import("./ledger.js").LedgerTransaction>;
  exportedAt: string;
  verification: Record<string, string>;
  proofs: IdentityExportProofs;
}

export interface IdentityExportProofs {
  ownership: IdentityOwnershipProof;
  ledgerReferences: Array<IdentityLedgerReferenceProof>;
}

export interface IdentityOwnershipProof {
  algorithm: string;
  cryptoId: string;
  publicKey: string;
  publicKeyMatchesCryptoId: boolean;
}

export interface IdentityLedgerReferenceProof {
  txId: string;
  onChainTx: string;
  network: string;
  status: import("./ledger.js").LedgerStatus;
  type: import("./ledger.js").LedgerType;
  reference: import("./ledger.js").LedgerReference;
}

export interface IdentityLifecycle {
  phase: string;
  annualFee: string;
  graceEndsAt?: string;
  auctionStartsAt?: string;
  auctionEndsAt?: string;
  availableAt?: string;
  currentPrice?: string;
}

export interface ProfileVisibility {
  activity: boolean;
  groups: boolean;
  broadcasts: boolean;
  attestations: boolean;
  agentCard: boolean;
  searchEngineIndexing: boolean;
}

export interface ProfileVisibilityUpdate {
  activity?: boolean;
  groups?: boolean;
  broadcasts?: boolean;
  attestations?: boolean;
  agentCard?: boolean;
  searchEngineIndexing?: boolean;
  signature?: string;
}
