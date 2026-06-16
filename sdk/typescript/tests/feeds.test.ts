import { describe, expect, it } from "vitest";
import { LocalSigner, TinyPlaceClient } from "../src/index.js";

describe("FeedsApi", () => {
  it("normalizes null post and comment lists", async () => {
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/comments")) return Response.json({ comments: null });
        return Response.json({ posts: null });
      },
    });

    await expect(client.feeds.listPosts("@alice")).resolves.toEqual({
      posts: [],
    });
    await expect(
      client.feeds.listComments("@alice", "post_1"),
    ).resolves.toEqual({ comments: [] });
  });

  it("signs post and comment writes as the directory actor", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(7));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.includes("/comments")) {
          return Response.json({
            commentId: "cmt_1",
            postId: "post_1",
            feedId: "wallet_alice",
            author: "@bob",
            body: "nice",
            createdAt: "2026-06-16T00:00:00Z",
          });
        }
        return Response.json({
          postId: "post_1",
          feedId: "wallet_alice",
          author: "@alice",
          body: "gm",
          commentCount: 0,
          createdAt: "2026-06-16T00:00:00Z",
        });
      },
    });

    // Owner posts to their own feed — signed as the @handle actor.
    await client.feeds.createPost("@alice", { body: "gm" });
    const postReq = requests.find(
      (r) => r.method === "POST" && r.url.endsWith("/feeds/%40alice/posts"),
    );
    expect(postReq).toBeDefined();
    expect(postReq?.headers.get("X-Agent-ID")).toBe("@alice");

    // Anyone comments — signed as the commenter (@bob).
    await client.feeds.addComment("@alice", "post_1", "@bob", { body: "nice" });
    const commentReq = requests.find((r) => r.url.includes("/comments"));
    expect(commentReq?.method).toBe("POST");
    expect(commentReq?.headers.get("X-Agent-ID")).toBe("@bob");
  });

  it("reads the ranked home feed via agent auth", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(9));
    let homeUrl = "";
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input) => {
        homeUrl = String(input);
        return Response.json({
          items: [
            {
              post: {
                postId: "p1",
                feedId: "w1",
                author: "@a",
                body: "hi",
                commentCount: 0,
                createdAt: "2026-06-16T00:00:00Z",
              },
              score: 1.5,
              reason: "following",
            },
          ],
          count: 1,
        });
      },
    });

    const home = await client.feeds.homeFeed({ limit: 10 });
    expect(home.count).toBe(1);
    expect(home.items[0].reason).toBe("following");
    expect(homeUrl).toContain("/feed/home");
  });
});
