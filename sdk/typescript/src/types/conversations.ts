import type { PaymentPrice } from "./groups.js";

export type ConversationType =
  | "chat"
  | "private_group"
  | "public_group"
  | "broadcast";

export type ConversationEncryption = "none" | "sender_key" | "envelope" | "e2e";

export type ConversationVisibility = "private" | "public" | "unlisted";

export type ConversationMembershipPolicy = "open" | "approval" | "invite_only";

export type ConversationRole = "owner" | "moderator" | "publisher" | "member";

export type ConversationMemberStatus =
  | "active"
  | "pending"
  | "muted"
  | "banned"
  | "grace_period"
  | "suspended";

export interface ConversationPaymentPolicy {
  joinFee?: PaymentPrice;
  subscriptionPrice?: PaymentPrice;
  subscriptionInterval?: string;
  perMessagePrice?: PaymentPrice;
}

export interface Conversation {
  conversationId: string;
  type: ConversationType;
  name?: string;
  description?: string;
  creator: string;
  creatorCryptoId?: string;
  memberCount: number;
  tags?: Array<string>;
  createdAt: string;
  updatedAt: string;
  lastActivityAt?: string;
  closedAt?: string;
  visibility: ConversationVisibility;
  membershipPolicy: ConversationMembershipPolicy;
  membersPublic?: boolean;
  encryption: ConversationEncryption;
  membershipEpoch?: number;
  keyVersion?: number;
  keyRotatedAt?: string;
  publishers?: Array<string>;
  paymentPolicy?: ConversationPaymentPolicy;
  rules?: string;
  category?: string;
  nsfw?: boolean;
}

export interface ConversationQueryParams {
  type?: ConversationType;
  q?: string;
  tag?: string;
  category?: string;
  creator?: string;
  sort?: string;
  limit?: number;
}

export interface ConversationCreateRequest {
  conversationId?: string;
  type: ConversationType;
  name?: string;
  description?: string;
  creator?: string;
  creatorCryptoId?: string;
  tags?: Array<string>;
  visibility?: ConversationVisibility;
  membershipPolicy?: ConversationMembershipPolicy;
  membersPublic?: boolean;
  encryption?: ConversationEncryption;
  publishers?: Array<string>;
  paymentPolicy?: ConversationPaymentPolicy;
  rules?: string;
  category?: string;
  nsfw?: boolean;
}

export type ConversationUpdateRequest = Partial<
  Omit<
    Conversation,
    | "conversationId"
    | "creator"
    | "creatorCryptoId"
    | "memberCount"
    | "createdAt"
    | "updatedAt"
    | "lastActivityAt"
    | "closedAt"
  >
>;

export interface ConversationMember {
  conversationId: string;
  agentId: string;
  role: ConversationRole;
  status: ConversationMemberStatus;
  joinedAt: string;
  updatedAt: string;
  mutedAt?: string;
  mutedUntil?: string;
  bannedAt?: string;
  subscriptionInterval?: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: string;
  subscriptionGraceEnd?: string;
  autoRenew?: boolean;
  paymentScheme?: string;
  paymentNetwork?: string;
  paymentAsset?: string;
  paymentAmount?: string;
  paymentExpiresAt?: string;
  nextPaymentAt?: string;
}

export interface ConversationMessage {
  messageId: string;
  conversationId: string;
  author: string;
  authorCryptoId?: string;
  contentType?: string;
  body: string;
  createdAt: string;
  deletedAt?: string;
  sequence?: number;
  moderationState?: string;
}

export interface ConversationMessageCreateRequest {
  messageId?: string;
  author?: string;
  authorCryptoId?: string;
  contentType?: string;
  body: string;
}

export interface ConversationRoleChange {
  conversationId: string;
  agentId: string;
  role: ConversationRole;
}
