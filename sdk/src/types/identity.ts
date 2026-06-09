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

export interface IdentityMetadata {
  avatar?: string;
  links?: Array<string>;
  tags?: Array<string>;
}

export interface Identity {
  username: string;
  bio: string;
  cryptoId: string;
  publicKey: string;
  registeredAt: string;
  expiresAt: string;
  status: IdentityStatus;
  registrationTx?: string;
  paymentMethods?: Array<PaymentMethod>;
  metadata?: IdentityMetadata;
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

export interface IdentityProfileUpdate {
  bio?: string;
  metadata?: IdentityMetadata;
  signature?: string;
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
