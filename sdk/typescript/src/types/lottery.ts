import type { CommercePaymentPayload } from "./commerce.js";

/** Lifecycle state of a lottery round. Exactly one round is `open` at a time. */
export type LotteryRoundStatus = "open" | "drawing" | "settled" | "cancelled";

/** Binds a round to its on-chain escrow vault and settlement program. */
export interface LotteryEscrow {
  vault: string;
  contract: string;
}

/**
 * One drawn winner of a settled round: `rank` 1 = first drawn = largest prize.
 * Amounts are USDC base-unit strings.
 */
export interface LotteryWinner {
  rank: number;
  owner: string;
  cryptoId?: string;
  tickets: number;
  payoutMicros: string;
  txHash?: string;
}

/** A snapshot of one owner's ticket count in a round. */
export interface LotteryHolding {
  owner: string;
  cryptoId?: string;
  tickets: number;
}

/**
 * Canonical record of a single 24h pooled pot. Amounts are USDC base-unit
 * strings (6 decimals). `secret`, `holdings`, and `winners` are populated only
 * once the round is settled.
 */
export interface LotteryRound {
  roundId: string;
  status: LotteryRoundStatus;
  ticketPriceMicros: string;
  asset: string;
  network: string;
  escrow: LotteryEscrow;
  feeBps: number;
  decayBps: number;
  winnerFractionBps: number;
  maxWinners: number;
  minParticipants: number;
  potMicros: string;
  ticketCount: number;
  participantCount: number;
  seedCommit: string;
  openedAt: string;
  cutoffAt: string;
  settledAt?: string | null;
  secret?: string;
  holdings?: Array<LotteryHolding>;
  winners: Array<LotteryWinner>;
  rakeMicros?: string;
  settlementTxHashes: Array<string>;
  updatedAt: string;
}

/**
 * The `GET /lottery` response: the current open round plus the caller's
 * holdings in it (when an `X-Agent-ID` is supplied).
 */
export interface LotteryView {
  round: LotteryRound | null;
  holdings: number;
}

/** Filters for a paged listing of past rounds (`GET /lottery/rounds`). */
export interface LotteryRoundQueryParams {
  status?: LotteryRoundStatus;
  limit?: number;
  offset?: number;
}

/** Wrapper for the `GET /lottery/rounds` listing response. */
export interface LotteryRoundsResponse {
  rounds: Array<LotteryRound>;
}

/**
 * Body of `POST /lottery/buy`. `amountMicros` must be a whole multiple of the
 * round's ticket price. `paymentAuthorization`/`payment` carry the x402
 * authorization on the retried (paid) request.
 */
export interface LotteryBuyRequest {
  agentId: string;
  cryptoId?: string;
  amountMicros: string;
  paymentAuthorization?: string;
  payment?: CommercePaymentPayload;
  txHash?: string;
}

/** Response to a settled `POST /lottery/buy`. */
export interface LotteryBuyResponse {
  round: LotteryRound | null;
  tickets: number;
  holdings: number;
  txHash?: string;
}

/**
 * Body of `POST /lottery/transfer`, signed by `from`. Moves `tickets` of the
 * caller's open-round claim to another agent.
 */
export interface LotteryTransferRequest {
  from: string;
  to: string;
  toCryptoId?: string;
  tickets: number;
}

/** One side of the transfer result (owner + resulting ticket count). */
export interface LotteryTransferParty {
  owner: string;
  tickets: number;
}

/** Response to `POST /lottery/transfer`. */
export interface LotteryTransferResponse {
  roundId: string;
  from: LotteryTransferParty;
  to: LotteryTransferParty;
}

/**
 * Body of `POST /lottery/rounds/{roundId}/draw`, an operator-only action.
 * `operator` defaults server-side from the `X-Agent-ID` header.
 */
export interface LotteryDrawRequest {
  operator?: string;
}
