//! GraphQL API tests. These mirror the TypeScript SDK's GraphQL coverage:
//! request construction, read auth mode, response unwrapping, and GraphQL error
//! surfacing.

mod common;

use common::*;
use serde_json::{json, Value};
use tinyplace::api::graphql::{
    BountyGraphQLParams, CommentGraphQLParams, IdentityListingDetailGraphQLParams,
    IdentityListingGraphQLParams, IdentityOfferGraphQLParams, PaginationGraphQLParams,
    PostDetailGraphQLParams, PostGraphQLParams,
};
use tinyplace::error::Error;
use tinyplace::types::{AgentQueryParams, JobQueryParams, LedgerListParams, ProductQueryParams};
use wiremock::matchers::{method, path};
use wiremock::{Mock, ResponseTemplate};

/// Mount a single `POST /graphql` responder returning `body` and return the server.
async fn graphql_server(body: Value) -> wiremock::MockServer {
    let server = wiremock::MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/graphql"))
        .respond_with(ResponseTemplate::new(200).set_body_json(body))
        .mount(&server)
        .await;
    server
}

/// A minimal author selection used by many GraphQL responses.
fn author(handle: &str) -> Value {
    json!({
        "handle": handle,
        "cryptoId": "wallet-x",
        "displayName": "X",
        "avatarUrl": null,
        "verified": false
    })
}

fn post_json(post_id: &str) -> Value {
    json!({
        "postId": post_id,
        "feedId": "wallet-a",
        "body": "hi",
        "contentType": "text/plain",
        "commentCount": 0,
        "likeCount": 0,
        "createdAt": "2026-01-01T00:00:00Z",
        "moderationState": "visible",
        "viewerHasLiked": false,
        "author": author("@alice")
    })
}

fn comment_json(comment_id: &str) -> Value {
    json!({
        "commentId": comment_id,
        "postId": "p1",
        "feedId": "wallet-a",
        "body": "nice",
        "createdAt": "2026-01-01T00:00:00Z",
        "moderationState": "visible",
        "author": author("@bob")
    })
}

fn liker_json() -> Value {
    json!({
        "postId": "p1",
        "feedId": "wallet-a",
        "actor": author("@carol"),
        "createdAt": "2026-01-01T00:00:00Z"
    })
}

fn price_json() -> Value {
    json!({ "amount": "1000", "asset": "USDC", "network": "solana" })
}

fn identity_json() -> Value {
    json!({
        "username": "alice",
        "cryptoId": "wallet-a",
        "publicKey": "pk",
        "registeredAt": "2026-01-01T00:00:00Z",
        "expiresAt": "2027-01-01T00:00:00Z",
        "status": "active",
        "registrationTx": "tx",
        "paymentMethods": [],
        "subnames": [],
        "primary": true,
        "lastRenewalTx": null,
        "updatedAt": "2026-01-01T00:00:00Z"
    })
}

fn profile_json() -> Value {
    json!({
        "cryptoId": "wallet-a",
        "actorType": "agent",
        "displayName": "Alice",
        "bio": "hi",
        "avatarUrl": null,
        "link": null,
        "tags": [],
        "private": false,
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
        "verified": true,
        "attestations": [],
        "agentCard": null,
        "identities": []
    })
}

fn bid_json(bid_id: &str) -> Value {
    json!({
        "bidId": bid_id,
        "listingId": "lst-1",
        "bidder": author("@bidder"),
        "bidderCryptoId": "wallet-b",
        "bidderPublicKey": "pk",
        "price": price_json(),
        "status": "active",
        "createdAt": "2026-01-01T00:00:00Z"
    })
}

fn listing_json() -> Value {
    json!({
        "listingId": "lst-1",
        "type": "auction",
        "name": "alice",
        "seller": author("@seller"),
        "sellerCryptoId": "wallet-s",
        "description": null,
        "category": "premium",
        "tags": [],
        "price": price_json(),
        "listingType": "auction",
        "status": "open",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
        "expiresAt": null,
        "reservePrice": null,
        "highestBid": null,
        "winningBidId": null,
        "paymentDueAt": null,
        "settlementStatus": null
    })
}

fn sale_json() -> Value {
    json!({
        "saleId": "sale-1",
        "listingId": "lst-1",
        "offerId": null,
        "name": "alice",
        "seller": author("@seller"),
        "buyer": author("@buyer"),
        "buyerCryptoId": "wallet-b",
        "buyerPublicKey": "pk",
        "price": price_json(),
        "ledgerTxId": "ltx",
        "createdAt": "2026-01-01T00:00:00Z"
    })
}

fn offer_json() -> Value {
    json!({
        "offerId": "offer-1",
        "listingId": "lst-1",
        "name": "alice",
        "buyer": author("@buyer"),
        "buyerCryptoId": "wallet-b",
        "buyerPublicKey": "pk",
        "price": price_json(),
        "expiresAt": null,
        "status": "pending",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z"
    })
}

fn job_json(job_id: &str) -> Value {
    json!({
        "jobId": job_id,
        "client": "wallet-c",
        "title": "Build",
        "description": "desc",
        "category": "dev",
        "skills": [],
        "budget": { "amount": "10", "asset": "USDC", "chain": "solana" },
        "status": "open",
        "proposalCount": 0,
        "groupId": null,
        "contractEscrowId": null,
        "selectedCandidate": null,
        "dispute": null,
        "onChain": null,
        "proposalDeadline": null,
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
        "clientProfile": author("@client")
    })
}

fn ledger_tx_json(tx_id: &str) -> Value {
    json!({
        "txId": tx_id,
        "visibility": "public",
        "type": "PAYMENT",
        "from": "wallet-a",
        "to": "wallet-b",
        "amount": "1000",
        "asset": "USDC",
        "network": "solana",
        "timestamp": "2026-01-01T00:00:00Z",
        "reference": null,
        "onChainTx": "sig",
        "status": "confirmed",
        "metadata": null
    })
}

fn bounty_json(bounty_id: &str) -> Value {
    json!({
        "bountyId": bounty_id,
        "creator": "wallet-c",
        "title": "Find a bug",
        "description": "desc",
        "reward": price_json(),
        "status": "open",
        "submissionCount": 2,
        "commentCount": 1,
        "winnerSubmissionId": null,
        "winnerAgent": null,
        "startAt": "2026-01-01T00:00:00Z",
        "deadline": "2026-02-01T00:00:00Z",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z"
    })
}

#[tokio::test]
async fn graphql_home_feed_posts_to_gateway_with_agent_auth() {
    let server = wiremock::MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/graphql"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "data": {
                "homeFeed": {
                    "count": 1,
                    "items": [{
                        "score": 1.0,
                        "reason": "following",
                        "post": {
                            "postId": "p1",
                            "feedId": "wallet-a",
                            "body": "hi",
                            "contentType": "text/plain",
                            "commentCount": 0,
                            "likeCount": 2,
                            "createdAt": "2026-01-01T00:00:00Z",
                            "moderationState": "visible",
                            "viewerHasLiked": true,
                            "author": {
                                "handle": "@alice",
                                "cryptoId": "wallet-a",
                                "displayName": "Alice",
                                "avatarUrl": null,
                                "verified": true
                            }
                        }
                    }]
                }
            }
        })))
        .mount(&server)
        .await;
    let client = client_for(&server);

    let feed = client
        .graphql
        .home_feed(Some(10), None, Some(true))
        .await
        .unwrap();

    assert_eq!(feed.count, 1);
    assert_eq!(feed.items[0].post.author.handle, "@alice");
    let req = only_request(&server).await;
    assert_eq!(req.method.as_str(), "POST");
    assert_eq!(req.url.path(), "/graphql");
    assert!(req.headers.get("x-agent-id").is_some());
    assert!(req.headers.get("x-tinyplace-signature").is_some());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("homeFeed"));
    assert_eq!(body["variables"]["limit"], 10);
    assert_eq!(body["variables"]["includeSelf"], true);
}

#[tokio::test]
async fn graphql_products_unwraps_counted_result_and_sends_filters() {
    let server = wiremock::MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/graphql"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "data": {
                "products": {
                    "count": 1,
                    "products": [{
                        "productId": "prod-1",
                        "name": "Dataset",
                        "description": "Clean data",
                        "category": "dataset",
                        "tags": ["vision"],
                        "price": {"amount": "1000", "asset": "USDC", "network": "solana"},
                        "deliveryMethod": "download",
                        "status": "active",
                        "salesCount": 3,
                        "rating": 4.5,
                        "createdAt": "2026-01-01T00:00:00Z",
                        "updatedAt": "2026-01-01T00:00:00Z",
                        "seller": {
                            "handle": "@seller",
                            "cryptoId": "wallet-s",
                            "displayName": "Seller",
                            "avatarUrl": null,
                            "verified": false
                        }
                    }]
                }
            }
        })))
        .mount(&server)
        .await;
    let client = anon_client_for(&server);

    let products = client
        .graphql
        .products(Some(&ProductQueryParams {
            q: Some("data".into()),
            category: Some("dataset".into()),
            tags: Some(vec!["vision".into()]),
            seller: Some("@seller".into()),
            min_price: Some("1".into()),
            max_price: Some("10".into()),
            sort_by: Some("newest".into()),
            limit: Some(20),
            offset: Some(10),
            ..Default::default()
        }))
        .await
        .unwrap();

    assert_eq!(products.count, 1);
    assert_eq!(products.products[0].seller.handle, "@seller");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("products"));
    assert_eq!(body["variables"]["query"], "data");
    assert_eq!(body["variables"]["category"], "dataset");
    assert_eq!(body["variables"]["tags"][0], "vision");
    assert_eq!(body["variables"]["minPrice"], "1");
    assert_eq!(body["variables"]["maxPrice"], "10");
    assert_eq!(body["variables"]["sortBy"], "newest");
}

#[tokio::test]
async fn graphql_posts_unwraps_list_and_sends_handle_variables() {
    let server = graphql_server(json!({
        "data": { "posts": { "count": 1, "posts": [post_json("p1")] } }
    }))
    .await;
    let client = anon_client_for(&server);

    let result = client
        .graphql
        .posts(
            "@alice",
            Some(&PostGraphQLParams {
                limit: Some(5),
                before: Some(100),
                viewer: Some("@viewer".into()),
            }),
        )
        .await
        .unwrap();

    assert_eq!(result.count, 1);
    assert_eq!(result.posts[0].post_id, "p1");
    let req = only_request(&server).await;
    assert_eq!(req.url.path(), "/graphql");
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("posts"));
    assert_eq!(body["variables"]["handle"], "@alice");
    assert_eq!(body["variables"]["limit"], 5);
    assert_eq!(body["variables"]["before"], 100);
    assert_eq!(body["variables"]["viewer"], "@viewer");
}

#[tokio::test]
async fn graphql_post_unwraps_detail_with_comments_and_likers() {
    let mut post = post_json("p1");
    post["comments"] = json!([comment_json("c1")]);
    post["likers"] = json!([liker_json()]);
    let server = graphql_server(json!({ "data": { "post": post } })).await;
    let client = anon_client_for(&server);

    let detail = client
        .graphql
        .post(
            "@alice",
            "p1",
            Some(&PostDetailGraphQLParams {
                viewer: Some("@viewer".into()),
                comment_limit: Some(3),
                comment_after: Some(0),
                liker_limit: Some(2),
                liker_offset: Some(0),
            }),
        )
        .await
        .unwrap()
        .expect("post present");

    assert_eq!(detail.post.post_id, "p1");
    assert_eq!(detail.comments[0].comment_id, "c1");
    assert_eq!(detail.likers[0].actor.handle, "@carol");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("post(handle:"));
    assert_eq!(body["variables"]["postId"], "p1");
    assert_eq!(body["variables"]["commentLimit"], 3);
    assert_eq!(body["variables"]["likerLimit"], 2);
}

#[tokio::test]
async fn graphql_post_comments_unwraps_list_and_sends_variables() {
    let server = graphql_server(json!({
        "data": { "comments": [comment_json("c1")] }
    }))
    .await;
    let client = anon_client_for(&server);

    let comments = client
        .graphql
        .post_comments(
            "p1",
            Some(&CommentGraphQLParams {
                feed_id: Some("wallet-a".into()),
                limit: Some(10),
                after: Some(5),
            }),
        )
        .await
        .unwrap();

    assert_eq!(comments[0].comment_id, "c1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("comments(postId:"));
    assert_eq!(body["variables"]["postId"], "p1");
    assert_eq!(body["variables"]["feedId"], "wallet-a");
    assert_eq!(body["variables"]["after"], 5);
}

#[tokio::test]
async fn graphql_post_likers_unwraps_counted_result() {
    let server = graphql_server(json!({
        "data": { "postLikers": { "count": 1, "likers": [liker_json()] } }
    }))
    .await;
    let client = anon_client_for(&server);

    let likers = client
        .graphql
        .post_likers(
            "p1",
            Some(&PaginationGraphQLParams {
                limit: Some(5),
                offset: Some(10),
            }),
        )
        .await
        .unwrap();

    assert_eq!(likers.count, 1);
    assert_eq!(likers.likers[0].actor.handle, "@carol");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("postLikers"));
    assert_eq!(body["variables"]["postId"], "p1");
    assert_eq!(body["variables"]["offset"], 10);
}

#[tokio::test]
async fn graphql_profile_unwraps_and_sends_username() {
    let server = graphql_server(json!({ "data": { "profile": profile_json() } })).await;
    let client = anon_client_for(&server);

    let profile = client
        .graphql
        .profile("@alice")
        .await
        .unwrap()
        .expect("profile present");

    assert_eq!(profile.crypto_id, "wallet-a");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"]
        .as_str()
        .unwrap()
        .contains("profile(username:"));
    assert_eq!(body["variables"]["username"], "@alice");
}

#[tokio::test]
async fn graphql_user_unwraps_and_sends_crypto_id() {
    let server = graphql_server(json!({ "data": { "user": profile_json() } })).await;
    let client = anon_client_for(&server);

    let user = client
        .graphql
        .user("wallet-a")
        .await
        .unwrap()
        .expect("user present");

    assert_eq!(user.crypto_id, "wallet-a");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("user(cryptoId:"));
    assert_eq!(body["variables"]["cryptoId"], "wallet-a");
}

#[tokio::test]
async fn graphql_identity_unwraps_and_sends_username() {
    let mut identity = identity_json();
    identity["owner"] = json!(null);
    let server = graphql_server(json!({ "data": { "identity": identity } })).await;
    let client = anon_client_for(&server);

    let identity = client
        .graphql
        .identity("alice")
        .await
        .unwrap()
        .expect("identity present");

    assert_eq!(identity.identity.username, "alice");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"]
        .as_str()
        .unwrap()
        .contains("identity(username:"));
    assert_eq!(body["variables"]["username"], "alice");
}

#[tokio::test]
async fn graphql_identities_unwraps_list_and_sends_crypto_id() {
    let server = graphql_server(json!({ "data": { "identities": [identity_json()] } })).await;
    let client = anon_client_for(&server);

    let identities = client.graphql.identities("wallet-a").await.unwrap();

    assert_eq!(identities[0].username, "alice");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"]
        .as_str()
        .unwrap()
        .contains("identities(cryptoId:"));
    assert_eq!(body["variables"]["cryptoId"], "wallet-a");
}

#[tokio::test]
async fn graphql_agent_card_unwraps_and_sends_id() {
    let server = graphql_server(json!({
        "data": {
            "agentCard": {
                "agentId": "agent-1",
                "name": "Helper",
                "description": "desc",
                "username": "alice",
                "cryptoId": "wallet-a",
                "url": "https://x",
                "skills": [],
                "capabilities": [],
                "tags": [],
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-01T00:00:00Z"
            }
        }
    }))
    .await;
    let client = anon_client_for(&server);

    let card = client
        .graphql
        .agent_card("agent-1")
        .await
        .unwrap()
        .expect("card present");

    assert_eq!(card.agent_id, "agent-1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("agentCard(id:"));
    assert_eq!(body["variables"]["id"], "agent-1");
}

#[tokio::test]
async fn graphql_agents_unwraps_directory_with_follow_status_under_agent_auth() {
    let server = graphql_server(json!({
        "data": {
            "agents": {
                "count": 2,
                "agents": [
                    {
                        "agentId": "agent-a",
                        "name": "Alice Bot",
                        "cryptoId": "wallet-a",
                        "createdAt": "2026-01-01T00:00:00Z",
                        "updatedAt": "2026-01-01T00:00:00Z",
                        "viewerIsFollowing": true
                    },
                    {
                        "agentId": "agent-b",
                        "name": "Bob Bot",
                        "cryptoId": "wallet-b",
                        "createdAt": "2026-01-01T00:00:00Z",
                        "updatedAt": "2026-01-01T00:00:00Z",
                        "viewerIsFollowing": false
                    }
                ]
            }
        }
    }))
    .await;
    let client = client_for(&server);

    let result = client
        .graphql
        .agents(Some(&AgentQueryParams {
            q: Some("bot".to_string()),
            limit: Some(10),
            ..Default::default()
        }))
        .await
        .unwrap();

    assert_eq!(result.count, 2);
    assert_eq!(result.agents[0].viewer_is_following, Some(true));
    assert_eq!(result.agents[1].viewer_is_following, Some(false));

    let req = only_request(&server).await;
    // Sent under agent auth so the server can resolve the viewer's follow graph.
    assert!(req.headers.get("x-agent-id").is_some());
    assert!(req.headers.get("x-tinyplace-signature").is_some());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"]
        .as_str()
        .unwrap()
        .contains("viewerIsFollowing"));
    // `q` maps onto the GraphQL `query` variable.
    assert_eq!(body["variables"]["query"], "bot");
    assert_eq!(body["variables"]["limit"], 10);
}

#[tokio::test]
async fn graphql_product_unwraps_and_sends_id() {
    let server = graphql_server(json!({
        "data": {
            "product": {
                "productId": "prod-1",
                "name": "Dataset",
                "description": "Clean data",
                "category": "dataset",
                "tags": [],
                "price": price_json(),
                "deliveryMethod": "download",
                "status": "active",
                "salesCount": 0,
                "rating": 0.0,
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-01T00:00:00Z",
                "seller": author("@seller")
            }
        }
    }))
    .await;
    let client = anon_client_for(&server);

    let product = client
        .graphql
        .product("prod-1")
        .await
        .unwrap()
        .expect("product present");

    assert_eq!(product.product_id, "prod-1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("product(id:"));
    assert_eq!(body["variables"]["id"], "prod-1");
}

#[tokio::test]
async fn graphql_identity_listings_unwraps_counted_result_and_sends_filters() {
    let server = graphql_server(json!({
        "data": { "identityListings": { "count": 1, "listings": [listing_json()] } }
    }))
    .await;
    let client = anon_client_for(&server);

    let result = client
        .graphql
        .identity_listings(Some(&IdentityListingGraphQLParams {
            query: Some("ali".into()),
            tag: Some("premium".into()),
            tags: Some(vec!["short".into()]),
            category: Some("premium".into()),
            seller: Some("@seller".into()),
            min_price: Some("1".into()),
            max_price: Some("10".into()),
            sort_by: Some("newest".into()),
            length: Some(5),
            limit: Some(20),
            offset: Some(0),
        }))
        .await
        .unwrap();

    assert_eq!(result.count, 1);
    assert_eq!(result.listings[0].listing_id, "lst-1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("identityListings"));
    assert_eq!(body["variables"]["query"], "ali");
    assert_eq!(body["variables"]["tag"], "premium");
    assert_eq!(body["variables"]["length"], 5);
}

#[tokio::test]
async fn graphql_identity_listing_unwraps_detail_with_bids_and_history() {
    let mut listing = listing_json();
    listing["bids"] = json!([bid_json("bid-1")]);
    listing["history"] = json!([sale_json()]);
    let server = graphql_server(json!({ "data": { "identityListing": listing } })).await;
    let client = anon_client_for(&server);

    let detail = client
        .graphql
        .identity_listing(
            "lst-1",
            Some(&IdentityListingDetailGraphQLParams {
                bid_limit: Some(5),
                bid_offset: Some(0),
                history_limit: Some(3),
                history_offset: Some(0),
            }),
        )
        .await
        .unwrap()
        .expect("listing present");

    assert_eq!(detail.listing.listing_id, "lst-1");
    assert_eq!(detail.bids[0].bid_id, "bid-1");
    assert_eq!(detail.history[0].sale_id, "sale-1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"]
        .as_str()
        .unwrap()
        .contains("identityListing(id:"));
    assert_eq!(body["variables"]["id"], "lst-1");
    assert_eq!(body["variables"]["bidLimit"], 5);
    assert_eq!(body["variables"]["historyLimit"], 3);
}

#[tokio::test]
async fn graphql_identity_bids_unwraps_counted_result() {
    let server = graphql_server(json!({
        "data": { "identityBids": { "count": 1, "bids": [bid_json("bid-1")] } }
    }))
    .await;
    let client = anon_client_for(&server);

    let result = client
        .graphql
        .identity_bids(
            "lst-1",
            Some(&PaginationGraphQLParams {
                limit: Some(5),
                offset: Some(0),
            }),
        )
        .await
        .unwrap();

    assert_eq!(result.count, 1);
    assert_eq!(result.bids[0].bid_id, "bid-1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("identityBids"));
    assert_eq!(body["variables"]["listingId"], "lst-1");
}

#[tokio::test]
async fn graphql_identity_offers_unwraps_counted_result_and_sends_filters() {
    let server = graphql_server(json!({
        "data": { "identityOffers": { "count": 1, "offers": [offer_json()] } }
    }))
    .await;
    let client = anon_client_for(&server);

    let result = client
        .graphql
        .identity_offers(Some(&IdentityOfferGraphQLParams {
            agent: Some("@agent".into()),
            buyer: Some("@buyer".into()),
            name: Some("alice".into()),
            status: Some("pending".into()),
            limit: Some(10),
            offset: Some(0),
        }))
        .await
        .unwrap();

    assert_eq!(result.count, 1);
    assert_eq!(result.offers[0].offer_id, "offer-1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("identityOffers"));
    assert_eq!(body["variables"]["agent"], "@agent");
    assert_eq!(body["variables"]["name"], "alice");
    assert_eq!(body["variables"]["status"], "pending");
}

#[tokio::test]
async fn graphql_identity_sales_unwraps_counted_result_and_sends_name() {
    let server = graphql_server(json!({
        "data": { "identitySales": { "count": 1, "sales": [sale_json()] } }
    }))
    .await;
    let client = anon_client_for(&server);

    let result = client
        .graphql
        .identity_sales(
            "alice",
            Some(&PaginationGraphQLParams {
                limit: Some(10),
                offset: Some(0),
            }),
        )
        .await
        .unwrap();

    assert_eq!(result.count, 1);
    assert_eq!(result.sales[0].sale_id, "sale-1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("identitySales"));
    assert_eq!(body["variables"]["name"], "alice");
}

#[tokio::test]
async fn graphql_jobs_unwraps_counted_result_and_sends_filters() {
    let server = graphql_server(json!({
        "data": { "jobs": { "count": 1, "jobs": [job_json("job-1")] } }
    }))
    .await;
    let client = anon_client_for(&server);

    let result = client
        .graphql
        .jobs(Some(&JobQueryParams {
            client: Some("wallet-c".into()),
            status: Some("open".into()),
            category: Some("dev".into()),
            skill: Some("rust".into()),
            limit: Some(10),
            offset: Some(0),
        }))
        .await
        .unwrap();

    assert_eq!(result.count, 1);
    assert_eq!(result.jobs[0].job_id, "job-1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("jobs(client:"));
    assert_eq!(body["variables"]["client"], "wallet-c");
    assert_eq!(body["variables"]["skill"], "rust");
}

#[tokio::test]
async fn graphql_job_unwraps_and_sends_id() {
    let server = graphql_server(json!({ "data": { "job": job_json("job-1") } })).await;
    let client = anon_client_for(&server);

    let job = client
        .graphql
        .job("job-1")
        .await
        .unwrap()
        .expect("job present");

    assert_eq!(job.job_id, "job-1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("job(id:"));
    assert_eq!(body["variables"]["id"], "job-1");
}

#[tokio::test]
async fn graphql_ledger_transactions_unwraps_counted_result_and_sends_filters() {
    let server = graphql_server(json!({
        "data": { "ledgerTransactions": { "count": 1, "transactions": [ledger_tx_json("tx-1")] } }
    }))
    .await;
    let client = anon_client_for(&server);

    let result = client
        .graphql
        .ledger_transactions(Some(&LedgerListParams {
            agent: Some("wallet-a".into()),
            r#type: Some("PAYMENT".into()),
            network: Some("solana".into()),
            status: Some("confirmed".into()),
            from: Some("2026-01-01T00:00:00Z".into()),
            to: Some("2026-02-01T00:00:00Z".into()),
            asset: Some("USDC".into()),
            visibility: Some("public".into()),
            after: Some("2026-01-01T00:00:00Z".into()),
            before: Some("2026-02-01T00:00:00Z".into()),
            limit: Some(10),
            offset: Some(0),
        }))
        .await
        .unwrap();

    assert_eq!(result.count, 1);
    assert_eq!(result.transactions[0].tx_id, "tx-1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"]
        .as_str()
        .unwrap()
        .contains("ledgerTransactions"));
    assert_eq!(body["variables"]["agent"], "wallet-a");
    assert_eq!(body["variables"]["type"], "PAYMENT");
    assert_eq!(body["variables"]["visibility"], "public");
}

#[tokio::test]
async fn graphql_ledger_transaction_unwraps_and_sends_id() {
    let server = graphql_server(json!({
        "data": { "ledgerTransaction": ledger_tx_json("tx-1") }
    }))
    .await;
    let client = anon_client_for(&server);

    let tx = client
        .graphql
        .ledger_transaction("tx-1")
        .await
        .unwrap()
        .expect("transaction present");

    assert_eq!(tx.tx_id, "tx-1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"]
        .as_str()
        .unwrap()
        .contains("ledgerTransaction(id:"));
    assert_eq!(body["variables"]["id"], "tx-1");
}

#[tokio::test]
async fn graphql_bounties_unwraps_list_and_sends_filters() {
    let server = graphql_server(json!({
        "data": { "bounties": [bounty_json("bnt-1")] }
    }))
    .await;
    let client = anon_client_for(&server);

    let bounties = client
        .graphql
        .bounties(Some(&BountyGraphQLParams {
            status: Some("open".into()),
            creator: Some("wallet-c".into()),
            limit: Some(10),
            offset: Some(0),
        }))
        .await
        .unwrap();

    assert_eq!(bounties[0].bounty_id, "bnt-1");
    assert_eq!(bounties[0].reward.asset, "USDC");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("bounties(status:"));
    assert_eq!(body["variables"]["status"], "open");
    assert_eq!(body["variables"]["creator"], "wallet-c");
}

#[tokio::test]
async fn graphql_bounty_unwraps_and_sends_id() {
    let server = graphql_server(json!({ "data": { "bounty": bounty_json("bnt-1") } })).await;
    let client = anon_client_for(&server);

    let bounty = client
        .graphql
        .bounty("bnt-1")
        .await
        .unwrap()
        .expect("bounty present");

    assert_eq!(bounty.bounty_id, "bnt-1");
    let req = only_request(&server).await;
    assert!(req.headers.get("x-agent-id").is_none());
    let body: Value = serde_json::from_slice(&req.body).unwrap();
    assert!(body["query"].as_str().unwrap().contains("bounty(id:"));
    assert_eq!(body["variables"]["id"], "bnt-1");
}

#[tokio::test]
async fn graphql_errors_are_returned_as_sdk_errors() {
    let server = any_ok(json!({ "errors": [{ "message": "boom" }] })).await;
    let client = anon_client_for(&server);

    let error = client.graphql.profile("@nobody").await.unwrap_err();

    match error {
        Error::Http(err) => {
            assert_eq!(err.status, 200);
            assert!(err.message.contains("boom"));
        }
        other => panic!("expected HTTP-style GraphQL error, got {other:?}"),
    }
}
