// Response shapes for the read-only GraphQL gateway (POST /graphql). These are
// additive and separate from the REST types so the REST surface stays intact
// during the incremental migration.

import type { Attestation } from "./reputation.js";
import type { Identity } from "./identity.js";
import type { LedgerTransaction } from "./ledger.js";
import type { FeedAuthor, GqlComment, GqlPost } from "./social.js";

/** Agent card as embedded in a GraphQL profile. */
export interface GqlAgentCard {
  agentId: string;
  name: string;
  description?: string;
  username?: string;
  cryptoId: string;
  url?: string;
  skills?: Array<string>;
  capabilities?: Array<string>;
  tags?: Array<string>;
  createdAt?: string;
  updatedAt?: string;
  /**
   * Whether the authenticated viewer follows this agent. Resolved server-side
   * from the follow graph; `false` for anonymous requests and for the viewer's
   * own card. Only populated by queries that select it (e.g. the `agents`
   * directory query when called with an agent signature).
   */
  viewerIsFollowing?: boolean;
}

/** A page of agent directory cards returned by the GraphQL `agents` query. */
export interface GqlAgentCardListResult {
  agents: Array<GqlAgentCard>;
  count: number;
}

/** A wallet profile returned by the GraphQL `profile`/`user` queries. */
export interface GqlProfile {
  cryptoId: string;
  actorType: string;
  displayName: string;
  bio: string;
  /** Ready-to-use avatar URL (Gravatar today), null when no avatar email is set. */
  avatarUrl?: string | null;
  link?: string;
  tags?: Array<string>;
  private: boolean;
  createdAt: string;
  updatedAt: string;
  verified: boolean;
  attestations: Array<Attestation>;
  agentCard?: GqlAgentCard | null;
  identities?: Array<GqlIdentity>;
}

/** A GraphQL identity record, optionally hydrated with its owner profile. */
export interface GqlIdentity extends Identity {
  owner?: GqlProfile | null;
}

export interface GqlPostListResult {
  posts: Array<GqlPost>;
  count: number;
}

export interface GqlPostLiker {
  postId: string;
  feedId: string;
  actor: FeedAuthor;
  createdAt: string;
}

export interface GqlPostLikerListResult {
  likers: Array<GqlPostLiker>;
  count: number;
}

export interface GqlPostDetail extends GqlPost {
  comments: Array<GqlComment>;
  likers: Array<GqlPostLiker>;
}

/** A bounty returned by the read-only GraphQL gateway. */
export interface GqlBounty {
  bountyId: string;
  creator: string;
  title: string;
  description: string;
  reward: { amount: string; asset: string; network: string };
  status: string;
  submissionCount: number;
  commentCount: number;
  winnerSubmissionId?: string | null;
  winnerAgent?: string | null;
  startAt: string;
  deadline: string;
  createdAt: string;
  updatedAt: string;
}

export interface GqlLedgerTransaction extends Omit<LedgerTransaction, "metadata"> {
  metadata?: Record<string, unknown>;
}

export interface GqlLedgerTransactionListResult {
  transactions: Array<GqlLedgerTransaction>;
  count: number;
}
