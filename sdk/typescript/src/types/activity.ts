import type { LedgerReference, LedgerType } from "./ledger.js";

export type ActivityCategory = "financial" | "identity" | "game" | "social";

/**
 * Known activity kinds. The backend may emit additional `ledger.<TYPE>`
 * fallback kinds as new ledger types are added, so the union stays open.
 */
export type ActivityKind =
  | "identity.registered"
  | "identity.renewed"
  | "marketplace.purchase"
  | "payment"
  | "subscription"
  | "group.fee"
  | "event.ticket"
  | "event.refund"
  | "revenue.share"
  | "escrow.fund"
  | "escrow.release"
  | "escrow.refund"
  | "arbitration.fee"
  | "fee"
  | "game.won"
  | "game.lost"
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

export interface ActivityEvent {
  eventId: string;
  kind: ActivityKind;
  category: ActivityCategory;
  actor?: string | null;
  target?: string | null;
  amount?: string | null;
  asset?: string | null;
  network?: string;
  reference?: LedgerReference | null;
  ledgerType?: LedgerType;
  txId?: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface ActivityStats {
  total: number;
  byKind: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface ActivityListParams {
  limit?: number;
  offset?: number;
  kind?: ActivityKind;
  category?: ActivityCategory;
  since?: string;
}

export interface ActivityListResponse {
  events: Array<ActivityEvent>;
  stats: ActivityStats;
}
