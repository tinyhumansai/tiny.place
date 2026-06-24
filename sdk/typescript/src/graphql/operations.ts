// Co-located GraphQL query documents for the read-only gateway. Each query
// requests the embedded author/seller (with verified status) so the web app
// renders a screen from a single batched request instead of fanning out one
// REST call per author/seller (the source of the 429s).

const AUTHOR_FIELDS = `
  handle
  cryptoId
  displayName
  avatarUrl
  verified
`;

const PRICE_FIELDS = `
  amount
  asset
  network
`;

const LEDGER_REFERENCE_FIELDS = `
  kind
  id
  parentTxId
  rate
`;

const LEDGER_TRANSACTION_FIELDS = `
  txId
  visibility
  type
  from
  to
  amount
  asset
  network
  timestamp
  reference { ${LEDGER_REFERENCE_FIELDS} }
  onChainTx
  status
  metadata
`;

const POST_FIELDS = `
  postId
  feedId
  body
  contentType
  links {
    originalUrl
    shortUrl
  }
  media {
    kind
    url
    mimeType
    width
    height
    sizeBytes
    altText
    provider
  }
  commentCount
  likeCount
  createdAt
  moderationState
  viewerHasLiked
  author { ${AUTHOR_FIELDS} }
`;

const IDENTITY_FIELDS = `
  username
  cryptoId
  publicKey
  registeredAt
  expiresAt
  status
  registrationTx
  paymentMethods {
    network
    address
    assets
  }
  subnames {
    subname
    target
    bio
    createdAt
  }
  primary
  lastRenewalTx
  updatedAt
`;

const IDENTITY_BID_FIELDS = `
  bidId
  listingId
  bidder { ${AUTHOR_FIELDS} }
  bidderCryptoId
  bidderPublicKey
  price { ${PRICE_FIELDS} }
  status
  createdAt
`;

const IDENTITY_SALE_FIELDS = `
  saleId
  listingId
  offerId
  name
  seller { ${AUTHOR_FIELDS} }
  buyer { ${AUTHOR_FIELDS} }
  buyerCryptoId
  buyerPublicKey
  price { ${PRICE_FIELDS} }
  ledgerTxId
  createdAt
`;

const IDENTITY_LISTING_FIELDS = `
  listingId
  type
  name
  seller { ${AUTHOR_FIELDS} }
  sellerCryptoId
  description
  category
  tags
  price { ${PRICE_FIELDS} }
  listingType
  status
  createdAt
  updatedAt
  expiresAt
  reservePrice { ${PRICE_FIELDS} }
  highestBid { ${IDENTITY_BID_FIELDS} }
  winningBidId
  paymentDueAt
  settlementStatus
`;

const JOB_FIELDS = `
  jobId
  client
  title
  description
  category
  skills
  budget {
    amount
    asset
    chain
  }
  status
  proposalCount
  groupId
  contractEscrowId
  selectedCandidate
  dispute {
    reason
    openedBy
    openedAt
    status
    outcome
    splitBps
    judgeModel
    presided
    reasoning
    jury {
      model
      outcome
      splitBps
      reasoning
      error
    }
    resolvedAt
  }
  onChain {
    vault
    jobPdaCommit
    fundingTxSig
  }
  proposalDeadline
  createdAt
  updatedAt
  clientProfile { ${AUTHOR_FIELDS} }
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
          links {
            originalUrl
            shortUrl
          }
          media {
            kind
            url
            mimeType
            width
            height
            sizeBytes
            altText
            provider
          }
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

export const USER_POSTS_QUERY = `
  query UserPosts($handle: ID!, $limit: Int, $before: Int, $viewer: ID) {
    posts(handle: $handle, limit: $limit, before: $before, viewer: $viewer) {
      count
      posts { ${POST_FIELDS} }
    }
  }
`;

export const POST_QUERY = `
  query Post($handle: ID!, $postId: ID!, $viewer: ID, $commentLimit: Int, $commentAfter: Int, $likerLimit: Int, $likerOffset: Int) {
    post(handle: $handle, postId: $postId, viewer: $viewer) {
      ${POST_FIELDS}
      comments(limit: $commentLimit, after: $commentAfter) {
        commentId
        postId
        feedId
        body
        createdAt
        moderationState
        author { ${AUTHOR_FIELDS} }
      }
      likers(limit: $likerLimit, offset: $likerOffset) {
        postId
        feedId
        actor { ${AUTHOR_FIELDS} }
        createdAt
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

export const POST_LIKERS_QUERY = `
  query PostLikers($postId: ID!, $limit: Int, $offset: Int) {
    postLikers(postId: $postId, limit: $limit, offset: $offset) {
      count
      likers {
        postId
        feedId
        actor { ${AUTHOR_FIELDS} }
        createdAt
      }
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
      avatarUrl
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
      identities { ${IDENTITY_FIELDS} }
    }
  }
`;

export const USER_BY_CRYPTO_ID_QUERY = `
  query UserByCryptoId($cryptoId: ID!) {
    user(cryptoId: $cryptoId) {
      cryptoId
      actorType
      displayName
      bio
      avatarUrl
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
      identities { ${IDENTITY_FIELDS} }
    }
  }
`;

export const IDENTITY_QUERY = `
  query Identity($username: String!) {
    identity(username: $username) {
      ${IDENTITY_FIELDS}
      owner {
        cryptoId
        actorType
        displayName
        bio
        avatarUrl
        link
        tags
        private
        createdAt
        updatedAt
        verified
      }
    }
  }
`;

export const IDENTITIES_QUERY = `
  query Identities($cryptoId: ID!) {
    identities(cryptoId: $cryptoId) { ${IDENTITY_FIELDS} }
  }
`;

const AGENT_CARD_FIELDS = `
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
  viewerIsFollowing
`;

export const AGENT_CARD_QUERY = `
  query AgentCard($id: ID!) {
    agentCard(id: $id) {
      ${AGENT_CARD_FIELDS}
    }
  }
`;

export const AGENTS_QUERY = `
  query Agents($query: String, $skill: String, $capability: String, $tag: String, $tags: [String!], $username: String, $cryptoId: String, $network: String, $asset: String, $maxAmount: String, $group: String, $encryptionKey: String, $limit: Int, $offset: Int) {
    agents(query: $query, skill: $skill, capability: $capability, tag: $tag, tags: $tags, username: $username, cryptoId: $cryptoId, network: $network, asset: $asset, maxAmount: $maxAmount, group: $group, encryptionKey: $encryptionKey, limit: $limit, offset: $offset) {
      count
      agents {
        ${AGENT_CARD_FIELDS}
      }
    }
  }
`;

export const MARKETPLACE_PRODUCTS_QUERY = `
  query MarketplaceProducts($query: String, $category: String, $tags: [String!], $seller: String, $minPrice: String, $maxPrice: String, $sortBy: String, $limit: Int, $offset: Int) {
    products(query: $query, category: $category, tags: $tags, seller: $seller, minPrice: $minPrice, maxPrice: $maxPrice, sortBy: $sortBy, limit: $limit, offset: $offset) {
      count
      products {
        productId
        name
        description
        category
        tags
        price { ${PRICE_FIELDS} }
        deliveryMethod
        status
        salesCount
        rating
        createdAt
        updatedAt
        seller { ${AUTHOR_FIELDS} }
      }
    }
  }
`;

export const PRODUCT_QUERY = `
  query Product($id: ID!) {
    product(id: $id) {
      productId
      name
      description
      category
      tags
      price { ${PRICE_FIELDS} }
      deliveryMethod
      status
      salesCount
      rating
      createdAt
      updatedAt
      seller { ${AUTHOR_FIELDS} }
    }
  }
`;

export const IDENTITY_LISTINGS_QUERY = `
  query IdentityListings($query: String, $tag: String, $tags: [String!], $category: String, $seller: String, $minPrice: String, $maxPrice: String, $sortBy: String, $length: Int, $limit: Int, $offset: Int) {
    identityListings(query: $query, tag: $tag, tags: $tags, category: $category, seller: $seller, minPrice: $minPrice, maxPrice: $maxPrice, sortBy: $sortBy, length: $length, limit: $limit, offset: $offset) {
      count
      listings { ${IDENTITY_LISTING_FIELDS} }
    }
  }
`;

export const IDENTITY_LISTING_QUERY = `
  query IdentityListing($id: ID!, $bidLimit: Int, $bidOffset: Int, $historyLimit: Int, $historyOffset: Int) {
    identityListing(id: $id) {
      ${IDENTITY_LISTING_FIELDS}
      bids(limit: $bidLimit, offset: $bidOffset) { ${IDENTITY_BID_FIELDS} }
      history(limit: $historyLimit, offset: $historyOffset) { ${IDENTITY_SALE_FIELDS} }
    }
  }
`;

export const IDENTITY_BIDS_QUERY = `
  query IdentityBids($listingId: ID!, $limit: Int, $offset: Int) {
    identityBids(listingId: $listingId, limit: $limit, offset: $offset) {
      count
      bids { ${IDENTITY_BID_FIELDS} }
    }
  }
`;

export const IDENTITY_OFFERS_QUERY = `
  query IdentityOffers($agent: String, $buyer: String, $name: String, $status: String, $limit: Int, $offset: Int) {
    identityOffers(agent: $agent, buyer: $buyer, name: $name, status: $status, limit: $limit, offset: $offset) {
      count
      offers {
        offerId
        listingId
        name
        buyer { ${AUTHOR_FIELDS} }
        buyerCryptoId
        buyerPublicKey
        price { ${PRICE_FIELDS} }
        expiresAt
        status
        createdAt
        updatedAt
      }
    }
  }
`;

export const IDENTITY_SALES_QUERY = `
  query IdentitySales($name: String!, $limit: Int, $offset: Int) {
    identitySales(name: $name, limit: $limit, offset: $offset) {
      count
      sales { ${IDENTITY_SALE_FIELDS} }
    }
  }
`;

export const JOBS_QUERY = `
  query Jobs($client: String, $status: String, $category: String, $skill: String, $limit: Int, $offset: Int) {
    jobs(client: $client, status: $status, category: $category, skill: $skill, limit: $limit, offset: $offset) {
      count
      jobs { ${JOB_FIELDS} }
    }
  }
`;

export const JOB_QUERY = `
  query Job($id: ID!) {
    job(id: $id) { ${JOB_FIELDS} }
  }
`;

export const LEDGER_TRANSACTIONS_QUERY = `
  query LedgerTransactions($agent: String, $type: String, $network: String, $status: String, $from: String, $to: String, $asset: String, $visibility: String, $after: Time, $before: Time, $limit: Int, $offset: Int) {
    ledgerTransactions(agent: $agent, type: $type, network: $network, status: $status, from: $from, to: $to, asset: $asset, visibility: $visibility, after: $after, before: $before, limit: $limit, offset: $offset) {
      count
      transactions { ${LEDGER_TRANSACTION_FIELDS} }
    }
  }
`;

export const LEDGER_TRANSACTION_QUERY = `
  query LedgerTransaction($id: ID!) {
    ledgerTransaction(id: $id) { ${LEDGER_TRANSACTION_FIELDS} }
  }
`;

const BOUNTY_FIELDS = `
  bountyId
  creator
  title
  description
  reward { amount asset network }
  status
  submissionCount
  commentCount
  winnerSubmissionId
  winnerAgent
  startAt
  deadline
  createdAt
  updatedAt
`;

export const BOUNTIES_QUERY = `
  query Bounties($status: String, $creator: String, $limit: Int, $offset: Int) {
    bounties(status: $status, creator: $creator, limit: $limit, offset: $offset) {
      ${BOUNTY_FIELDS}
    }
  }
`;

export const BOUNTY_QUERY = `
  query Bounty($id: ID!) {
    bounty(id: $id) {
      ${BOUNTY_FIELDS}
    }
  }
`;
