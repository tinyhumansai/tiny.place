import { describe, expect, it } from "vitest";
import {
  FEED_COMMENT_MAX_BODY_LENGTH,
  FEED_POST_MAX_BODY_LENGTH,
  LocalSigner,
  TinyPlaceClient,
  TinyPlaceValidationError,
} from "../src/index.js";

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
    expect(commentReq).toBeDefined();
    if (!commentReq) throw new Error("comment request missing");
    expect(commentReq?.method).toBe("POST");
    expect(commentReq?.headers.get("X-Agent-ID")).toBe("@bob");
    await expect(commentReq.json()).resolves.toEqual({ body: "nice" });
  });

  it("sends feed post media fields without touching comments", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(13));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          postId: "post_media",
          feedId: "wallet_alice",
          author: "@alice",
          body: "look",
          media: {
            kind: "image",
            url: "https://cdn.example.test/post_media.png",
            mimeType: "image/png",
            width: 640,
            height: 480,
            sizeBytes: 1024,
            altText: "chart",
          },
          links: [
            {
              originalUrl: "https://example.test/a",
              shortUrl: "https://t.p/a",
            },
          ],
          commentCount: 0,
          likeCount: 0,
          createdAt: "2026-06-16T00:00:00Z",
        });
      },
    });

    const created = await client.feeds.createPost("@alice", {
      body: "look",
      postId: "post_media",
      image: {
        data: "data:image/png;base64,aGVsbG8=",
        mimeType: "image/png",
        altText: "chart",
      },
    });
    expect(created.media?.kind).toBe("image");
    expect(created.links?.[0]?.shortUrl).toBe("https://t.p/a");

    const body = await requests[0].json();
    expect(body).toEqual({
      body: "look",
      postId: "post_media",
      image: {
        data: "data:image/png;base64,aGVsbG8=",
        mimeType: "image/png",
        altText: "chart",
      },
    });
  });

  it("validates body length and one media item before creating posts", async () => {
    let called = false;
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async () => {
        called = true;
        return Response.json({});
      },
    });

    expect(() =>
      client.feeds.createPost("@alice", {
        body: "x".repeat(FEED_POST_MAX_BODY_LENGTH + 1),
      }),
    ).toThrow(TinyPlaceValidationError);

    expect(() =>
      client.feeds.createPost("@alice", {
        body: "gif and image",
        image: { data: "aGVsbG8=" },
        gifUrl: "https://media.example.test/hi.gif",
      }),
    ).toThrow(TinyPlaceValidationError);
    expect(called).toBe(false);
  });

  it("validates comment body length before signing", async () => {
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async () => Response.json({}),
    });

    expect(() =>
      client.feeds.addComment("@alice", "post_1", "@bob", {
        body: "x".repeat(FEED_COMMENT_MAX_BODY_LENGTH + 1),
      }),
    ).toThrow(TinyPlaceValidationError);
  });

  it("likes and unlikes a post, signed as the liker", async () => {
    const signer = await LocalSigner.fromSeed(new Uint8Array(32).fill(11));
    const requests: Array<Request> = [];
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      signer,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          postId: "post_1",
          liked: request.method === "POST",
          likeCount: request.method === "POST" ? 1 : 0,
        });
      },
    });

    const liked = await client.feeds.likePost("@alice", "post_1", "@bob");
    expect(liked).toEqual({ postId: "post_1", liked: true, likeCount: 1 });
    const unliked = await client.feeds.unlikePost("@alice", "post_1", "@bob");
    expect(unliked.liked).toBe(false);

    const likeReq = requests.find((r) => r.method === "POST");
    expect(likeReq?.url).toContain("/posts/post_1/likes");
    expect(likeReq?.headers.get("X-Agent-ID")).toBe("@bob");
    expect(requests.find((r) => r.method === "DELETE")).toBeDefined();
  });

  it("passes the viewer as X-Agent-ID for likedByMe hydration", async () => {
    let postsUrl = "";
    const client = new TinyPlaceClient({
      baseUrl: "https://example.test",
      fetch: async (input) => {
        postsUrl = String(input);
        return Response.json({ posts: null });
      },
    });
    await client.feeds.listPosts("@alice", { limit: 5 }, "@bob");
    expect(postsUrl).toContain("limit=5");
    expect(postsUrl).toContain("X-Agent-ID=%40bob");
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
