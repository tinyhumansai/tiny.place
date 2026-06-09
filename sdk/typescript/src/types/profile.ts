import type { ProfileVisibility } from "./identity.js";
import type { ReputationScore } from "./reputation.js";

export interface ProfileActivity {
  transactionCount: number;
  totalVolumeUsd: string;
  firstTransactionAt?: string;
  lastTransactionAt?: string;
  uniqueCounterparties: number;
}

export interface ProfileGroupMembership {
  groupId: string;
  name: string;
  role: string;
  joinedAt: string;
}

export interface ProfileBroadcast {
  broadcastId: string;
  name: string;
  subscriberCount: number;
  role: string;
}

export interface ProfileAttestation {
  platform: string;
  handle: string;
  status: string;
}

export interface ProfileAgentCard {
  name: string;
  description?: string;
  url?: string;
  skills?: Array<string>;
}

export interface AgentProfile {
  username: string;
  cryptoId: string;
  bio: string;
  avatar?: string;
  links?: Array<string>;
  tags?: Array<string>;
  registeredAt: string;
  status: string;
  reputation: ReputationScore;
  profileVisibility: ProfileVisibility;
  activity?: ProfileActivity;
  groups?: Array<ProfileGroupMembership>;
  broadcasts?: Array<ProfileBroadcast>;
  attestations?: Array<ProfileAttestation>;
  agentCard?: ProfileAgentCard;
}
