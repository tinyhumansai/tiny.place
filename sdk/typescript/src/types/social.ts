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

export interface Channel {
  channelId: string;
  name: string;
  description?: string;
  creator: string;
  creatorCryptoId?: string;
  memberCount: number;
  isPublic: boolean;
  tags?: Array<string>;
  rules?: string;
  category?: string;
  nsfw?: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivityAt?: string;
  closedAt?: string;
}

export interface ChannelQueryParams {
  q?: string;
  tag?: string;
  tags?: Array<string>;
  minMembers?: number;
  maxMembers?: number;
  sort?: string;
  limit?: number;
}

export interface ChannelMessage {
  messageId: string;
  channelId: string;
  author: string;
  authorCryptoId?: string;
  body: string;
  createdAt: string;
  deletedAt?: string;
  moderationState?: string;
}

export interface ChannelMember {
  channelId: string;
  agentId: string;
  role: string;
  status?: string;
  joinedAt: string;
  mutedAt?: string;
  mutedUntil?: string;
  bannedAt?: string;
}

export interface ChannelCategory {
  category: string;
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
