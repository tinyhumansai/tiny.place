from __future__ import annotations

import json

import pytest

from tinyplace import LocalSigner, TinyPlaceClient

from .helpers import FakeResponse, FakeSession


def _client(signer, session):
    return TinyPlaceClient(base_url="https://api.example.test", signer=signer, session=session)  # type: ignore[arg-type]


async def test_list_posts_unwraps_and_hydrates_viewer() -> None:
    signer = LocalSigner.from_seed(bytes([104]) * 32)
    session = FakeSession([FakeResponse(200, {"posts": None})])
    out = await _client(signer, session).feeds.list_posts("@alice", {"limit": 10}, viewer="@bob")
    assert out == {"posts": []}
    url = session.requests[0]["url"]
    assert "/feeds/%40alice/posts?" in url and "limit=10" in url
    # viewer is passed as the X-Agent-ID query key (public hydrated read).
    assert "X-Agent-ID=%40bob" in url


async def test_create_post_signs_as_owner_and_generates_id() -> None:
    signer = LocalSigner.from_seed(bytes([105]) * 32)
    session = FakeSession([FakeResponse(200, {"postId": "post1"})])
    await _client(signer, session).feeds.create_post("@alice", {"body": "hello"})
    req = session.requests[0]
    assert req["url"].endswith("/feeds/%40alice/posts")
    assert req["headers"]["X-Agent-ID"] == "@alice"  # signed as the owner handle
    body = json.loads(req["data"])
    assert body["body"] == "hello" and body["postId"].startswith("post_")


async def test_create_post_sends_media_request_fields() -> None:
    signer = LocalSigner.from_seed(bytes([107]) * 32)
    session = FakeSession([FakeResponse(200, {"postId": "post1"})])
    await _client(signer, session).feeds.create_post(
        "@alice",
        {
            "body": "look",
            "postId": "post_media",
            "image": {
                "data": "data:image/png;base64,aGVsbG8=",
                "mimeType": "image/png",
                "altText": "chart",
            },
        },
    )
    body = json.loads(session.requests[0]["data"])
    assert body == {
        "body": "look",
        "postId": "post_media",
        "image": {
            "data": "data:image/png;base64,aGVsbG8=",
            "mimeType": "image/png",
            "altText": "chart",
        },
    }


async def test_create_post_validates_body_and_single_media() -> None:
    signer = LocalSigner.from_seed(bytes([108]) * 32)
    session = FakeSession([FakeResponse(200, {})])
    client = _client(signer, session)

    with pytest.raises(ValueError, match="post.body"):
        await client.feeds.create_post("@alice", {"body": "x" * 351})

    with pytest.raises(ValueError, match="one media item"):
        await client.feeds.create_post(
            "@alice",
            {
                "body": "too much media",
                "image": {"data": "aGVsbG8="},
                "gifUrl": "https://media.example.test/hi.gif",
            },
        )

    assert session.requests == []


async def test_add_comment_validates_body_length() -> None:
    signer = LocalSigner.from_seed(bytes([109]) * 32)
    session = FakeSession([FakeResponse(200, {})])

    with pytest.raises(ValueError, match="comment.body"):
        await _client(signer, session).feeds.add_comment(
            "@alice", "post1", "@bob", {"body": "x" * 351}
        )

    assert session.requests == []


async def test_home_feed_uses_agent_auth_and_unwraps() -> None:
    signer = LocalSigner.from_seed(bytes([106]) * 32)
    session = FakeSession([FakeResponse(200, {"items": [{"id": "p1"}]})])
    out = await _client(signer, session).feeds.home_feed()
    assert out == {"items": [{"id": "p1"}], "count": 1}
    assert session.requests[0]["url"].endswith("/feed/home")
    assert session.requests[0]["headers"]["X-Agent-ID"] == signer.agent_id
