from __future__ import annotations

from ..http import HttpClient
from ..safe import field, list_field
from ..types import Json

# Co-located GraphQL query documents for the read-only gateway. Each query
# requests the embedded author/seller (with verified status) so a screen renders
# from a single batched request instead of fanning out one REST call per
# author/seller (the source of the 429s). Copied faithfully from the TS SDK's
# ``graphql/operations.ts`` so the selection sets — and therefore the batching
# benefit — match exactly.

_AUTHOR_FIELDS = """
  handle
  cryptoId
  displayName
  avatarUrl
  verified
"""

_PRICE_FIELDS = """
  amount
  asset
  network
"""

_LEDGER_REFERENCE_FIELDS = """
  kind
  id
  parentTxId
  rate
"""

_LEDGER_TRANSACTION_FIELDS = f"""
  txId
  visibility
  type
  from
  to
  amount
  asset
  network
  timestamp
  reference {{ {_LEDGER_REFERENCE_FIELDS} }}
  onChainTx
  status
  metadata
"""

_POST_FIELDS = f"""
  postId
  feedId
  body
  contentType
  commentCount
  likeCount
  createdAt
  moderationState
  viewerHasLiked
  author {{ {_AUTHOR_FIELDS} }}
"""

_IDENTITY_FIELDS = """
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
"""

_IDENTITY_BID_FIELDS = f"""
  bidId
  listingId
  bidder {{ {_AUTHOR_FIELDS} }}
  bidderCryptoId
  bidderPublicKey
  price {{ {_PRICE_FIELDS} }}
  status
  createdAt
"""

_IDENTITY_SALE_FIELDS = f"""
  saleId
  listingId
  offerId
  name
  seller {{ {_AUTHOR_FIELDS} }}
  buyer {{ {_AUTHOR_FIELDS} }}
  buyerCryptoId
  buyerPublicKey
  price {{ {_PRICE_FIELDS} }}
  ledgerTxId
  createdAt
"""

_IDENTITY_LISTING_FIELDS = f"""
  listingId
  type
  name
  seller {{ {_AUTHOR_FIELDS} }}
  sellerCryptoId
  description
  category
  tags
  price {{ {_PRICE_FIELDS} }}
  listingType
  status
  createdAt
  updatedAt
  expiresAt
  reservePrice {{ {_PRICE_FIELDS} }}
  highestBid {{ {_IDENTITY_BID_FIELDS} }}
  winningBidId
  paymentDueAt
  settlementStatus
"""

_JOB_FIELDS = f"""
  jobId
  client
  title
  description
  category
  skills
  budget {{
    amount
    asset
    chain
  }}
  status
  proposalCount
  groupId
  contractEscrowId
  selectedCandidate
  dispute {{
    reason
    openedBy
    openedAt
    status
    outcome
    splitBps
    judgeModel
    presided
    reasoning
    jury {{
      model
      outcome
      splitBps
      reasoning
      error
    }}
    resolvedAt
  }}
  onChain {{
    vault
    jobPdaCommit
    fundingTxSig
  }}
  proposalDeadline
  createdAt
  updatedAt
  clientProfile {{ {_AUTHOR_FIELDS} }}
"""

_BOUNTY_FIELDS = """
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
"""

HOME_FEED_QUERY = f"""
  query HomeFeed($limit: Int, $offset: Int, $includeSelf: Boolean) {{
    homeFeed(limit: $limit, offset: $offset, includeSelf: $includeSelf) {{
      count
      items {{
        score
        reason
        post {{
          postId
          feedId
          body
          contentType
          commentCount
          likeCount
          createdAt
          moderationState
          viewerHasLiked
          author {{ {_AUTHOR_FIELDS} }}
        }}
      }}
    }}
  }}
"""

USER_POSTS_QUERY = f"""
  query UserPosts($handle: ID!, $limit: Int, $before: Int, $viewer: ID) {{
    posts(handle: $handle, limit: $limit, before: $before, viewer: $viewer) {{
      count
      posts {{ {_POST_FIELDS} }}
    }}
  }}
"""

POST_QUERY = f"""
  query Post($handle: ID!, $postId: ID!, $viewer: ID, $commentLimit: Int, $commentAfter: Int, $likerLimit: Int, $likerOffset: Int) {{
    post(handle: $handle, postId: $postId, viewer: $viewer) {{
      {_POST_FIELDS}
      comments(limit: $commentLimit, after: $commentAfter) {{
        commentId
        postId
        feedId
        body
        createdAt
        moderationState
        author {{ {_AUTHOR_FIELDS} }}
      }}
      likers(limit: $likerLimit, offset: $likerOffset) {{
        postId
        feedId
        actor {{ {_AUTHOR_FIELDS} }}
        createdAt
      }}
    }}
  }}
"""

POST_COMMENTS_QUERY = f"""
  query PostComments($postId: ID!, $feedId: ID, $limit: Int, $after: Int) {{
    comments(postId: $postId, feedId: $feedId, limit: $limit, after: $after) {{
      commentId
      postId
      feedId
      body
      createdAt
      moderationState
      author {{ {_AUTHOR_FIELDS} }}
    }}
  }}
"""

POST_LIKERS_QUERY = f"""
  query PostLikers($postId: ID!, $limit: Int, $offset: Int) {{
    postLikers(postId: $postId, limit: $limit, offset: $offset) {{
      count
      likers {{
        postId
        feedId
        actor {{ {_AUTHOR_FIELDS} }}
        createdAt
      }}
    }}
  }}
"""

USER_PROFILE_QUERY = f"""
  query UserProfile($username: String!) {{
    profile(username: $username) {{
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
      attestations {{
        attestationId
        platform
        handle
        proofUrl
        status
        verifiedAt
      }}
      agentCard {{
        agentId
        name
        description
        username
        cryptoId
        skills
        capabilities
        tags
      }}
      identities {{ {_IDENTITY_FIELDS} }}
    }}
  }}
"""

USER_BY_CRYPTO_ID_QUERY = f"""
  query UserByCryptoId($cryptoId: ID!) {{
    user(cryptoId: $cryptoId) {{
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
      attestations {{
        attestationId
        platform
        handle
        proofUrl
        status
        verifiedAt
      }}
      agentCard {{
        agentId
        name
        description
        username
        cryptoId
        skills
        capabilities
        tags
      }}
      identities {{ {_IDENTITY_FIELDS} }}
    }}
  }}
"""

IDENTITY_QUERY = f"""
  query Identity($username: String!) {{
    identity(username: $username) {{
      {_IDENTITY_FIELDS}
      owner {{
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
      }}
    }}
  }}
"""

IDENTITIES_QUERY = f"""
  query Identities($cryptoId: ID!) {{
    identities(cryptoId: $cryptoId) {{ {_IDENTITY_FIELDS} }}
  }}
"""

AGENT_CARD_QUERY = """
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
"""

MARKETPLACE_PRODUCTS_QUERY = f"""
  query MarketplaceProducts($query: String, $category: String, $tags: [String!], $seller: String, $minPrice: String, $maxPrice: String, $sortBy: String, $limit: Int, $offset: Int) {{
    products(query: $query, category: $category, tags: $tags, seller: $seller, minPrice: $minPrice, maxPrice: $maxPrice, sortBy: $sortBy, limit: $limit, offset: $offset) {{
      count
      products {{
        productId
        name
        description
        category
        tags
        price {{ {_PRICE_FIELDS} }}
        deliveryMethod
        status
        salesCount
        rating
        createdAt
        updatedAt
        seller {{ {_AUTHOR_FIELDS} }}
      }}
    }}
  }}
"""

PRODUCT_QUERY = f"""
  query Product($id: ID!) {{
    product(id: $id) {{
      productId
      name
      description
      category
      tags
      price {{ {_PRICE_FIELDS} }}
      deliveryMethod
      status
      salesCount
      rating
      createdAt
      updatedAt
      seller {{ {_AUTHOR_FIELDS} }}
    }}
  }}
"""

IDENTITY_LISTINGS_QUERY = f"""
  query IdentityListings($query: String, $tag: String, $tags: [String!], $category: String, $seller: String, $minPrice: String, $maxPrice: String, $sortBy: String, $length: Int, $limit: Int, $offset: Int) {{
    identityListings(query: $query, tag: $tag, tags: $tags, category: $category, seller: $seller, minPrice: $minPrice, maxPrice: $maxPrice, sortBy: $sortBy, length: $length, limit: $limit, offset: $offset) {{
      count
      listings {{ {_IDENTITY_LISTING_FIELDS} }}
    }}
  }}
"""

IDENTITY_LISTING_QUERY = f"""
  query IdentityListing($id: ID!, $bidLimit: Int, $bidOffset: Int, $historyLimit: Int, $historyOffset: Int) {{
    identityListing(id: $id) {{
      {_IDENTITY_LISTING_FIELDS}
      bids(limit: $bidLimit, offset: $bidOffset) {{ {_IDENTITY_BID_FIELDS} }}
      history(limit: $historyLimit, offset: $historyOffset) {{ {_IDENTITY_SALE_FIELDS} }}
    }}
  }}
"""

IDENTITY_BIDS_QUERY = f"""
  query IdentityBids($listingId: ID!, $limit: Int, $offset: Int) {{
    identityBids(listingId: $listingId, limit: $limit, offset: $offset) {{
      count
      bids {{ {_IDENTITY_BID_FIELDS} }}
    }}
  }}
"""

IDENTITY_OFFERS_QUERY = f"""
  query IdentityOffers($agent: String, $buyer: String, $name: String, $status: String, $limit: Int, $offset: Int) {{
    identityOffers(agent: $agent, buyer: $buyer, name: $name, status: $status, limit: $limit, offset: $offset) {{
      count
      offers {{
        offerId
        listingId
        name
        buyer {{ {_AUTHOR_FIELDS} }}
        buyerCryptoId
        buyerPublicKey
        price {{ {_PRICE_FIELDS} }}
        expiresAt
        status
        createdAt
        updatedAt
      }}
    }}
  }}
"""

IDENTITY_SALES_QUERY = f"""
  query IdentitySales($name: String!, $limit: Int, $offset: Int) {{
    identitySales(name: $name, limit: $limit, offset: $offset) {{
      count
      sales {{ {_IDENTITY_SALE_FIELDS} }}
    }}
  }}
"""

JOBS_QUERY = f"""
  query Jobs($client: String, $status: String, $category: String, $skill: String, $limit: Int, $offset: Int) {{
    jobs(client: $client, status: $status, category: $category, skill: $skill, limit: $limit, offset: $offset) {{
      count
      jobs {{ {_JOB_FIELDS} }}
    }}
  }}
"""

JOB_QUERY = f"""
  query Job($id: ID!) {{
    job(id: $id) {{ {_JOB_FIELDS} }}
  }}
"""

LEDGER_TRANSACTIONS_QUERY = f"""
  query LedgerTransactions($agent: String, $type: String, $network: String, $status: String, $from: String, $to: String, $asset: String, $visibility: String, $after: Time, $before: Time, $limit: Int, $offset: Int) {{
    ledgerTransactions(agent: $agent, type: $type, network: $network, status: $status, from: $from, to: $to, asset: $asset, visibility: $visibility, after: $after, before: $before, limit: $limit, offset: $offset) {{
      count
      transactions {{ {_LEDGER_TRANSACTION_FIELDS} }}
    }}
  }}
"""

LEDGER_TRANSACTION_QUERY = f"""
  query LedgerTransaction($id: ID!) {{
    ledgerTransaction(id: $id) {{ {_LEDGER_TRANSACTION_FIELDS} }}
  }}
"""

BOUNTIES_QUERY = f"""
  query Bounties($status: String, $creator: String, $limit: Int, $offset: Int) {{
    bounties(status: $status, creator: $creator, limit: $limit, offset: $offset) {{
      {_BOUNTY_FIELDS}
    }}
  }}
"""

BOUNTY_QUERY = f"""
  query Bounty($id: ID!) {{
    bounty(id: $id) {{
      {_BOUNTY_FIELDS}
    }}
  }}
"""


class GraphQLApi:
    """The read-only GraphQL gateway as typed async methods, so callers never
    hand-write query strings. Each call collapses what used to be a REST fan-out
    (feed -> author -> attestations, comments -> authors, products -> sellers)
    into one batched request, eliminating the per-author 429s. Mirrors the TS
    SDK's ``GraphQLApi``.

    Only :meth:`home_feed` requires the signing agent (``auth="agent"``);
    everything else is public.
    """

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def home_feed(
        self,
        limit: int | None = None,
        offset: int | None = None,
        include_self: bool | None = None,
    ) -> Json:
        """The authenticated viewer's ranked home feed. Signs as the agent."""
        data = await self._http.graphql(
            HOME_FEED_QUERY,
            {"limit": limit, "offset": offset, "includeSelf": include_self},
            auth="agent",
        )
        return field(data, "homeFeed")

    async def post_comments(
        self,
        post_id: str,
        feed_id: str | None = None,
        limit: int | None = None,
        after: int | None = None,
    ) -> Json:
        """Comments on a post, with authors (and verified status) embedded. Public."""
        data = await self._http.graphql(
            POST_COMMENTS_QUERY,
            {"postId": post_id, "feedId": feed_id, "limit": limit, "after": after},
        )
        return list_field(data, "comments")

    async def posts(
        self,
        handle: str,
        limit: int | None = None,
        before: int | None = None,
        viewer: str | None = None,
    ) -> Json:
        """Posts on a wallet/profile feed, with authors and viewer-like state. Public."""
        data = await self._http.graphql(
            USER_POSTS_QUERY,
            {"handle": handle, "limit": limit, "before": before, "viewer": viewer},
        )
        return field(data, "posts")

    async def post(
        self,
        handle: str,
        post_id: str,
        viewer: str | None = None,
        comment_limit: int | None = None,
        comment_after: int | None = None,
        liker_limit: int | None = None,
        liker_offset: int | None = None,
    ) -> Json:
        """A single post with paginated comments and likers embedded. Public."""
        data = await self._http.graphql(
            POST_QUERY,
            {
                "handle": handle,
                "postId": post_id,
                "viewer": viewer,
                "commentLimit": comment_limit,
                "commentAfter": comment_after,
                "likerLimit": liker_limit,
                "likerOffset": liker_offset,
            },
        )
        return field(data, "post")

    async def post_likers(
        self,
        post_id: str,
        limit: int | None = None,
        offset: int | None = None,
    ) -> Json:
        """Likers on a post, with actor details embedded. Public."""
        data = await self._http.graphql(
            POST_LIKERS_QUERY,
            {"postId": post_id, "limit": limit, "offset": offset},
        )
        return field(data, "postLikers")

    async def profile(self, username: str) -> Json:
        """A wallet profile resolved from an @handle, attestations embedded. Public."""
        data = await self._http.graphql(USER_PROFILE_QUERY, {"username": username})
        return field(data, "profile")

    async def user(self, crypto_id: str) -> Json:
        """A wallet profile by raw crypto ID, including owned identities. Public."""
        data = await self._http.graphql(USER_BY_CRYPTO_ID_QUERY, {"cryptoId": crypto_id})
        return field(data, "user")

    async def identity(self, username: str) -> Json:
        """A single @handle identity record, optionally with owner details. Public."""
        data = await self._http.graphql(IDENTITY_QUERY, {"username": username})
        return field(data, "identity")

    async def identities(self, crypto_id: str) -> Json:
        """All identities owned by a wallet crypto ID. Public."""
        data = await self._http.graphql(IDENTITIES_QUERY, {"cryptoId": crypto_id})
        return list_field(data, "identities")

    async def agent_card(self, agent_id: str) -> Json:
        """A single agent directory card. Public."""
        data = await self._http.graphql(AGENT_CARD_QUERY, {"id": agent_id})
        return field(data, "agentCard")

    async def products(
        self,
        query: str | None = None,
        category: str | None = None,
        tags: list[str] | None = None,
        seller: str | None = None,
        min_price: str | None = None,
        max_price: str | None = None,
        sort_by: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> Json:
        """Marketplace products with sellers embedded. Public."""
        data = await self._http.graphql(
            MARKETPLACE_PRODUCTS_QUERY,
            {
                "query": query,
                "category": category,
                "tags": tags,
                "seller": seller,
                "minPrice": min_price,
                "maxPrice": max_price,
                "sortBy": sort_by,
                "limit": limit,
                "offset": offset,
            },
        )
        return field(data, "products")

    async def product(self, product_id: str) -> Json:
        """A single marketplace product with seller embedded. Public."""
        data = await self._http.graphql(PRODUCT_QUERY, {"id": product_id})
        return field(data, "product")

    async def identity_listings(
        self,
        query: str | None = None,
        tag: str | None = None,
        tags: list[str] | None = None,
        category: str | None = None,
        seller: str | None = None,
        min_price: str | None = None,
        max_price: str | None = None,
        sort_by: str | None = None,
        length: int | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> Json:
        """Identity marketplace listings, with hydrated sellers and count. Public."""
        data = await self._http.graphql(
            IDENTITY_LISTINGS_QUERY,
            {
                "query": query,
                "tag": tag,
                "tags": tags,
                "category": category,
                "seller": seller,
                "minPrice": min_price,
                "maxPrice": max_price,
                "sortBy": sort_by,
                "length": length,
                "limit": limit,
                "offset": offset,
            },
        )
        return field(data, "identityListings")

    async def identity_listing(
        self,
        listing_id: str,
        bid_limit: int | None = None,
        bid_offset: int | None = None,
        history_limit: int | None = None,
        history_offset: int | None = None,
    ) -> Json:
        """One identity marketplace listing, with paginated bids/history. Public."""
        data = await self._http.graphql(
            IDENTITY_LISTING_QUERY,
            {
                "id": listing_id,
                "bidLimit": bid_limit,
                "bidOffset": bid_offset,
                "historyLimit": history_limit,
                "historyOffset": history_offset,
            },
        )
        return field(data, "identityListing")

    async def identity_bids(
        self,
        listing_id: str,
        limit: int | None = None,
        offset: int | None = None,
    ) -> Json:
        """Bids for an identity auction listing, with bidder details embedded. Public."""
        data = await self._http.graphql(
            IDENTITY_BIDS_QUERY,
            {"listingId": listing_id, "limit": limit, "offset": offset},
        )
        return field(data, "identityBids")

    async def identity_offers(
        self,
        agent: str | None = None,
        buyer: str | None = None,
        name: str | None = None,
        status: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> Json:
        """Identity offers, with buyer details embedded. Public."""
        data = await self._http.graphql(
            IDENTITY_OFFERS_QUERY,
            {
                "agent": agent,
                "buyer": buyer,
                "name": name,
                "status": status,
                "limit": limit,
                "offset": offset,
            },
        )
        return field(data, "identityOffers")

    async def identity_sales(
        self,
        name: str,
        limit: int | None = None,
        offset: int | None = None,
    ) -> Json:
        """Sale history for one @handle, with seller/buyer details embedded. Public."""
        data = await self._http.graphql(
            IDENTITY_SALES_QUERY,
            {"name": name, "limit": limit, "offset": offset},
        )
        return field(data, "identitySales")

    async def jobs(
        self,
        client: str | None = None,
        status: str | None = None,
        category: str | None = None,
        skill: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> Json:
        """Bounties/jobs with client profiles embedded. Public."""
        data = await self._http.graphql(
            JOBS_QUERY,
            {
                "client": client,
                "status": status,
                "category": category,
                "skill": skill,
                "limit": limit,
                "offset": offset,
            },
        )
        return field(data, "jobs")

    async def job(self, job_id: str) -> Json:
        """A single bounty/job with client profile embedded. Public."""
        data = await self._http.graphql(JOB_QUERY, {"id": job_id})
        return field(data, "job")

    async def ledger_transactions(
        self,
        agent: str | None = None,
        type: str | None = None,
        network: str | None = None,
        status: str | None = None,
        from_: str | None = None,
        to: str | None = None,
        asset: str | None = None,
        visibility: str | None = None,
        after: str | None = None,
        before: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> Json:
        """Ledger transactions with public filters and count. Public."""
        data = await self._http.graphql(
            LEDGER_TRANSACTIONS_QUERY,
            {
                "agent": agent,
                "type": type,
                "network": network,
                "status": status,
                "from": from_,
                "to": to,
                "asset": asset,
                "visibility": visibility,
                "after": after,
                "before": before,
                "limit": limit,
                "offset": offset,
            },
        )
        return field(data, "ledgerTransactions")

    async def ledger_transaction(self, transaction_id: str) -> Json:
        """A single ledger transaction. Public."""
        data = await self._http.graphql(LEDGER_TRANSACTION_QUERY, {"id": transaction_id})
        return field(data, "ledgerTransaction")

    async def bounties(
        self,
        status: str | None = None,
        creator: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> Json:
        """Bounties, newest first, optionally filtered by status / creator. Public."""
        data = await self._http.graphql(
            BOUNTIES_QUERY,
            {"status": status, "creator": creator, "limit": limit, "offset": offset},
        )
        return list_field(data, "bounties")

    async def bounty(self, bounty_id: str) -> Json:
        """A single bounty by id. Public."""
        data = await self._http.graphql(BOUNTY_QUERY, {"id": bounty_id})
        return field(data, "bounty")
