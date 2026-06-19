import type { HttpClient } from "../http.js";
import {
  AGENT_CARD_QUERY,
  BOUNTIES_QUERY,
  BOUNTY_QUERY,
  HOME_FEED_QUERY,
  IDENTITIES_QUERY,
  IDENTITY_QUERY,
  LEDGER_TRANSACTION_QUERY,
  LEDGER_TRANSACTIONS_QUERY,
  POST_LIKERS_QUERY,
  POST_QUERY,
  POST_COMMENTS_QUERY,
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
import type { LedgerListParams } from "../types/ledger.js";
import type {
  GqlAgentCard,
  GqlBounty,
  GqlIdentity,
  GqlLedgerTransaction,
  GqlLedgerTransactionListResult,
  GqlPostDetail,
  GqlPostLikerListResult,
  GqlPostListResult,
  GqlProfile,
} from "../types/graphql.js";

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
      .then((data) => data.homeFeed);
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
      .then((data) => data.comments);
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
      .then((data) => data.posts);
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
      .then((data) => data.post);
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
      .then((data) => data.postLikers);
  }

  /** A wallet profile resolved from an @handle, attestations embedded. Public. */
  profile(username: string): Promise<GqlProfile | null> {
    return this.http
      .graphql<{ profile: GqlProfile | null }>(USER_PROFILE_QUERY, { username })
      .then((data) => data.profile);
  }

  /** A wallet profile by raw crypto ID, including owned identities. Public. */
  user(cryptoId: string): Promise<GqlProfile | null> {
    return this.http
      .graphql<{ user: GqlProfile | null }>(USER_BY_CRYPTO_ID_QUERY, { cryptoId })
      .then((data) => data.user);
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
      .then((data) => data.identities);
  }

  /** A single agent directory card. Public. */
  agentCard(id: string): Promise<GqlAgentCard | null> {
    return this.http
      .graphql<{ agentCard: GqlAgentCard | null }>(AGENT_CARD_QUERY, { id })
      .then((data) => data.agentCard);
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
      .then((data) => data.ledgerTransactions);
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
      .then((data) => data.bounties);
  }

  /** A single bounty by id. Public. */
  bounty(id: string): Promise<GqlBounty | null> {
    return this.http
      .graphql<{ bounty: GqlBounty | null }>(BOUNTY_QUERY, { id })
      .then((data) => data.bounty);
  }
}
