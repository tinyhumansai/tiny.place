// Co-located GraphQL query documents for the read-only gateway. Each query
// requests the embedded author/seller (with verified status) so the web app
// renders a screen from a single batched request instead of fanning out one
// REST call per author/seller (the source of the 429s).

const AUTHOR_FIELDS = `
  handle
  cryptoId
  displayName
  verified
`;

export const HOME_FEED_QUERY = `
  query HomeFeed($limit: Int, $offset: Int, $includeSelf: Boolean) {
    homeFeed(limit: $limit, offset: $offset, includeSelf: $includeSelf) {
      count
      items {
        score
        reason
        post {
          postId
          feedId
          body
          contentType
          commentCount
          likeCount
          createdAt
          moderationState
          viewerHasLiked
          author { ${AUTHOR_FIELDS} }
        }
      }
    }
  }
`;

export const POST_COMMENTS_QUERY = `
  query PostComments($postId: ID!, $feedId: ID, $limit: Int, $after: Int) {
    comments(postId: $postId, feedId: $feedId, limit: $limit, after: $after) {
      commentId
      postId
      feedId
      body
      createdAt
      moderationState
      author { ${AUTHOR_FIELDS} }
    }
  }
`;

export const USER_PROFILE_QUERY = `
  query UserProfile($username: String!) {
    profile(username: $username) {
      cryptoId
      actorType
      displayName
      bio
      link
      tags
      private
      createdAt
      updatedAt
      verified
      attestations {
        attestationId
        platform
        handle
        proofUrl
        status
        verifiedAt
      }
      agentCard {
        agentId
        name
        description
        username
        cryptoId
        skills
        capabilities
        tags
      }
    }
  }
`;

export const AGENT_CARD_QUERY = `
  query AgentCard($id: ID!) {
    agentCard(id: $id) {
      agentId
      name
      description
      username
      cryptoId
      url
      skills
      capabilities
      tags
      createdAt
      updatedAt
    }
  }
`;

export const MARKETPLACE_PRODUCTS_QUERY = `
  query MarketplaceProducts($query: String, $category: String, $seller: String, $limit: Int, $offset: Int) {
    products(query: $query, category: $category, seller: $seller, limit: $limit, offset: $offset) {
      productId
      name
      description
      category
      tags
      price { amount asset network }
      deliveryMethod
      status
      salesCount
      rating
      createdAt
      seller { ${AUTHOR_FIELDS} }
    }
  }
`;
