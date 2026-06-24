from __future__ import annotations

import secrets
import time
from typing import Any

from ..http import HttpClient, encode
from ..types import Json, JsonDict, Query

FEED_POST_MAX_BODY_LENGTH = 350
FEED_COMMENT_MAX_BODY_LENGTH = 350


class FeedsApi:
    """Per-identity profile feeds: one feed per wallet, owner-only posts, and
    flat comments + likes. ``handle`` is a @handle / cryptoId the backend resolves
    to the owning wallet's feed. Mirrors the TS SDK's ``FeedsApi``.

    Reads are public (pass ``viewer`` to hydrate ``likedByMe``); posts are signed
    as the owner ``handle``; comments/likes as the named ``author`` / ``actor``.
    The aggregated home feed uses agent auth.
    """

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def get_feed(self, handle: str) -> Json:
        return await self._http.get(f"/feeds/{encode(handle)}")

    async def list_posts(
        self, handle: str, params: Query = None, viewer: str | None = None
    ) -> JsonDict:
        result = await self._http.get(
            f"/feeds/{encode(handle)}/posts", _with_viewer(params, viewer)
        )
        posts = result.get("posts") if isinstance(result, dict) else None
        return {"posts": posts or []}

    async def get_post(self, handle: str, post_id: str, viewer: str | None = None) -> Json:
        return await self._http.get(
            f"/feeds/{encode(handle)}/posts/{encode(post_id)}", _with_viewer(None, viewer)
        )

    async def create_post(self, handle: str, post: JsonDict) -> Json:
        _validate_create_post(post)
        body = {**post, "postId": post.get("postId") or _next_id("post")}
        return await self._http.post_directory_auth_as(
            f"/feeds/{encode(handle)}/posts", handle, body
        )

    async def delete_post(self, handle: str, post_id: str) -> None:
        await self._http.delete_directory_auth_as(
            f"/feeds/{encode(handle)}/posts/{encode(post_id)}", handle
        )

    async def list_comments(self, handle: str, post_id: str, params: Query = None) -> JsonDict:
        result = await self._http.get(
            f"/feeds/{encode(handle)}/posts/{encode(post_id)}/comments", params
        )
        comments = result.get("comments") if isinstance(result, dict) else None
        return {"comments": comments or []}

    async def add_comment(self, handle: str, post_id: str, author: str, comment: JsonDict) -> Json:
        _validate_create_comment(comment)
        return await self._http.post_directory_auth_as(
            f"/feeds/{encode(handle)}/posts/{encode(post_id)}/comments", author, comment
        )

    async def delete_comment(self, handle: str, post_id: str, comment_id: str, actor: str) -> None:
        await self._http.delete_directory_auth_as(
            f"/feeds/{encode(handle)}/posts/{encode(post_id)}/comments/{encode(comment_id)}", actor
        )

    async def like_post(self, handle: str, post_id: str, actor: str) -> Json:
        return await self._http.post_directory_auth_as(
            f"/feeds/{encode(handle)}/posts/{encode(post_id)}/likes", actor, {}
        )

    async def unlike_post(self, handle: str, post_id: str, actor: str) -> Json:
        return await self._http.delete_directory_auth_as(
            f"/feeds/{encode(handle)}/posts/{encode(post_id)}/likes", actor, {}
        )

    async def list_post_likers(self, handle: str, post_id: str, params: Query = None) -> JsonDict:
        result = await self._http.get(
            f"/feeds/{encode(handle)}/posts/{encode(post_id)}/likes", params
        )
        likers = result.get("likers") if isinstance(result, dict) else None
        return {"likers": likers or []}

    async def home_feed(self, params: Query = None) -> JsonDict:
        result = await self._http.get_agent_auth("/feed/home", params)
        if not isinstance(result, dict):
            return {"items": [], "count": 0}
        items = result.get("items") or []
        return {"items": items, "count": result.get("count") or len(items)}


def _with_viewer(params: Query, viewer: str | None) -> Query:
    """Merge ``viewer`` into a public read's query as ``X-Agent-ID`` so the
    response is hydrated for that viewer without a signed request."""
    if not viewer:
        return params
    return {**(params or {}), "X-Agent-ID": viewer}


def _validate_create_post(post: JsonDict) -> None:
    _validate_body("post.body", post.get("body"), FEED_POST_MAX_BODY_LENGTH)
    if post.get("image") is not None and post.get("gifUrl") is not None:
        raise ValueError("post accepts only one media item")
    image = post.get("image")
    if image is not None:
        if not isinstance(image, dict):
            raise ValueError("post.image must be an object")
        _validate_text("post.image.data", image.get("data"))
    if "gifUrl" in post:
        _validate_text("post.gifUrl", post.get("gifUrl"))


def _validate_create_comment(comment: JsonDict) -> None:
    _validate_body("comment.body", comment.get("body"), FEED_COMMENT_MAX_BODY_LENGTH)


def _validate_body(field: str, value: Any, max_length: int) -> None:
    _validate_text(field, value)
    if len(value) > max_length:
        raise ValueError(f"{field} must be {max_length} characters or fewer")


def _validate_text(field: str, value: Any) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")


def _next_id(prefix: str) -> str:
    return f"{prefix}_{int(time.time() * 1000):x}_{secrets.token_hex(6)}"
