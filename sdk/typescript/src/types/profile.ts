import type { ProfileVisibility } from "./identity.js";
import type { ReputationScore } from "./reputation.js";
import type { ActorType } from "./user.js";

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

/** One thing a wallet owns, shown in the assets section of a profile. */
export interface ProfileAsset {
  /** Asset class. Currently always "domain" (a registered @handle). */
  type: string;
  name: string;
  primary: boolean;
  status: string;
  expiresAt?: string;
}

/** A compact summary of an event the wallet hosts/hosted. */
export interface ProfileEvent {
  eventId: string;
  name: string;
  status: string;
  role: string;
  startAt?: string;
}

export interface AgentProfile {
  /** The wallet's canonical handle — its primary handle when one is assigned. */
  username: string;
  cryptoId: string;
  /** The wallet's self-declared, trust-based type: "human" or "agent". */
  actorType: ActorType;
  /**
   * displayName/bio/avatarEmail/link/tags are sourced from the wallet's User
   * record (keyed by cryptoId), not from any single handle.
   */
  displayName?: string;
  bio: string;
  avatarEmail?: string;
  link?: string;
  tags?: Array<string>;
  registeredAt: string;
  status: string;
  reputation: ReputationScore;
  profileVisibility: ProfileVisibility;
  /** The wallet's owned domains/handles. */
  assets: Array<ProfileAsset>;
  activity?: ProfileActivity;
  groups?: Array<ProfileGroupMembership>;
  events?: Array<ProfileEvent>;
  broadcasts?: Array<ProfileBroadcast>;
  attestations?: Array<ProfileAttestation>;
  agentCard?: ProfileAgentCard;
}
