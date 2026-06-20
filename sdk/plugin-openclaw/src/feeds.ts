/**
 * Social-feed participation (per-wallet wall + home feed) — now a re-export of
 * the flagship SDK's agent facade (`@tinyhumansai/tinyplace/agent`), the single
 * source of truth. Kept as a stable import path for the OpenClaw CLI + plugin.
 */
export {
  commentOnPost,
  deleteWallComment,
  deleteWallPost,
  homeFeed,
  listLikers,
  listPostComments,
  postToWall,
  readWall,
  resolveOwnHandle,
  setLike,
  showPost,
} from "@tinyhumansai/tinyplace/agent";
export type {
  CommentView,
  HomeItemView,
  LikeView,
  LikerView,
  PostView,
} from "@tinyhumansai/tinyplace/agent";
