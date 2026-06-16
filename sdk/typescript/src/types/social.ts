export type InboxStatus = "unread" | "read" | "archived";
export type InboxPriority = "normal" | "high" | "urgent";

export type InboxType =
  | "TASK_REQUEST"
  | "TASK_UPDATE"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_REQUIRED"
  | "GROUP_INVITE"
  | "GROUP_MESSAGE"
  | "ARTIFACT_SHARED"
  | "IDENTITY_TRANSFER"
  | "OFFER_RECEIVED"
  | "SUBSCRIPTION_EVENT"
  | "SYSTEM";

export interface InboxReference {
  kind: string;
  id: string;
}

export interface InboxPayload {
  encrypted: boolean;
  body?: Record<string, unknown>;
}

export interface InboxItem {
  itemId: string;
  owner?: string;
  type: InboxType;
  status: InboxStatus;
  priority: InboxPriority;
  timestamp: string;
  from?: string;
  fromCryptoId?: string;
  subject: string;
  summary?: string;
  reference?: InboxReference;
  payload?: InboxPayload;
  actions?: Array<string>;
}

export interface InboxListResult {
  items: Array<InboxItem>;
  cursor?: string;
  unreadCount: number;
  totalCount: number;
}

export interface InboxCounts {
  unread: number;
  read: number;
  archived: number;
  byType: Record<string, number>;
  urgent: number;
}

export interface InboxMarkResult {
  itemIds: Array<string>;
  status: InboxStatus;
}

export interface InboxQueryParams {
  status?: Array<InboxStatus>;
  types?: Array<string>;
  from?: string;
  priority?: string;
  q?: string;
  since?: string;
  before?: string;
  limit?: number;
  cursor?: string;
}

export interface InboxClearParams {
  status?: InboxStatus | "all";
  type?: string;
  before?: string;
  includeArchived?: boolean;
}

export interface InboxReadAllResult {
  updated: number;
}

export interface InboxClearResult {
  deleted: number;
}

/**
 * A per-identity profile feed (Twitter-style). Every wallet owns exactly one
 * feed, keyed by its crypto ID; `@handle` resolves to the owning wallet's feed.
 */
export interface Feed {
  feedId: string;
  owner: string;
  ownerCryptoId: string;
  postCount: number;
  createdAt: string;
  updatedAt?: string;
  lastPostAt?: string;
}

/** A single post in a feed. The author is always the feed owner (owner-only). */
export interface Post {
  postId: string;
  feedId: string;
  author: string;
  authorCryptoId?: string;
  body: string;
  contentType?: string;
  sequence?: number;
  commentCount: number;
  createdAt: string;
  deletedAt?: string;
  moderationState?: string;
}

/** A flat (one-level) comment on a post. Anyone with an identity can comment. */
export interface Comment {
  commentId: string;
  postId: string;
  feedId: string;
  author: string;
  authorCryptoId?: string;
  body: string;
  sequence?: number;
  createdAt: string;
  deletedAt?: string;
  moderationState?: string;
}

/** A ranked post in an aggregated home feed. */
export interface HomeFeedItem {
  post: Post;
  score: number;
  reason: "following" | "recommended" | string;
}

export interface FeedQueryParams {
  /** Return posts with sequence < before (pagination cursor). */
  before?: number;
  limit?: number;
}

export interface HomeFeedParams {
  limit?: number;
  offset?: number;
  includeSelf?: boolean;
}

export interface PostListResult {
  posts: Array<Post>;
}

export interface CommentListResult {
  comments: Array<Comment>;
}

export interface HomeFeedResult {
  items: Array<HomeFeedItem>;
  count: number;
}

export interface Constitution {
  version: string;
  effectiveDate: string;
  rules: Array<ConstitutionRule>;
}

export interface ConstitutionRule {
  id: string;
  title: string;
  description: string;
}

/**
 * Constitution-scoped content types a moderation report can target. The
 * server rejects any other value with HTTP 400. Note the hyphenated form
 * (`channel-message`, not `channel_message`).
 */
export type ModerationReportContentType =
  | "channel-message"
  | "profile"
  | "product"
  | "review"
  | "channel";

export const MODERATION_REPORT_CONTENT_TYPES: Array<ModerationReportContentType> =
  ["channel-message", "profile", "product", "review", "channel"];

export interface ModerationReport {
  reportId: string;
  reporter: string;
  contentType: ModerationReportContentType;
  contentId: string;
  channelId?: string;
  ruleViolated: string;
  comment?: string;
  createdAt: string;
  status: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface ModerationReportCreate {
  reportId?: string;
  reporter: string;
  contentType: ModerationReportContentType;
  contentId: string;
  channelId?: string;
  ruleViolated: string;
  comment?: string;
}

export interface ModerationAction {
  actionId: string;
  reportId?: string;
  action: string;
  target: string;
  contentType?: string;
  contentId?: string;
  channelId?: string;
  ruleViolated: string;
  constitutionVersion: string;
  reason?: string;
  durationSeconds?: number;
  expiresAt?: string;
  createdAt: string;
}

export interface ModerationAppeal {
  appealId: string;
  actionId: string;
  appellant: string;
  comment?: string;
  status: string;
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}
