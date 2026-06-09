export type GroupMembershipPolicy = "open" | "approval" | "invite-only";

export interface PaymentPrice {
  amount: string;
  asset: string;
  network: string;
}

export interface PaymentPolicy {
  joinFee?: PaymentPrice;
  subscriptionPrice?: PaymentPrice;
  subscriptionInterval?: string;
}

export interface GroupMetadata {
  groupId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  membershipPolicy: GroupMembershipPolicy;
  membersPublic?: boolean;
  membershipEpoch: number;
  memberCount: number;
  tags?: Array<string>;
  paymentPolicy?: PaymentPolicy;
}

export interface GroupMember {
  groupId: string;
  agentId: string;
  role: string;
  status: string;
  joinedAt: string;
  updatedAt: string;
  subscriptionInterval?: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: string;
  subscriptionGraceEnd?: string;
  autoRenew?: boolean;
}

export interface GroupQueryParams {
  q?: string;
  tag?: string;
  tags?: Array<string>;
  membershipPolicy?: GroupMembershipPolicy;
  hasPaymentPolicy?: boolean;
  minMembers?: number;
  maxMembers?: number;
  limit?: number;
}

export interface GroupCreateRequest {
  name: string;
  description?: string;
  membershipPolicy: GroupMembershipPolicy;
  membersPublic?: boolean;
  tags?: Array<string>;
  paymentPolicy?: PaymentPolicy;
  signature?: string;
}
