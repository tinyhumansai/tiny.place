// Response shapes for the read-only GraphQL gateway (POST /graphql). These are
// additive and separate from the REST types so the REST surface stays intact
// during the incremental migration.

import type { Attestation } from "./reputation.js";
import type { Identity } from "./identity.js";
import type {
  IdentityListing,
  IdentityBid,
  IdentityOffer,
  IdentitySale,
  MarketplacePrice,
} from "./marketplace.js";
import type { JobPosting } from "./jobs.js";
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

/** A marketplace product returned by the GraphQL gateway, seller hydrated. */
export interface GqlProduct {
  productId: string;
  name: string;
  description: string;
  category: string;
  tags?: Array<string>;
  price: { amount: string; asset: string; network: string };
  deliveryMethod: string;
  status: string;
  salesCount: number;
  rating: number;
  createdAt: string;
  updatedAt: string;
  seller: {
    handle: string;
    cryptoId: string;
    displayName: string;
    verified: boolean;
  };
}

export interface GqlProductListResult {
  products: Array<GqlProduct>;
  count: number;
}

export interface GqlIdentityBid
  extends Omit<IdentityBid, "bidder" | "price"> {
  bidder: FeedAuthor;
  price: MarketplacePrice;
}

export interface GqlIdentitySale
  extends Omit<IdentitySale, "seller" | "buyer" | "price"> {
  seller: FeedAuthor;
  buyer: FeedAuthor;
  price: MarketplacePrice;
}

export interface GqlIdentityOffer
  extends Omit<IdentityOffer, "buyer" | "price"> {
  buyer: FeedAuthor;
  price: MarketplacePrice;
}

export interface GqlIdentityListing
  extends Omit<IdentityListing, "seller" | "price" | "reservePrice" | "highestBid"> {
  seller: FeedAuthor;
  price: MarketplacePrice;
  reservePrice?: MarketplacePrice;
  highestBid?: GqlIdentityBid;
}

export interface GqlIdentityListingDetail extends GqlIdentityListing {
  bids: Array<GqlIdentityBid>;
  history: Array<GqlIdentitySale>;
}

export interface GqlIdentityListingListResult {
  listings: Array<GqlIdentityListing>;
  count: number;
}

export interface GqlIdentityBidListResult {
  bids: Array<GqlIdentityBid>;
  count: number;
}

export interface GqlIdentityOfferListResult {
  offers: Array<GqlIdentityOffer>;
  count: number;
}

export interface GqlIdentitySaleListResult {
  sales: Array<GqlIdentitySale>;
  count: number;
}

export interface GqlJobPosting extends JobPosting {
  clientProfile: FeedAuthor;
}

export interface GqlJobListResult {
  jobs: Array<GqlJobPosting>;
  count: number;
}

export interface GqlLedgerTransaction extends Omit<LedgerTransaction, "metadata"> {
  metadata?: Record<string, unknown>;
}

export interface GqlLedgerTransactionListResult {
  transactions: Array<GqlLedgerTransaction>;
  count: number;
}
