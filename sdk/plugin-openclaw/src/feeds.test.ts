import assert from "node:assert/strict";
import test from "node:test";

import type { LocalSigner, TinyPlaceClient } from "@tinyhumansai/tinyplace";

import {
  commentOnPost,
  homeFeed,
  postToWall,
  readWall,
  resolveOwnHandle,
  setLike,
} from "./feeds.js";

const CRYPTO_ID = "4S3656ssvbVpaD9yGMtwVj3e7qMZNuSSxuQuhXKccrQj";
const HANDLE = "@openclawtest";

const signer = { agentId: CRYPTO_ID } as unknown as LocalSigner;

/** A mock client whose directory.reverse yields one active handle. */
function clientWith(overrides: Record<string, unknown>): TinyPlaceClient {
  return {
    directory: {
      reverse: (): Promise<unknown> =>
        Promise.resolve({
          identities: [
            { username: HANDLE, status: "active", expiresAt: "2027-01-01" },
          ],
        }),
    },
    ...overrides,
  } as unknown as TinyPlaceClient;
}

test("resolveOwnHandle returns the active handle", async () => {
  const handle = await resolveOwnHandle(clientWith({}), signer);
  assert.equal(handle, HANDLE);
});

test("resolveOwnHandle honors the --as override and skips the directory", async () => {
  const client = {
    directory: {
      reverse: (): never => {
        throw new Error("should not resolve when override is given");
      },
    },
  } as unknown as TinyPlaceClient;
  assert.equal(await resolveOwnHandle(client, signer, "iris"), "@iris");
});

test("resolveOwnHandle throws when the agent owns no handle", async () => {
  const client = {
    directory: { reverse: (): Promise<unknown> => Promise.resolve({ identities: [] }) },
  } as unknown as TinyPlaceClient;
  await assert.rejects(() => resolveOwnHandle(client, signer), /owns no @handle/);
});

test("postToWall signs as the agent's own handle, not its cryptoId", async () => {
  let createdWith = "";
  const client = clientWith({
    feeds: {
      createPost: (handle: string): Promise<unknown> => {
        createdWith = handle;
        return Promise.resolve({
          postId: "post_1",
          author: handle,
          body: "hello",
          likeCount: 0,
          commentCount: 0,
          createdAt: "now",
        });
      },
    },
  });
  const post = await postToWall(client, signer, "hello");
  assert.equal(createdWith, HANDLE);
  assert.notEqual(createdWith, CRYPTO_ID);
  assert.equal(post.author, HANDLE);
});

test("setLike(true) likes the post on a target wall, signed as the agent", async () => {
  let calledWall = "";
  let calledActor = "";
  const client = clientWith({
    feeds: {
      likePost: (wall: string, _postId: string, actor: string): Promise<unknown> => {
        calledWall = wall;
        calledActor = actor;
        return Promise.resolve({ postId: "post_1", liked: true, likeCount: 1 });
      },
    },
  });
  const result = await setLike(client, signer, "post_1", true, { handle: "@hermes7421" });
  assert.equal(calledWall, "@hermes7421");
  assert.equal(calledActor, HANDLE);
  assert.deepEqual(result, { postId: "post_1", liked: true, likeCount: 1 });
});

test("setLike passes a base58 cryptoId wall target through untouched", async () => {
  let calledWall = "";
  const client = clientWith({
    feeds: {
      likePost: (wall: string): Promise<unknown> => {
        calledWall = wall;
        return Promise.resolve({ postId: "post_1", liked: true, likeCount: 1 });
      },
    },
  });
  // A wallet crypto ID is a valid /feeds/{handle} target; it must NOT be
  // rewritten to @<cryptoId>.
  await setLike(client, signer, "post_1", true, { handle: CRYPTO_ID });
  assert.equal(calledWall, CRYPTO_ID);
});

test("setLike(false) calls unlikePost", async () => {
  let unliked = false;
  const client = clientWith({
    feeds: {
      unlikePost: (): Promise<unknown> => {
        unliked = true;
        return Promise.resolve({ postId: "post_1", liked: false, likeCount: 0 });
      },
    },
  });
  const result = await setLike(client, signer, "post_1", false);
  assert.equal(unliked, true);
  assert.equal(result.liked, false);
});

test("readWall passes the agent's cryptoId as viewer and surfaces likedByMe", async () => {
  let viewerSeen = "";
  const client = clientWith({
    feeds: {
      listPosts: (_handle: string, _params: unknown, viewer: string): Promise<unknown> => {
        viewerSeen = viewer;
        return Promise.resolve({
          posts: [
            {
              postId: "post_1",
              author: HANDLE,
              body: "hi",
              likeCount: 3,
              likedByMe: true,
              commentCount: 1,
              createdAt: "now",
            },
          ],
        });
      },
    },
  });
  const posts = await readWall(client, signer);
  assert.equal(viewerSeen, CRYPTO_ID);
  assert.equal(posts[0]?.likedByMe, true);
  assert.equal(posts[0]?.likeCount, 3);
});

test("commentOnPost signs the comment as the agent's own handle", async () => {
  let authorSeen = "";
  const client = clientWith({
    feeds: {
      addComment: (
        _handle: string,
        _postId: string,
        author: string,
      ): Promise<unknown> => {
        authorSeen = author;
        return Promise.resolve({
          commentId: "cmt_1",
          author,
          body: "nice",
          createdAt: "now",
        });
      },
    },
  });
  const comment = await commentOnPost(client, signer, "post_1", "nice", {
    handle: "@hermes7421",
  });
  assert.equal(authorSeen, HANDLE);
  assert.equal(comment.commentId, "cmt_1");
});

test("homeFeed flattens items into post views with reason + score", async () => {
  const client = clientWith({
    feeds: {
      homeFeed: (): Promise<unknown> =>
        Promise.resolve({
          items: [
            {
              post: {
                postId: "post_9",
                author: "@hermes7421",
                body: "gm",
                likeCount: 5,
                likedByMe: false,
                commentCount: 2,
                createdAt: "now",
              },
              score: 0.9,
              reason: "following",
            },
          ],
          count: 1,
        }),
    },
  });
  const items = await homeFeed(client, signer);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.author, "@hermes7421");
  assert.equal(items[0]?.reason, "following");
  assert.equal(items[0]?.likeCount, 5);
});
