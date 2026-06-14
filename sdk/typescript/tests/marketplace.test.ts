import { describe, expect, it } from "vitest";
import {
  canonicalPayload,
  LocalSigner,
  SOLANA_MAINNET_NETWORK,
  TinyPlaceClient,
} from "../src/index.js";

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function fromBase64Url(value: string): string {
  const padded = value.padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  return atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
}

async function verifySignature(
  signer: LocalSigner,
  signature: string,
  action: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const [version, timestamp, nonce, rawSignature] = signature.split(":");
  expect(version).toBe("v1");
  expect(timestamp).toBeTruthy();
  expect(nonce).toBeTruthy();
  expect(rawSignature).toBeTruthy();

  const publicKey = await globalThis.crypto.subtle.importKey(
    "raw",
    signer.publicKey,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const payload = canonicalPayload(action, fields);
  return globalThis.crypto.subtle.verify(
    "Ed25519",
    publicKey,
    fromBase64(rawSignature!),
    new TextEncoder().encode(
      `${payload}\n${fromBase64Url(timestamp!)}\n${fromBase64Url(nonce!)}`,
    ),
  );
}

describe("MarketplaceApi", () => {
  function marketplaceRpcFetch(
    calls: Array<string>,
    transaction: string,
  ): typeof globalThis.fetch {
    return async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: Array<unknown>;
      };
      calls.push(body.method);
      switch (body.method) {
        case "getTokenAccountsByOwner":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: {
              value: [
                {
                  pubkey:
                    calls.length === 1
                      ? "89t6Va3uXRRzmPzfrt2VTPpGatBDFoj9gNeRVyeANKdK"
                      : "FYBkeQZniT9vpdGGFiT57gbXEYLTTbeqiVmMRLvK87rQ",
                  account: {
                    data: {
                      parsed: { info: { tokenAmount: { amount: "10" } } },
                    },
                  },
                },
              ],
            },
          });
        case "getLatestBlockhash":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: { value: { blockhash: "11111111111111111111111111111111" } },
          });
        case "sendTransaction":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: transaction,
          });
        case "getSignatureStatuses":
          return Response.json({
            jsonrpc: "2.0",
            id: body.method,
            result: {
              value: [{ confirmationStatus: "confirmed", err: null }],
            },
          });
        default:
          return Response.json(
            {
              jsonrpc: "2.0",
              id: body.method,
              error: { message: `unexpected method ${body.method}` },
            },
            { status: 500 },
          );
      }
    };
  }

  it("browses the unified marketplace root endpoint", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          products: [],
          identities: [],
        });
      },
    });

    await client.marketplace.browseMarketplace({
      q: "market",
      type: "identities",
      tags: ["premium", "data"],
      limit: 5,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(
      "https://example.test/marketplace?q=market&type=identities&tags=premium&tags=data&limit=5",
    );
  });

  it("opens marketplace streams with directory query auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(18));
    const openedUrls: Array<string> = [];
    const originalWebSocket = globalThis.WebSocket;

    class MockWebSocket {
      static readonly OPEN = 1;
      readyState = MockWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: ((error: unknown) => void) | null = null;

      constructor(url: string) {
        openedUrls.push(url);
        queueMicrotask(() => {
          this.onopen?.();
        });
      }

      send(): void {}

      close(): void {
        this.onclose?.();
      }
    }

    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    try {
      const client = new TinyPlaceClient({
        baseUrl: "https://example.test",
        signer,
        fetch: async () => Response.json({}),
      });

      const stream = client.marketplace.stream("@seller", { limit: 5 });
      expect(stream).toBeDefined();
      await stream!.connect();
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }

    expect(openedUrls).toHaveLength(1);
    const url = new URL(openedUrls[0]!);
    expect(url.origin).toBe("wss://example.test");
    expect(url.pathname).toBe("/marketplace/stream");
    expect(url.searchParams.get("X-Agent-ID")).toBe("@seller");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("X-TinyPlace-Date")).toBeTruthy();
    expect(url.searchParams.get("X-TinyPlace-Nonce")).toBeTruthy();
    expect(url.searchParams.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(url.searchParams.get("X-TinyPlace-Signature")).toBeTruthy();
    expect(url.searchParams.get("authorization")).toBeNull();
  });

  it("signs product reviews with a client-generated review ID", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(11));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(
          {
            reviewId: "rev_response",
            productId: "prod_123",
            buyer: "@buyer",
            rating: 5,
            comment: "Works well",
            createdAt: "2026-06-13T00:00:00.000Z",
          },
          { status: 201 },
        );
      },
    });

    await client.marketplace.createProductReview("prod_123", {
      buyer: "@buyer",
      rating: 5,
      comment: "Works well",
    });

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      "https://example.test/marketplace/products/prod_123/reviews",
    );
    expect(request.headers.get("X-Agent-ID")).toBe("@buyer");
    expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
      signer.publicKeyBase64,
    );
    expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();

    const body = (await request.json()) as {
      buyer: string;
      comment: string;
      productId: string;
      rating: number;
      reviewId: string;
      signature: string;
    };
    expect(body).toMatchObject({
      buyer: "@buyer",
      comment: "Works well",
      productId: "prod_123",
      rating: 5,
    });
    expect(body.reviewId).toMatch(/^rev_/);
    expect(body.signature).toBeTruthy();

    await expect(
      verifySignature(signer, body.signature, "marketplace.product.review", {
        buyer: body.buyer,
        comment: body.comment,
        productId: body.productId,
        rating: body.rating,
        reviewId: body.reviewId,
      }),
    ).resolves.toBe(true);
  });

  it("buys products with Solana x402 pinned to the listing price and seller", async () => {
    const seed = new Uint8Array(32).fill(23);
    const signer = await LocalSigner.fromSeed(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(signer.publicKey, 32);
    const transaction =
      "5q22im1eoEeoJMhsshDkoh4tNV1WPUfyaJXHwyGqcpfmtpY1ZCC665nc5chyEwwau4JoR7BUnCbxWn5BW5WzR3NC";
    const rpcCalls: Array<string> = [];
    const marketplaceRequests: Array<Request> = [];
    const rpcFetch = marketplaceRpcFetch(rpcCalls, transaction);
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.url === "https://example.test/marketplace/products/prod_123") {
        marketplaceRequests.push(request);
        return Response.json({
          productId: "prod_123",
          seller: "@seller",
          sellerCryptoId: "seller-address",
          name: "Research Pack",
          description: "Fresh market data",
          category: "dataset",
          price: {
            amount: "1",
            asset: "USDC",
            network: SOLANA_MAINNET_NETWORK,
          },
          deliveryMethod: "download",
          status: "active",
          createdAt: "2026-06-13T00:00:00Z",
          updatedAt: "2026-06-13T00:00:00Z",
          salesCount: 0,
          rating: 0,
        });
      }
      if (
        request.url ===
        "https://example.test/marketplace/products/prod_123/buy"
      ) {
        marketplaceRequests.push(request);
        return Response.json(
          {
            purchaseId: "buy_123",
            productId: "prod_123",
            buyer: "@buyer",
            buyerCryptoId: signer.agentId,
            seller: "@seller",
            price: {
              amount: "1",
              asset: "USDC",
              network: SOLANA_MAINNET_NETWORK,
            },
            createdAt: "2026-06-13T00:00:00Z",
          },
          { status: 201 },
        );
      }
      return rpcFetch(input, init);
    };
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch,
    });

    const result = await client.marketplace.buyProductWithSolanaPayment(
      "prod_123",
      {
        buyer: "@buyer",
        buyerCryptoId: signer.agentId,
      },
      {
        rpcUrl: "https://solana.example.test",
        secretKey,
        fetch,
      },
    );

    expect(result.purchase.purchaseId).toBe("buy_123");
    expect(result.product.productId).toBe("prod_123");
    expect(result.payment.signature).toBe(transaction);
    expect(marketplaceRequests).toHaveLength(2);
    const buyRequest = marketplaceRequests[1]!;
    expect(buyRequest.headers.get("X-Agent-ID")).toBe("@buyer");
    const body = (await buyRequest.json()) as {
      buyer: string;
      buyerCryptoId: string;
      payment: Record<string, string>;
    };
    expect(body.buyer).toBe("@buyer");
    expect(body.buyerCryptoId).toBe(signer.agentId);
    expect(body.payment).toMatchObject({
      amount: "1",
      asset: "USDC",
      from: "@buyer",
      network: SOLANA_MAINNET_NETWORK,
      to: "@seller",
      onChainTx: transaction,
      transaction,
      tx: transaction,
      "metadata.domain": "tiny.place",
      "metadata.kind": "product",
      "metadata.productId": "prod_123",
      "metadata.publicKey": signer.publicKeyBase64,
      "metadata.onChainTx": transaction,
      "metadata.transaction": transaction,
      "metadata.tx": transaction,
    });
    expect(rpcCalls).toEqual([
      "getTokenAccountsByOwner",
      "getTokenAccountsByOwner",
      "getLatestBlockhash",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
  });

  it("buys identity listings with Solana x402 pinned to listing price and seller", async () => {
    const seed = new Uint8Array(32).fill(24);
    const signer = await LocalSigner.fromSeed(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed, 0);
    secretKey.set(signer.publicKey, 32);
    const transaction =
      "5q22im1eoEeoJMhsshDkoh4tNV1WPUfyaJXHwyGqcpfmtpY1ZCC665nc5chyEwwau4JoR7BUnCbxWn5BW5WzR3NC";
    const rpcCalls: Array<string> = [];
    const marketplaceRequests: Array<Request> = [];
    const rpcFetch = marketplaceRpcFetch(rpcCalls, transaction);
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.url === "https://example.test/marketplace/identities") {
        marketplaceRequests.push(request);
        return Response.json({
          identities: [
            {
              listingId: "listing_123",
              type: "identity",
              name: "@sellername",
              seller: "@seller",
              sellerCryptoId: "seller-address",
              category: "identity",
              price: {
                amount: "1",
                asset: "USDC",
                network: SOLANA_MAINNET_NETWORK,
              },
              listingType: "fixed",
              status: "active",
              createdAt: "2026-06-13T00:00:00Z",
              updatedAt: "2026-06-13T00:00:00Z",
            },
          ],
        });
      }
      if (
        request.url ===
        "https://example.test/marketplace/identities/listing_123/buy"
      ) {
        marketplaceRequests.push(request);
        return Response.json(
          {
            saleId: "sale_123",
            listingId: "listing_123",
            name: "@sellername",
            seller: "@seller",
            buyer: "@buyer",
            buyerCryptoId: signer.agentId,
            buyerPublicKey: signer.publicKeyBase64,
            price: {
              amount: "1",
              asset: "USDC",
              network: SOLANA_MAINNET_NETWORK,
            },
            createdAt: "2026-06-13T00:00:00Z",
          },
          { status: 201 },
        );
      }
      return rpcFetch(input, init);
    };
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch,
    });

    const result = await client.marketplace.buyIdentityListingWithSolanaPayment(
      "listing_123",
      {
        buyer: "@buyer",
        buyerCryptoId: signer.agentId,
        buyerPublicKey: signer.publicKeyBase64,
      },
      {
        rpcUrl: "https://solana.example.test",
        secretKey,
        fetch,
      },
    );

    expect(result.sale.saleId).toBe("sale_123");
    expect(result.listing.listingId).toBe("listing_123");
    expect(result.payment.signature).toBe(transaction);
    expect(marketplaceRequests).toHaveLength(2);
    const buyRequest = marketplaceRequests[1]!;
    expect(buyRequest.headers.get("X-Agent-ID")).toBe("@buyer");
    const body = (await buyRequest.json()) as {
      buyer: string;
      buyerCryptoId: string;
      buyerPublicKey: string;
      payment: Record<string, string>;
      signature: string;
    };
    expect(body).toMatchObject({
      buyer: "@buyer",
      buyerCryptoId: signer.agentId,
      buyerPublicKey: signer.publicKeyBase64,
    });
    await expect(
      verifySignature(signer, body.signature, "marketplace.identity.buy", {
        buyer: "@buyer",
        buyerCryptoId: signer.agentId,
        buyerPublicKey: signer.publicKeyBase64,
        listingId: "listing_123",
      }),
    ).resolves.toBe(true);
    expect(body.payment).toMatchObject({
      amount: "1",
      asset: "USDC",
      from: "@buyer",
      network: SOLANA_MAINNET_NETWORK,
      to: "@seller",
      onChainTx: transaction,
      transaction,
      tx: transaction,
      "metadata.domain": "tiny.place",
      "metadata.identity": "@sellername",
      "metadata.kind": "identity-listing",
      "metadata.listingId": "listing_123",
      "metadata.publicKey": signer.publicKeyBase64,
      "metadata.onChainTx": transaction,
      "metadata.transaction": transaction,
      "metadata.tx": transaction,
    });
    expect(rpcCalls).toEqual([
      "getTokenAccountsByOwner",
      "getTokenAccountsByOwner",
      "getLatestBlockhash",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
  });

  it("creates identity offers with an upto Solana x402 authorization", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(25));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(
          {
            offerId: "offer_123",
            name: "@target",
            buyer: "@buyer",
            buyerCryptoId: signer.agentId,
            buyerPublicKey: signer.publicKeyBase64,
            price: {
              amount: "1",
              asset: "USDC",
              network: SOLANA_MAINNET_NETWORK,
            },
            status: "pending",
            createdAt: "2026-06-13T00:00:00Z",
            updatedAt: "2026-06-13T00:00:00Z",
          },
          { status: 201 },
        );
      },
    });

    const result = await client.marketplace.createOfferWithSolanaPayment(
      {
        offerId: "offer_123",
        name: "@target",
        buyer: "@buyer",
        buyerCryptoId: signer.agentId,
        buyerPublicKey: signer.publicKeyBase64,
        price: {
          amount: "1",
          asset: "USDC",
          network: SOLANA_MAINNET_NETWORK,
        },
      },
      {
        nonce: "offer-nonce",
        expiresAt: "2026-06-13T10:00:00Z",
      },
    );

    expect(result.offer.offerId).toBe("offer_123");
    expect(result.payment).toMatchObject({
      scheme: "upto",
      network: SOLANA_MAINNET_NETWORK,
      asset: "USDC",
      amount: "1",
      from: "@buyer",
      to: "@target",
      nonce: "offer-nonce",
      expiresAt: "2026-06-13T10:00:00Z",
      "metadata.domain": "tiny.place",
      "metadata.kind": "identity-offer",
      "metadata.name": "@target",
      "metadata.offerId": "offer_123",
      "metadata.publicKey": signer.publicKeyBase64,
    });
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.headers.get("X-Agent-ID")).toBe("@buyer");
    const body = (await request.json()) as {
      buyer: string;
      buyerCryptoId: string;
      buyerPublicKey: string;
      name: string;
      offerId: string;
      payment: Record<string, string>;
      price: { amount: string; asset: string; network: string };
      signature: string;
    };
    expect(body.payment).toEqual(result.payment);
    await expect(
      verifySignature(signer, body.signature, "marketplace.identity.offer", {
        buyer: "@buyer",
        buyerCryptoId: signer.agentId,
        buyerPublicKey: signer.publicKeyBase64,
        listingId: "",
        name: "@target",
        offerId: "offer_123",
        price: {
          amount: "1",
          asset: "USDC",
          network: SOLANA_MAINNET_NETWORK,
        },
      }),
    ).resolves.toBe(true);
  });

  it("places identity bids with an upto Solana x402 authorization", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(26));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url === "https://example.test/marketplace/identities") {
          return Response.json({
            identities: [
              {
                listingId: "listing_bid",
                type: "identity",
                name: "@target",
                seller: "@seller",
                sellerCryptoId: "seller-address",
                category: "identity",
                price: {
                  amount: "1",
                  asset: "USDC",
                  network: SOLANA_MAINNET_NETWORK,
                },
                listingType: "auction",
                status: "active",
                createdAt: "2026-06-13T00:00:00Z",
                updatedAt: "2026-06-13T00:00:00Z",
              },
            ],
          });
        }
        return Response.json({
          listingId: "listing_bid",
          type: "identity",
          name: "@target",
          seller: "@seller",
          sellerCryptoId: "seller-address",
          category: "identity",
          price: {
            amount: "1",
            asset: "USDC",
            network: SOLANA_MAINNET_NETWORK,
          },
          listingType: "auction",
          status: "active",
          createdAt: "2026-06-13T00:00:00Z",
          updatedAt: "2026-06-13T00:00:00Z",
        });
      },
    });

    const result = await client.marketplace.placeBidWithSolanaPayment(
      "listing_bid",
      {
        bidId: "bid_123",
        bidder: "@buyer",
        bidderCryptoId: signer.agentId,
        bidderPublicKey: signer.publicKeyBase64,
        price: {
          amount: "2",
          asset: "USDC",
          network: SOLANA_MAINNET_NETWORK,
        },
      },
      {
        nonce: "bid-nonce",
        expiresAt: "2026-06-13T10:00:00Z",
      },
    );

    expect(result.listing.listingId).toBe("listing_bid");
    expect(result.updatedListing.listingId).toBe("listing_bid");
    expect(result.payment).toMatchObject({
      scheme: "upto",
      network: SOLANA_MAINNET_NETWORK,
      asset: "USDC",
      amount: "2",
      from: "@buyer",
      to: "@seller",
      nonce: "bid-nonce",
      expiresAt: "2026-06-13T10:00:00Z",
      "metadata.bidId": "bid_123",
      "metadata.domain": "tiny.place",
      "metadata.identity": "@target",
      "metadata.kind": "identity-bid",
      "metadata.listingId": "listing_bid",
      "metadata.publicKey": signer.publicKeyBase64,
    });
    expect(requests).toHaveLength(2);
    const request = requests[1]!;
    expect(request.url).toBe(
      "https://example.test/marketplace/identities/listing_bid/bids",
    );
    expect(request.headers.get("X-Agent-ID")).toBe("@buyer");
    const body = (await request.json()) as {
      bidId: string;
      bidder: string;
      bidderCryptoId: string;
      bidderPublicKey: string;
      listingId: string;
      payment: Record<string, string>;
      price: { amount: string; asset: string; network: string };
      signature: string;
    };
    expect(body.payment).toEqual(result.payment);
    await expect(
      verifySignature(signer, body.signature, "marketplace.identity.bid", {
        bidId: "bid_123",
        bidder: "@buyer",
        bidderCryptoId: signer.agentId,
        bidderPublicKey: signer.publicKeyBase64,
        listingId: "listing_bid",
        price: {
          amount: "2",
          asset: "USDC",
          network: SOLANA_MAINNET_NETWORK,
        },
      }),
    ).resolves.toBe(true);
  });

  it("signs product lifecycle requests with marketplace actors", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(14));
    const requests: Array<Request> = [];
    const price = { amount: "7", asset: "USDC", network: "eip155:8453" };
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });

    await client.marketplace.createProduct({
      name: "Research Pack",
      description: "Fresh market data",
      category: "dataset",
      tags: ["market", "data"],
      seller: "@seller",
      sellerCryptoId: signer.agentId,
      price,
      deliveryMethod: "download",
      stock: 3,
    });
    await client.marketplace.updateProduct("prod_123", {
      productId: "prod_123",
      name: "Research Pack v2",
      description: "Fresh market data",
      category: "dataset",
      tags: ["market", "data"],
      seller: "@seller",
      sellerCryptoId: signer.agentId,
      price,
      deliveryMethod: "download",
      status: "active",
      stock: 3,
      createdAt: "2026-06-13T00:00:00.000Z",
      updatedAt: "2026-06-13T00:00:00.000Z",
      salesCount: 0,
      rating: 0,
    });
    await client.marketplace.buyProduct("prod_123", {
      buyer: "@buyer",
      buyerCryptoId: signer.agentId,
      payment: { transaction: "tx_123" },
    });
    await client.marketplace.deleteProduct("prod_123");

    expect(requests).toHaveLength(4);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://example.test/marketplace/products");
    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@seller");

    const createBody = (await requests[0]!.json()) as {
      category: string;
      deliveryMethod: string;
      description: string;
      name: string;
      price: typeof price;
      productId: string;
      seller: string;
      sellerCryptoId: string;
      stock: number;
      tags: Array<string>;
      signature: string;
    };
    expect(createBody.productId).toMatch(/^prod_/);
    await expect(
      verifySignature(signer, createBody.signature, "marketplace.product", {
        category: createBody.category,
        deliveryMethod: createBody.deliveryMethod,
        description: createBody.description,
        name: createBody.name,
        price: createBody.price,
        productId: createBody.productId,
        seller: createBody.seller,
        sellerCryptoId: createBody.sellerCryptoId,
        stock: createBody.stock,
        tags: createBody.tags,
      }),
    ).resolves.toBe(true);

    expect(requests[1]!.method).toBe("PUT");
    expect(requests[1]!.url).toBe(
      "https://example.test/marketplace/products/prod_123",
    );
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@seller");
    const updateBody = (await requests[1]!.json()) as {
      category: string;
      deliveryMethod: string;
      description: string;
      name: string;
      price: typeof price;
      productId: string;
      seller: string;
      sellerCryptoId: string;
      stock: number;
      tags: Array<string>;
      signature: string;
    };
    await expect(
      verifySignature(signer, updateBody.signature, "marketplace.product", {
        category: updateBody.category,
        deliveryMethod: updateBody.deliveryMethod,
        description: updateBody.description,
        name: updateBody.name,
        price: updateBody.price,
        productId: updateBody.productId,
        seller: updateBody.seller,
        sellerCryptoId: updateBody.sellerCryptoId,
        stock: updateBody.stock,
        tags: updateBody.tags,
      }),
    ).resolves.toBe(true);

    expect(requests[2]!.method).toBe("POST");
    expect(requests[2]!.url).toBe(
      "https://example.test/marketplace/products/prod_123/buy",
    );
    expect(requests[2]!.headers.get("X-Agent-ID")).toBe("@buyer");
    await expect(requests[2]!.json()).resolves.toMatchObject({
      buyer: "@buyer",
      buyerCryptoId: signer.agentId,
    });

    expect(requests[3]!.method).toBe("DELETE");
    const deleteUrl = new URL(requests[3]!.url);
    const deleteSignature = deleteUrl.searchParams.get("signature");
    expect(deleteUrl.origin + deleteUrl.pathname).toBe(
      "https://example.test/marketplace/products/prod_123",
    );
    expect(requests[3]!.headers.get("X-TinyPlace-Signature")).toBeNull();
    expect(deleteSignature).toBeTruthy();
    await expect(
      verifySignature(signer, deleteSignature!, "marketplace.product.delete", {
        productId: "prod_123",
      }),
    ).resolves.toBe(true);
  });

  it("signs product delivery reads and fulfillment as the delivery actor", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(15));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.includes("/download/")) {
          return new Response("download-content");
        }
        return Response.json({
          productId: "prod_123",
          purchaseId: "buy_123",
          status: "ready",
        });
      },
    });

    await client.marketplace.downloadProduct("prod_123", "buy_123", "@buyer");
    await client.marketplace.getProductDelivery(
      "prod_123",
      "buy_123",
      "@buyer",
    );
    await client.marketplace.updateProductDelivery("prod_123", "buy_123", {
      actor: "@seller",
      description: "Delivered",
      refs: ["artifact_123"],
    });

    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "GET",
      "POST",
    ]);
    expect(requests.map((request) => request.url)).toEqual([
      "https://example.test/marketplace/products/prod_123/download/buy_123",
      "https://example.test/marketplace/products/prod_123/purchases/buy_123/delivery",
      "https://example.test/marketplace/products/prod_123/purchases/buy_123/delivery",
    ]);
    expect(requests.map((request) => request.headers.get("X-Agent-ID"))).toEqual(
      ["@buyer", "@buyer", "@seller"],
    );

    for (const request of requests) {
      expect(request.headers.get("X-TinyPlace-Public-Key")).toBe(
        signer.publicKeyBase64,
      );
      expect(request.headers.get("X-TinyPlace-Signature")).toBeTruthy();
      expect(request.headers.get("Authorization")).toBeNull();
    }

    await expect(requests[2]!.json()).resolves.toEqual({
      actor: "@seller",
      description: "Delivered",
      refs: ["artifact_123"],
    });
  });

  it("signs identity listing, purchase, and bid payloads", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(12));
    const requests: Array<Request> = [];
    const price = { amount: "10", asset: "USDC", network: "eip155:8453" };
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });

    await client.marketplace.createIdentityListing({
      name: "@seller",
      seller: "@seller",
      sellerCryptoId: signer.agentId,
      description: "Handle for sale",
      tags: ["agent"],
      price,
      listingType: "fixed",
    });
    await client.marketplace.buyIdentityListing("listing_123", {
      buyer: "@buyer",
      buyerCryptoId: signer.agentId,
      buyerPublicKey: signer.publicKeyBase64,
      payment: { signature: "payment-signature" },
    });
    await client.marketplace.placeBid("listing_auction", {
      bidder: "@bidder",
      bidderCryptoId: signer.agentId,
      bidderPublicKey: signer.publicKeyBase64,
      price,
      payment: { signature: "payment-signature" },
    });

    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@seller");
    expect(requests[1]!.headers.get("X-Agent-ID")).toBe("@buyer");
    expect(requests[2]!.headers.get("X-Agent-ID")).toBe("@bidder");

    const listingBody = (await requests[0]!.json()) as {
      description: string;
      listingId: string;
      listingType: string;
      name: string;
      price: typeof price;
      seller: string;
      sellerCryptoId: string;
      tags: Array<string>;
      signature: string;
    };
    expect(listingBody.listingId).toMatch(/^listing_/);
    await expect(
      verifySignature(
        signer,
        listingBody.signature,
        "marketplace.identity.listing",
        {
          description: listingBody.description,
          listingId: listingBody.listingId,
          listingType: listingBody.listingType,
          name: listingBody.name,
          price: listingBody.price,
          seller: listingBody.seller,
          sellerCryptoId: listingBody.sellerCryptoId,
          tags: listingBody.tags,
        },
      ),
    ).resolves.toBe(true);

    const buyBody = (await requests[1]!.json()) as {
      buyer: string;
      buyerCryptoId: string;
      buyerPublicKey: string;
      signature: string;
    };
    await expect(
      verifySignature(signer, buyBody.signature, "marketplace.identity.buy", {
        buyer: buyBody.buyer,
        buyerCryptoId: buyBody.buyerCryptoId,
        buyerPublicKey: buyBody.buyerPublicKey,
        listingId: "listing_123",
      }),
    ).resolves.toBe(true);

    const bidBody = (await requests[2]!.json()) as {
      bidId: string;
      bidder: string;
      bidderCryptoId: string;
      bidderPublicKey: string;
      listingId: string;
      price: typeof price;
      signature: string;
    };
    expect(bidBody.bidId).toMatch(/^bid_/);
    await expect(
      verifySignature(signer, bidBody.signature, "marketplace.identity.bid", {
        bidId: bidBody.bidId,
        bidder: bidBody.bidder,
        bidderCryptoId: bidBody.bidderCryptoId,
        bidderPublicKey: bidBody.bidderPublicKey,
        listingId: bidBody.listingId,
        price: bidBody.price,
      }),
    ).resolves.toBe(true);
  });

  it("signs identity offers and offer lifecycle requests", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(13));
    const requests: Array<Request> = [];
    const price = { amount: "12", asset: "USDC", network: "eip155:8453" };
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({});
      },
    });

    await client.marketplace.createOffer({
      listingId: "listing_123",
      name: "@seller",
      buyer: "@buyer",
      buyerCryptoId: signer.agentId,
      buyerPublicKey: signer.publicKeyBase64,
      price,
      payment: { signature: "payment-signature" },
    });
    await client.marketplace.cancelOffer("offer_123");
    await client.marketplace.acceptOffer("offer_123", { seller: "@seller" });

    expect(requests[0]!.headers.get("X-Agent-ID")).toBe("@buyer");
    expect(requests[2]!.headers.get("X-Agent-ID")).toBe("@seller");

    const offerBody = (await requests[0]!.json()) as {
      buyer: string;
      buyerCryptoId: string;
      buyerPublicKey: string;
      listingId: string;
      name: string;
      offerId: string;
      price: typeof price;
      signature: string;
    };
    expect(offerBody.offerId).toMatch(/^offer_/);
    await expect(
      verifySignature(
        signer,
        offerBody.signature,
        "marketplace.identity.offer",
        {
          buyer: offerBody.buyer,
          buyerCryptoId: offerBody.buyerCryptoId,
          buyerPublicKey: offerBody.buyerPublicKey,
          listingId: offerBody.listingId,
          name: offerBody.name,
          offerId: offerBody.offerId,
          price: offerBody.price,
        },
      ),
    ).resolves.toBe(true);

    const cancelUrl = new URL(requests[1]!.url);
    const cancelSignature = cancelUrl.searchParams.get("signature");
    expect(cancelSignature).toBeTruthy();
    await expect(
      verifySignature(
        signer,
        cancelSignature!,
        "marketplace.identity.offer.cancel",
        { offerId: "offer_123" },
      ),
    ).resolves.toBe(true);

    const acceptBody = (await requests[2]!.json()) as {
      seller: string;
      signature: string;
    };
    await expect(
      verifySignature(
        signer,
        acceptBody.signature,
        "marketplace.identity.offer.accept",
        { offerId: "offer_123", seller: acceptBody.seller },
      ),
    ).resolves.toBe(true);
  });
});
