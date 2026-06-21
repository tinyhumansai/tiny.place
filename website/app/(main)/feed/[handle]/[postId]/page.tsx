import type { Metadata } from "next";

import { PostPermalink } from "@src/views/PostPermalink";
import { JsonLd } from "@src/components/seo/JsonLd";
import { fetchPost } from "@src/common/server-post";
import { ensureHandle } from "@src/common/server-profile";
import { stripHandle } from "@src/common/profile-link";
import { SITE_URL } from "@src/common/site";
import { postSchema } from "@src/common/structured-data";

// Posts are live data, so render per request rather than prerendering.
export const dynamic = "force-dynamic";

type PageProperties = {
	params: Promise<{ handle: string; postId: string }>;
};

/** Collapses whitespace and truncates a post body for titles/descriptions. */
function excerpt(body: string, max: number): string {
	const text = body.replace(/\s+/g, " ").trim();
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function postUrl(handle: string, postId: string): string {
	return `${SITE_URL}/feed/${encodeURIComponent(handle)}/${encodeURIComponent(
		postId
	)}`;
}

export async function generateMetadata({
	params,
}: PageProperties): Promise<Metadata> {
	const { handle, postId } = await params;
	const decodedHandle = decodeURIComponent(handle);
	const post = await fetchPost(decodedHandle, decodeURIComponent(postId));
	const canonical = postUrl(decodedHandle, decodeURIComponent(postId));
	// The author is identified by the handle in the URL; a post's `author` field
	// can be a raw cryptoId, so prefer the route handle for display.
	const handleLabel = ensureHandle(decodedHandle);
	if (!post || !post.body.trim()) {
		// Missing/unreachable/empty posts: keep the thin fallback out of the index
		// so we don't expose error permalinks.
		return {
			title: "Post",
			description: "A post and its discussion on tiny.place.",
			alternates: { canonical },
			robots: { index: false, follow: true },
		};
	}
	const description = excerpt(post.body, 160);
	return {
		title: `${handleLabel}: ${excerpt(post.body, 60)}`,
		description,
		alternates: { canonical },
		openGraph: {
			type: "article",
			title: `Post by ${handleLabel}`,
			description,
			url: canonical,
		},
		twitter: { card: "summary", title: `Post by ${handleLabel}`, description },
	};
}

export default async function Page({
	params,
}: PageProperties): Promise<React.ReactElement> {
	const { handle, postId } = await params;
	const decodedHandle = decodeURIComponent(handle);
	const decodedPostId = decodeURIComponent(postId);
	const post = await fetchPost(decodedHandle, decodedPostId);
	return (
		<>
			{post && post.body.trim() ? (
				<JsonLd
					data={postSchema({
						url: postUrl(decodedHandle, decodedPostId),
						body: post.body,
						authorName: ensureHandle(decodedHandle),
						authorUsername: decodedHandle,
						authorUrl: `${SITE_URL}/u/${encodeURIComponent(
							stripHandle(decodedHandle)
						)}`,
						datePublished: post.createdAt,
					})}
				/>
			) : null}
			<PostPermalink handle={decodedHandle} postId={decodedPostId} />
		</>
	);
}
