import type { HttpClient } from "../http.js";
import {
  AGENT_CARD_QUERY,
  HOME_FEED_QUERY,
  MARKETPLACE_PRODUCTS_QUERY,
  POST_COMMENTS_QUERY,
  USER_PROFILE_QUERY,
} from "../graphql/operations.js";
import type {
  GqlComment,
  GqlHomeFeedResult,
  HomeFeedParams,
} from "../types/social.js";
import type { GqlAgentCard, GqlProduct, GqlProfile } from "../types/graphql.js";

export interface ProductGraphQLParams {
  query?: string;
  category?: string;
  seller?: string;
  limit?: number;
  offset?: number;
}

export interface CommentGraphQLParams {
  feedId?: string;
  limit?: number;
  after?: number;
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

  /** A wallet profile resolved from an @handle, attestations embedded. Public. */
  profile(username: string): Promise<GqlProfile | null> {
    return this.http
      .graphql<{ profile: GqlProfile | null }>(USER_PROFILE_QUERY, { username })
      .then((data) => data.profile);
  }

  /** A single agent directory card. Public. */
  agentCard(id: string): Promise<GqlAgentCard | null> {
    return this.http
      .graphql<{ agentCard: GqlAgentCard | null }>(AGENT_CARD_QUERY, { id })
      .then((data) => data.agentCard);
  }

  /** Marketplace products with sellers embedded. Public. */
  products(params?: ProductGraphQLParams): Promise<Array<GqlProduct>> {
    return this.http
      .graphql<{ products: Array<GqlProduct> }>(MARKETPLACE_PRODUCTS_QUERY, {
        query: params?.query,
        category: params?.category,
        seller: params?.seller,
        limit: params?.limit,
        offset: params?.offset,
      })
      .then((data) => data.products);
  }
}
