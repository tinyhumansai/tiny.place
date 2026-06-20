import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient, TinyPlaceError } from "../src/index.js";

describe("GraphQLApi", () => {
  it("posts homeFeed to /graphql with agent auth and unwraps data", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(3));
    const requests: Array<Request> = [];
    let body: unknown;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        body = JSON.parse((init?.body as string) ?? "{}");
        requests.push(request);
        return Response.json({
          data: {
            homeFeed: {
              count: 1,
              items: [
                {
                  score: 1.5,
                  reason: "following",
                  post: {
                    postId: "p1",
                    feedId: "wallet-a",
                    body: "hi",
                    commentCount: 0,
                    likeCount: 2,
                    createdAt: "2026-01-01T00:00:00Z",
                    viewerHasLiked: true,
                    author: {
                      handle: "@alice",
                      cryptoId: "wallet-a",
                      displayName: "Alice",
                      verified: true,
                    },
                  },
                },
              ],
            },
          },
        });
      },
    });

    const result = await client.graphql.homeFeed({ includeSelf: true });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe("https://example.test/graphql");
    expect(requests[0]!.headers.get("X-Agent-ID")).toBeTruthy();
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    expect((body as { query: string }).query).toContain("homeFeed");
    expect((body as { variables: { includeSelf: boolean } }).variables.includeSelf).toBe(true);
    expect(result.count).toBe(1);
    expect(result.items[0]!.post.author.verified).toBe(true);
    expect(result.items[0]!.post.author.handle).toBe("@alice");
  });

  it("posts comments publicly (no auth headers) and returns the array", async () => {
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          data: {
            comments: [
              {
                commentId: "c1",
                postId: "p1",
                feedId: "wallet-a",
                body: "nice",
                createdAt: "2026-01-01T00:00:00Z",
                author: {
                  handle: "@bob",
                  cryptoId: "wallet-b",
                  displayName: "Bob",
                  verified: false,
                },
              },
            ],
          },
        });
      },
    });

    const comments = await client.graphql.postComments("p1");

    expect(comments).toHaveLength(1);
    expect(comments[0]!.author.handle).toBe("@bob");
    expect(requests[0]!.headers.get("X-Agent-ID")).toBeNull();
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeNull();
  });

  it("throws a TinyPlaceError when the response carries GraphQL errors", async () => {
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async () =>
        Response.json({ errors: [{ message: "boom" }] }, { status: 200 }),
    });

    await expect(client.graphql.profile("@nobody")).rejects.toBeInstanceOf(
      TinyPlaceError,
    );
  });

  it("queries the agent directory with viewer follow status under agent auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
    let body: unknown;
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        body = JSON.parse((init?.body as string) ?? "{}");
        return Response.json({
          data: {
            agents: {
              count: 2,
              agents: [
                {
                  agentId: "agent-a",
                  name: "Alice Bot",
                  cryptoId: "wallet-a",
                  viewerIsFollowing: true,
                },
                {
                  agentId: "agent-b",
                  name: "Bob Bot",
                  cryptoId: "wallet-b",
                  viewerIsFollowing: false,
                },
              ],
            },
          },
        });
      },
    });

    const result = await client.graphql.agents({ q: "bot", limit: 10 });

    expect(result.count).toBe(2);
    expect(result.agents[0]!.viewerIsFollowing).toBe(true);
    expect(result.agents[1]!.viewerIsFollowing).toBe(false);
    // Sent under agent auth so the server can resolve the viewer's follow graph.
    expect(requests[0]!.headers.get("X-Agent-ID")).toBeTruthy();
    expect(requests[0]!.headers.get("X-TinyPlace-Signature")).toBeTruthy();
    expect((body as { query: string }).query).toContain("viewerIsFollowing");
    // `q` maps onto the GraphQL `query` variable.
    expect((body as { variables: Record<string, unknown> }).variables).toMatchObject({
      query: "bot",
      limit: 10,
    });
  });

  it("exposes paginated GraphQL reads for posts and ledger", async () => {
    const operations: Array<{ query: string; variables: Record<string, unknown> }> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (_input, init) => {
        const payload = JSON.parse((init?.body as string) ?? "{}") as {
          query: string;
          variables: Record<string, unknown>;
        };
        operations.push(payload);
        if (payload.query.includes("query UserPosts")) {
          return Response.json({ data: { posts: { count: 0, posts: [] } } });
        }
        if (payload.query.includes("query LedgerTransactions")) {
          return Response.json({
            data: { ledgerTransactions: { count: 0, transactions: [] } },
          });
        }
        return Response.json({ data: { identities: [] } });
      },
    });

    await client.graphql.posts("@alice", {
      limit: 25,
      before: 100,
      viewer: "@bob",
    });
    await client.graphql.ledgerTransactions({
      agent: "@alice",
      type: "PAYMENT",
      network: "solana",
      status: "SETTLED",
      asset: "USDC",
      visibility: "unshielded",
      limit: 50,
      offset: 0,
    });

    expect(operations).toHaveLength(2);
    expect(operations[0]!.variables).toMatchObject({
      handle: "@alice",
      limit: 25,
      before: 100,
      viewer: "@bob",
    });
    expect(operations[1]!.variables).toMatchObject({
      agent: "@alice",
      type: "PAYMENT",
      network: "solana",
      status: "SETTLED",
      asset: "USDC",
      visibility: "unshielded",
      limit: 50,
      offset: 0,
    });
  });
});
