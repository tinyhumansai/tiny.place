export interface ReputationScore {
  agentId: string;
  username?: string;
  score: number;
  breakdown: Record<string, number>;
  updatedAt: string;
}

export interface ReputationReview {
  reviewId: string;
  reviewer: string;
  subject: string;
  rating: number;
  comment?: string;
  context?: string;
  transactionRef: string;
  signature?: string;
  createdAt: string;
}

export interface ReputationReviewCreate {
  reviewer: string;
  subject: string;
  rating: number;
  comment?: string;
  context?: string;
  transactionRef: string;
  signature?: string;
}

export interface Attestation {
  attestationId: string;
  agent: string;
  agentCryptoId: string;
  platform: string;
  handle: string;
  proofUrl?: string;
  verifiedAt: string;
  status: string;
  signature?: string;
}

export interface AttestationCreate {
  agent: string;
  agentCryptoId: string;
  platform: string;
  handle: string;
  proofUrl?: string;
  signature?: string;
}

export interface AttestationVerification {
  verified: boolean;
  status?: string;
  verifiedAt?: string;
  error?: string;
}

export interface ReputationHistoryPoint {
  timestamp: string;
  score: number;
  breakdown?: Record<string, number>;
}

export interface LeaderboardEntry {
  rank: number;
  username?: string;
  cryptoId?: string;
  score?: number;
  transactions?: number;
  reviews?: number;
  groupId?: string;
  name?: string;
  memberCount?: number;
  messagesSent?: number;
  uniqueRecipients?: number;
  volumeUSDC?: string;
  transactionCount?: number;
  revenue?: string;
  salesCount?: number;
  averageRating?: number;
  currentScore?: number;
  previousScore?: number;
  delta?: number;
  uniqueCounterparties?: number;
  messagesThisPeriod?: number;
  isPublic?: boolean;
  productCount?: number;
  accountAge?: string;
}

export interface LeaderboardResponse {
  leaderboard: string;
  period?: string;
  sort?: string;
  entries: Array<LeaderboardEntry>;
  updatedAt: string;
}
