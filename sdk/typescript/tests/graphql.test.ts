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
});
