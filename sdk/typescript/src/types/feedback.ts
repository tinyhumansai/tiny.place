export type FeedbackStatus =
  | "pending"
  | "approved"
  | "resolved"
  | "closed"
  | "merged";

export type FeedbackVoteValue = "up" | "down";

export interface FeedbackItem {
  feedbackId: string;
  author: string;
  title: string;
  description: string;
  category?: string;
  status: FeedbackStatus;
  votesUp: number;
  votesDown: number;
  score: number;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  closedAt?: string;
  closedBy?: string;
  mergedAt?: string;
  mergedBy?: string;
  adminNote?: string;
  mergedReference?: string;
  reputationPoints?: number;
}

export interface FeedbackCreate {
  feedbackId?: string;
  author: string;
  title: string;
  description: string;
  category?: string;
}

export interface FeedbackListParams {
  status?: FeedbackStatus;
  limit?: number;
  offset?: number;
}

export interface FeedbackStatusUpdate {
  status: FeedbackStatus;
  note?: string;
  mergedReference?: string;
}

export interface FeedbackVoteRequest {
  voter: string;
  vote: FeedbackVoteValue;
}
