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
