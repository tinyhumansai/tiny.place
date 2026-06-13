import type { LedgerTransaction } from "./ledger.js";

export type GameRoomStatus = "waiting" | "playing" | "paused" | "closed";

/** Poker betting actions accepted by `POST /rooms/{id}/action`. */
export type GameAction =
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "all-in"
  | "post_blind";

export interface GameStakes {
  smallBlind: string;
  bigBlind: string;
  asset: string;
  network: string;
}

export interface GameBuyIn {
  min: string;
  max: string;
}

export interface GameEscrow {
  contract: string;
  network: string;
}

export interface GameSeat {
  seat: number;
  handle?: string;
  cryptoId?: string;
  stack: string;
  status: string;
  consecutiveTimeouts?: number;
  disconnectedAt?: string;
  emergencyWithdrawal?: GameEmergencyWithdrawal;
}

export interface GameEmergencyWithdrawal {
  requestedAt?: string;
  executableAt?: string;
  requestTxHash?: string;
  cancelTxHash?: string;
  status?: string;
}

export interface GameEmergencyWithdrawalRequest {
  operator?: string;
  agentId: string;
  requestTxHash: string;
  requestedAt?: string;
}

export interface GameEmergencyWithdrawalResponse {
  room: GameRoom;
  seat: GameSeat;
  withdrawal: GameEmergencyWithdrawal;
}

export interface GameTimeouts {
  decision: number;
  disconnectGrace: number;
}

export interface GameRake {
  rate: string;
  cap: string;
}

export interface GameHandAction {
  seat: number;
  agentId?: string;
  round?: string;
  action: string;
  amount?: string;
  txHash?: string;
  createdAt: string;
}

export interface GameHandWinner {
  seat: number;
  agent?: string;
  payout: string;
}

export interface GameHandPlayer {
  seat: number;
  handle?: string;
  cryptoId?: string;
  /** Hole cards encrypted to the seated player; opaque to everyone else. */
  encryptedHoleCards?: Array<string>;
  /** Plaintext hole cards, only present for the requesting player or after reveal. */
  holeCards?: Array<string>;
  revealed?: boolean;
  result?: string;
  payout?: string;
}

export interface GameHand {
  handId: string;
  roomId: string;
  number: number;
  status: string;
  pot: string;
  rake?: string;
  players?: Array<GameHandPlayer>;
  communityCards?: Array<string>;
  actions?: Array<GameHandAction>;
  winners?: Array<GameHandWinner>;
  /** On-chain settlement transaction hash (`txHash` on the wire). */
  txHash?: string;
  ledgerPayoutTxId?: string;
  ledgerRakeTxId?: string;
  deckSeedHash?: string;
  startedAt: string;
  completedAt?: string;
}

export interface GameRoom {
  roomId: string;
  game: string;
  variant: string;
  name: string;
  creator?: string;
  stakes: GameStakes;
  buyIn: GameBuyIn;
  escrow: GameEscrow;
  seats: number;
  players: Array<GameSeat>;
  observerCount: number;
  speed: string;
  timeouts: GameTimeouts;
  rake: GameRake;
  handNumber: number;
  status: GameRoomStatus;
  tags?: Array<string>;
  /** Live hand state; hole cards are redacted per requesting agent. */
  currentHand?: GameHand;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface GameRoomQueryParams {
  stakes?: string;
  speed?: string;
  status?: GameRoomStatus;
  game?: string;
  seats?: number;
  limit?: number;
}

export interface GameJoinRequest {
  agentId?: string;
  cryptoId?: string;
  buyIn?: string;
  paymentAuthorization?: string;
  txHash?: string;
}

export interface GameLeaveRequest {
  agentId?: string;
  txHash?: string;
}

export interface GameActionRequest {
  agentId?: string;
  handId?: string;
  round?: string;
  action: GameAction;
  amount?: string;
  paymentAuthorization?: string;
  txHash?: string;
}

export interface GameJoinResponse {
  room: GameRoom;
  seat: GameSeat;
  txHash?: string;
}

export interface GameLeaveResponse {
  room: GameRoom;
  seat: number;
  handle?: string;
  returned: string;
  txHash?: string;
}

export interface GameActionResponse {
  hand: GameHand;
  action: GameHandAction;
}

export interface GameOperatorRequest {
  operator?: string;
}

export interface GameCloseResponse {
  room: GameRoom;
  cashouts?: Array<LedgerTransaction>;
}

export interface GameStartHandResponse {
  hand: GameHand;
  refunds?: Array<LedgerTransaction>;
}

export interface GameSettleRequest {
  operator?: string;
  winners: Array<GameHandWinner>;
  rake?: string;
  txHash: string;
}

export interface GameTimeoutResponse {
  room: GameRoom;
  hand: GameHand;
  action: GameHandAction;
  seat?: GameSeat;
}
