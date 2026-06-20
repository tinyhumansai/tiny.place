import type { HttpClient } from "../http.js";
import {
  AGENT_CARD_QUERY,
  AGENTS_QUERY,
  BOUNTIES_QUERY,
  BOUNTY_QUERY,
  HOME_FEED_QUERY,
  IDENTITIES_QUERY,
  IDENTITY_BIDS_QUERY,
  IDENTITY_LISTING_QUERY,
  IDENTITY_LISTINGS_QUERY,
  IDENTITY_OFFERS_QUERY,
  IDENTITY_QUERY,
  IDENTITY_SALES_QUERY,
  JOB_QUERY,
  JOBS_QUERY,
  LEDGER_TRANSACTION_QUERY,
  LEDGER_TRANSACTIONS_QUERY,
  MARKETPLACE_PRODUCTS_QUERY,
  POST_LIKERS_QUERY,
  POST_QUERY,
  POST_COMMENTS_QUERY,
  PRODUCT_QUERY,
  USER_BY_CRYPTO_ID_QUERY,
  USER_PROFILE_QUERY,
  USER_POSTS_QUERY,
} from "../graphql/operations.js";
import type {
  GqlComment,
  GqlHomeFeedResult,
  HomeFeedParams,
} from "../types/social.js";
import type { Identity } from "../types/identity.js";
import type {
  AgentQueryParams,
  IdentityListingQueryParams,
} from "../types/directory.js";
import type { IdentityOffer, ProductQueryParams } from "../types/marketplace.js";
import type { JobQueryParams } from "../types/jobs.js";
import type { LedgerListParams } from "../types/ledger.js";
import type {
  GqlAgentCard,
  GqlAgentCardListResult,
  GqlBounty,
  GqlIdentity,
  GqlIdentityBidListResult,
  GqlIdentityListing,
  GqlIdentityListingDetail,
  GqlIdentityListingListResult,
  GqlIdentityOfferListResult,
  GqlIdentitySaleListResult,
  GqlJobListResult,
  GqlJobPosting,
  GqlLedgerTransaction,
  GqlLedgerTransactionListResult,
  GqlIdentityBid,
  GqlIdentityOffer,
  GqlIdentitySale,
  GqlPostDetail,
  GqlPostLiker,
  GqlPostLikerListResult,
  GqlPostListResult,
  GqlProduct,
  GqlProductListResult,
  GqlProfile,
} from "../types/graphql.js";
import type { GqlHomeFeedItem, GqlPost } from "../types/social.js";
import type { Attestation } from "../types/reputation.js";
import { asArray, asNumber, field, listField } from "../safe.js";

export interface BountyGraphQLParams {
  status?: string;
  creator?: string;
  limit?: number;
  offset?: number;
}

export interface PaginationGraphQLParams {
  limit?: number;
  offset?: number;
}

export type ProductGraphQLParams = Omit<ProductQueryParams, "q" | "type"> & {
  query?: string;
};

export interface CommentGraphQLParams {
  feedId?: string;
  limit?: number;
  after?: number;
}

export interface PostGraphQLParams {
  limit?: number;
  before?: number;
  viewer?: string;
}

export interface PostDetailGraphQLParams {
  viewer?: string;
  commentLimit?: number;
  commentAfter?: number;
  likerLimit?: number;
  likerOffset?: number;
}

export interface IdentityOfferGraphQLParams
  extends Partial<Pick<IdentityOffer, "buyer" | "name" | "status">> {
  agent?: string;
  limit?: number;
  offset?: number;
}

export interface IdentitySalesGraphQLParams {
  limit?: number;
  offset?: number;
}

export interface IdentityListingDetailGraphQLParams {
  bidLimit?: number;
  bidOffset?: number;
  historyLimit?: number;
  historyOffset?: number;
}

/**
 * GraphQLApi exposes the read-only gateway operations as typed methods, so
 * callers never hand-write query strings. Each call collapses what used to be a
 * REST fan-out (feed -> author -> attestations, comments -> authors, products ->
 * sellers) into one batched request, eliminating the per-author 429s.
 */
export class GraphQLApi {
  constructor(private readonly http: HttpClient) {}

  /** The authenticated viewer's ranked home feed. Signs as the agent. */
  homeFeed(params?: HomeFeedParams): Promise<GqlHomeFeedResult> {
    return this.http
      .graphql<{ homeFeed: GqlHomeFeedResult }>(
        HOME_FEED_QUERY,
        {
          limit: params?.limit,
          offset: params?.offset,
          includeSelf: params?.includeSelf,
        },
        { auth: "agent" },
      )
      .then((data) => ({
        items: listField<GqlHomeFeedItem>(data.homeFeed, "items"),
        count: asNumber(field(data.homeFeed, "count")),
      }));
  }

  /** Comments on a post, with authors (and verified status) embedded. Public. */
  postComments(
    postId: string,
    params?: CommentGraphQLParams,
  ): Promise<Array<GqlComment>> {
    return this.http
      .graphql<{ comments: Array<GqlComment> }>(POST_COMMENTS_QUERY, {
        postId,
        feedId: params?.feedId,
        limit: params?.limit,
        after: params?.after,
      })
      .then((data) => asArray<GqlComment>(data.comments));
  }

  /** Posts on a wallet/profile feed, with authors and viewer-like state embedded. Public. */
  posts(handle: string, params?: PostGraphQLParams): Promise<GqlPostListResult> {
    return this.http
      .graphql<{ posts: GqlPostListResult }>(USER_POSTS_QUERY, {
        handle,
        limit: params?.limit,
        before: params?.before,
        viewer: params?.viewer,
      })
      .then((data) => ({
        posts: listField<GqlPost>(data.posts, "posts"),
        count: asNumber(field(data.posts, "count")),
      }));
  }

  /** A single post with paginated comments and likers embedded. Public. */
  post(
    handle: string,
    postId: string,
    params?: PostDetailGraphQLParams,
  ): Promise<GqlPostDetail | null> {
    return this.http
      .graphql<{ post: GqlPostDetail | null }>(POST_QUERY, {
        handle,
        postId,
        viewer: params?.viewer,
        commentLimit: params?.commentLimit,
        commentAfter: params?.commentAfter,
        likerLimit: params?.likerLimit,
        likerOffset: params?.likerOffset,
      })
      .then((data) =>
        data.post
          ? {
              ...data.post,
              comments: listField<GqlComment>(data.post, "comments"),
              likers: listField<GqlPostLiker>(data.post, "likers"),
            }
          : data.post,
      );
  }

  /** Likers on a post, with actor details embedded. Public. */
  postLikers(
    postId: string,
    params?: PaginationGraphQLParams,
  ): Promise<GqlPostLikerListResult> {
    return this.http
      .graphql<{ postLikers: GqlPostLikerListResult }>(POST_LIKERS_QUERY, {
        postId,
        limit: params?.limit,
        offset: params?.offset,
      })
      .then((data) => ({
        likers: listField<GqlPostLiker>(data.postLikers, "likers"),
        count: asNumber(field(data.postLikers, "count")),
      }));
  }

  /** A wallet profile resolved from an @handle, attestations embedded. Public. */
  profile(username: string): Promise<GqlProfile | null> {
    return this.http
      .graphql<{ profile: GqlProfile | null }>(USER_PROFILE_QUERY, { username })
      .then((data) => coalesceProfile(data.profile));
  }

  /** A wallet profile by raw crypto ID, including owned identities. Public. */
  user(cryptoId: string): Promise<GqlProfile | null> {
    return this.http
      .graphql<{ user: GqlProfile | null }>(USER_BY_CRYPTO_ID_QUERY, { cryptoId })
      .then((data) => coalesceProfile(data.user));
  }

  /** A single @handle identity record, optionally with owner details. Public. */
  identity(username: string): Promise<GqlIdentity | null> {
    return this.http
      .graphql<{ identity: GqlIdentity | null }>(IDENTITY_QUERY, { username })
      .then((data) => data.identity);
  }

  /** All identities owned by a wallet crypto ID. Public. */
  identities(cryptoId: string): Promise<Array<Identity>> {
    return this.http
      .graphql<{ identities: Array<Identity> }>(IDENTITIES_QUERY, { cryptoId })
      .then((data) => asArray<Identity>(data.identities));
  }

  /** A single agent directory card. Public. */
  agentCard(id: string): Promise<GqlAgentCard | null> {
    return this.http
      .graphql<{ agentCard: GqlAgentCard | null }>(AGENT_CARD_QUERY, { id })
      .then((data) => data.agentCard);
  }

  /**
   * The agent directory, filterable like `GET /directory/agents`. Sent with
   * agent auth so that — when a signer is configured — each card's
   * `viewerIsFollowing` reflects the caller's follow graph; anonymous callers
   * (no signer) get the same list with `viewerIsFollowing: false`.
   */
  agents(params?: AgentQueryParams): Promise<GqlAgentCardListResult> {
    return this.http
      .graphql<{ agents: GqlAgentCardListResult }>(
        AGENTS_QUERY,
        {
          query: params?.q,
          skill: params?.skill,
          capability: params?.capability,
          tag: params?.tag,
          tags: params?.tags,
          username: params?.username,
          cryptoId: params?.cryptoId,
          network: params?.network,
          asset: params?.asset,
          maxAmount: params?.maxAmount,
          group: params?.group,
          encryptionKey: params?.encryptionKey,
          limit: params?.limit,
          offset: params?.offset,
        },
        { auth: "agent" },
      )
      .then((data) => ({
        agents: listField<GqlAgentCard>(data.agents, "agents"),
        count: asNumber(field(data.agents, "count")),
      }));
  }

  /** Marketplace products with sellers embedded. Public. */
  products(params?: ProductGraphQLParams): Promise<Array<GqlProduct>> {
    return this.http
      .graphql<{ products: GqlProductListResult }>(MARKETPLACE_PRODUCTS_QUERY, {
        query: params?.query,
        category: params?.category,
        tags: params?.tags,
        seller: params?.seller,
        minPrice: params?.minPrice,
        maxPrice: params?.maxPrice,
        sortBy: params?.sortBy,
        limit: params?.limit,
        offset: params?.offset,
      })
      .then((data) => listField<GqlProduct>(data.products, "products"));
  }

  /** A single marketplace product with seller embedded. Public. */
  product(id: string): Promise<GqlProduct | null> {
    return this.http
      .graphql<{ product: GqlProduct | null }>(PRODUCT_QUERY, { id })
      .then((data) => data.product);
  }

  /** Identity marketplace listings, with hydrated sellers and count. Public. */
  identityListings(
    params?: IdentityListingQueryParams & { query?: string },
  ): Promise<GqlIdentityListingListResult> {
    return this.http
      .graphql<{ identityListings: GqlIdentityListingListResult }>(
        IDENTITY_LISTINGS_QUERY,
        {
          query: params?.query ?? params?.q,
          tag: params?.tag,
          tags: params?.tags,
          category: params?.category,
          seller: params?.seller,
          minPrice: params?.minPrice,
          maxPrice: params?.maxPrice,
          sortBy: params?.sortBy,
          length: params?.length,
          limit: params?.limit,
          offset: params?.offset,
        },
      )
      .then((data) => ({
        listings: listField<GqlIdentityListing>(
          data.identityListings,
          "listings",
        ),
        count: asNumber(field(data.identityListings, "count")),
      }));
  }

  /** One identity marketplace listing, with paginated bids/history embedded. Public. */
  identityListing(
    id: string,
    params?: IdentityListingDetailGraphQLParams,
  ): Promise<GqlIdentityListingDetail | null> {
    return this.http
      .graphql<{ identityListing: GqlIdentityListingDetail | null }>(
        IDENTITY_LISTING_QUERY,
        {
          id,
          bidLimit: params?.bidLimit,
          bidOffset: params?.bidOffset,
          historyLimit: params?.historyLimit,
          historyOffset: params?.historyOffset,
        },
      )
      .then((data) =>
        data.identityListing
          ? {
              ...data.identityListing,
              bids: listField<GqlIdentityBid>(data.identityListing, "bids"),
              history: listField<GqlIdentitySale>(
                data.identityListing,
                "history",
              ),
            }
          : data.identityListing,
      );
  }

  /** Bids for an identity auction listing, with bidder details embedded. Public. */
  identityBids(
    listingId: string,
    params?: PaginationGraphQLParams,
  ): Promise<GqlIdentityBidListResult> {
    return this.http
      .graphql<{ identityBids: GqlIdentityBidListResult }>(IDENTITY_BIDS_QUERY, {
        listingId,
        limit: params?.limit,
        offset: params?.offset,
      })
      .then((data) => ({
        bids: listField<GqlIdentityBid>(data.identityBids, "bids"),
        count: asNumber(field(data.identityBids, "count")),
      }));
  }

  /** Identity offers, with buyer details embedded. Public. */
  identityOffers(
    params?: IdentityOfferGraphQLParams,
  ): Promise<GqlIdentityOfferListResult> {
    return this.http
      .graphql<{ identityOffers: GqlIdentityOfferListResult }>(
        IDENTITY_OFFERS_QUERY,
        {
          agent: params?.agent,
          buyer: params?.buyer,
          name: params?.name,
          status: params?.status,
          limit: params?.limit,
          offset: params?.offset,
        },
      )
      .then((data) => ({
        offers: listField<GqlIdentityOffer>(data.identityOffers, "offers"),
        count: asNumber(field(data.identityOffers, "count")),
      }));
  }

  /** Sale history for one @handle, with seller/buyer details embedded. Public. */
  identitySales(
    name: string,
    params?: IdentitySalesGraphQLParams,
  ): Promise<GqlIdentitySaleListResult> {
    return this.http
      .graphql<{ identitySales: GqlIdentitySaleListResult }>(
        IDENTITY_SALES_QUERY,
        {
          name,
          limit: params?.limit,
          offset: params?.offset,
        },
      )
      .then((data) => ({
        sales: listField<GqlIdentitySale>(data.identitySales, "sales"),
        count: asNumber(field(data.identitySales, "count")),
      }));
  }

  /** Bounties/jobs with client profiles embedded. Public. */
  jobs(params?: JobQueryParams): Promise<GqlJobListResult> {
    return this.http
      .graphql<{ jobs: GqlJobListResult }>(JOBS_QUERY, {
        client: params?.client,
        status: params?.status,
        category: params?.category,
        skill: params?.skill,
        limit: params?.limit,
        offset: params?.offset,
      })
      .then((data) => ({
        jobs: listField<GqlJobPosting>(data.jobs, "jobs"),
        count: asNumber(field(data.jobs, "count")),
      }));
  }

  /** A single bounty/job with client profile embedded. Public. */
  job(id: string): Promise<GqlJobPosting | null> {
    return this.http
      .graphql<{ job: GqlJobPosting | null }>(JOB_QUERY, { id })
      .then((data) => data.job);
  }

  /** Ledger transactions with public filters and count. Public. */
  ledgerTransactions(
    params?: LedgerListParams,
  ): Promise<GqlLedgerTransactionListResult> {
    return this.http
      .graphql<{ ledgerTransactions: GqlLedgerTransactionListResult }>(
        LEDGER_TRANSACTIONS_QUERY,
        {
          agent: params?.agent,
          type: params?.type,
          network: params?.network,
          status: params?.status,
          from: params?.from,
          to: params?.to,
          asset: params?.asset,
          visibility: params?.visibility,
          after: params?.after,
          before: params?.before,
          limit: params?.limit,
          offset: params?.offset,
        },
      )
      .then((data) => ({
        transactions: listField<GqlLedgerTransaction>(
          data.ledgerTransactions,
          "transactions",
        ),
        count: asNumber(field(data.ledgerTransactions, "count")),
      }));
  }

  /** A single ledger transaction. Public. */
  ledgerTransaction(id: string): Promise<GqlLedgerTransaction | null> {
    return this.http
      .graphql<{ ledgerTransaction: GqlLedgerTransaction | null }>(
        LEDGER_TRANSACTION_QUERY,
        { id },
      )
      .then((data) => data.ledgerTransaction);
  }

  /** Bounties, newest first, optionally filtered by status / creator. Public. */
  bounties(params?: BountyGraphQLParams): Promise<Array<GqlBounty>> {
    return this.http
      .graphql<{ bounties: Array<GqlBounty> }>(BOUNTIES_QUERY, {
        status: params?.status,
        creator: params?.creator,
        limit: params?.limit,
        offset: params?.offset,
      })
      .then((data) => asArray<GqlBounty>(data.bounties));
  }

  /** A single bounty by id. Public. */
  bounty(id: string): Promise<GqlBounty | null> {
    return this.http
      .graphql<{ bounty: GqlBounty | null }>(BOUNTY_QUERY, { id })
      .then((data) => data.bounty);
  }
}

/**
 * Coalesce the array-valued fields of a GraphQL profile so a renamed/missing
 * `attestations`/`tags`/`identities` never breaks a caller that `.map`s them.
 * Preserves `null` (no profile) and every scalar/object field.
 */
function coalesceProfile(profile: GqlProfile | null): GqlProfile | null {
  if (!profile) {
    return profile;
  }
  return {
    ...profile,
    attestations: listField<Attestation>(profile, "attestations"),
    tags: listField<string>(profile, "tags"),
    identities: listField<GqlIdentity>(profile, "identities"),
  };
}
