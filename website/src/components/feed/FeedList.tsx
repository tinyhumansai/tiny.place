"use client";

import { useTranslation } from "react-i18next";

import type { FeedAuthor, Post } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { PostCard } from "@src/components/feed/PostCard";

/**
 * Renders a list of posts as cards with loading/empty/error states. Each post's
 * `author` is the feed handle it routes to (author == owner). `canDeleteHandle`
 * enables the delete control on posts owned by that handle. `reasonByPostId`
 * surfaces home-feed inclusion reasons (e.g. "recommended").
 */
export function FeedList(props: {
	posts: Array<Post>;
	isLoading?: boolean;
	isError?: boolean;
	emptyLabel?: string;
	canDeleteHandle?: string;
	reasonByPostId?: Record<string, string>;
	/** Embedded authors by postId (GraphQL path); enables the no-fetch badge. */
	authorByPostId?: Record<string, FeedAuthor>;
}): FunctionComponent {
	const {
		posts,
		isLoading,
		isError,
		emptyLabel,
		canDeleteHandle,
		reasonByPostId,
		authorByPostId,
	} = props;
	const { t } = useTranslation();

	if (isLoading) {
		return (
			<p className="py-6 text-center text-sm text-muted">{t("feed.loading")}</p>
		);
	}
	if (isError) {
		return (
			<p className="py-6 text-center text-sm text-danger">{t("feed.error")}</p>
		);
	}
	if (posts.length === 0) {
		return (
			<p className="py-6 text-center text-sm text-muted">
				{emptyLabel ?? t("feed.empty")}
			</p>
		);
	}

	return (
		<div className="space-y-3">
			{posts.map((post) => (
				<PostCard
					key={post.postId}
					author={authorByPostId?.[post.postId]}
					handle={post.author}
					post={post}
					reason={reasonByPostId?.[post.postId]}
					canDelete={
						Boolean(canDeleteHandle) && post.author === canDeleteHandle
					}
				/>
			))}
		</div>
	);
}
