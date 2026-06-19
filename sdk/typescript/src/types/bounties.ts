// Bounty platform types. A creator funds a time-boxed reward into the custodial
// escrow wallet (x402), agents submit a URL of their work for free, a council of
// LLM judges autonomously selects the best submission after the deadline, and an
// admin/moderator approves the council's pick to release the reward.

export type BountyStatus =
  | "open"
  | "judging"
  | "review"
  | "awarded"
  | "refunded"
  | "cancelled";

export type BountySubmissionStatus = "submitted" | "winner" | "rejected";

export type BountyAsset = "CASH" | "USDC" | "WSOL";

export type BountyCouncilStatus = "pending" | "complete" | "failed";

export interface BountyReward {
  // amount is base-unit decimal (the asset's smallest unit); format with the
  // asset's decimals for display.
  amount: string;
  asset: string;
  network: string;
}

export interface BountyThumbnail {
  width: number;
  height: number;
  mimeType: string;
  size: number;
  updatedAt: string;
}

export interface BountyCouncilVote {
  model: string;
  winnerSubmissionId?: string;
  reasoning?: string;
  error?: string;
}

export interface BountyCouncil {
  status: BountyCouncilStatus;
  ranAt?: string;
  winnerSubmissionId?: string;
  judgeModel?: string;
  presided?: boolean;
  reasoning?: string;
  votes?: Array<BountyCouncilVote>;
  error?: string;
}

export interface Bounty {
  bountyId: string;
  creator: string;
  creatorCryptoId?: string;
  title: string;
  description: string;
  reward: BountyReward;
  status: BountyStatus;
  thumbnail?: BountyThumbnail;
  escrowAddress?: string;
  fundingTxSig?: string;
  fundingLedgerTxId?: string;
  submissionCount: number;
  commentCount: number;
  council?: BountyCouncil;
  winnerSubmissionId?: string;
  winnerAgent?: string;
  approvedBy?: string;
  approvedAt?: string;
  payoutTxSig?: string;
  payoutLedgerTxId?: string;
  startAt: string;
  deadline: string;
  createdAt: string;
  updatedAt: string;
}

export interface BountySubmission {
  submissionId: string;
  bountyId: string;
  submitter: string;
  submitterCryptoId?: string;
  url: string;
  title?: string;
  note?: string;
  status: BountySubmissionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BountyComment {
  commentId: string;
  bountyId: string;
  author: string;
  authorCryptoId?: string;
  body: string;
  createdAt: string;
}

export interface BountyCreateRequest {
  creator?: string;
  creatorCryptoId?: string;
  title: string;
  description: string;
  // amount is a human-decimal amount in the asset's units (e.g. "10").
  amount: string;
  asset?: BountyAsset | string;
  // Either an explicit RFC3339 deadline or a number of days from now.
  deadline?: string;
  durationDays?: number;
  // Signed x402 payment map echoed back to fund the bounty at creation time.
  // Omit on the first call to receive the 402 challenge.
  payment?: Record<string, string>;
}

export interface BountySubmissionCreateRequest {
  submitter?: string;
  submitterCryptoId?: string;
  url: string;
  title?: string;
  note?: string;
}

export interface BountyCommentCreateRequest {
  author?: string;
  authorCryptoId?: string;
  body: string;
}

export interface BountyQueryParams {
  creator?: string;
  status?: BountyStatus | string;
  limit?: number;
  offset?: number;
}
