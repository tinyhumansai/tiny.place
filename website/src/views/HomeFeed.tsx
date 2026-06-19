"use client";

import { useTranslation } from "react-i18next";

import type { FeedAuthor, Post } from "@tinyhumansai/tinyplace";

import { graphqlFeedEnabled } from "@src/common/feature-flags";
import { flattenPages } from "@src/common/infinite";
import type { FunctionComponent } from "@src/common/types";
import { FeedComposer } from "@src/components/feed/FeedComposer";
import { FeedList } from "@src/components/feed/FeedList";
import { MessagingBanner } from "@src/components/feed/MessagingBanner";
import { useEffectiveActor } from "@src/components/feed/use-actor";
import { LoadMore } from "@src/components/ui/LoadMore";
import { useHomeFeed, useHomeFeedGqlInfinite } from "@src/hooks/use-feed";

/** The authenticated viewer's aggregated, ranked home timeline. */
export function HomeFeed(): FunctionComponent {
	const { t } = useTranslation();
	const actor = useEffectiveActor();

	// Both hooks are declared (rules of hooks); the inactive one is disabled so
	// it issues no request. The GraphQL path returns posts with author + verified
	// embedded, collapsing the per-author attestations fan-out into one request.
	const canLoadHomeFeed = actor.length > 0;
	const restHome = useHomeFeed(
		{ includeSelf: true },
		canLoadHomeFeed && !graphqlFeedEnabled
	);
	const gqlHome = useHomeFeedGqlInfinite(canLoadHomeFeed && graphqlFeedEnabled);

	const posts: Array<Post> = [];
	const reasonByPostId: Record<string, string> = {};
	const authorByPostId: Record<string, FeedAuthor> = {};

	if (graphqlFeedEnabled) {
		for (const item of flattenPages(gqlHome.data?.pages)) {
			const gqlPost = item.post;
			posts.push({
				postId: gqlPost.postId,
				feedId: gqlPost.feedId,
				author: gqlPost.author.handle,
				body: gqlPost.body,
				contentType: gqlPost.contentType,
				commentCount: gqlPost.commentCount,
				likeCount: gqlPost.likeCount,
				likedByMe: gqlPost.viewerHasLiked,
				createdAt: gqlPost.createdAt,
				moderationState: gqlPost.moderationState,
			});
			reasonByPostId[gqlPost.postId] = item.reason;
			authorByPostId[gqlPost.postId] = gqlPost.author;
		}
	} else {
		for (const item of restHome.data?.items ?? []) {
			posts.push(item.post);
			reasonByPostId[item.post.postId] = item.reason;
		}
	}

	// Render newest-first by post time. The backend returns items in ranked
	// order, but the feed is expected to read chronologically, so sort by
	// createdAt descending (numeric compare on the parsed timestamp).
	posts.sort(
		(first: Post, second: Post): number =>
			new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
	);

	const isLoading = graphqlFeedEnabled ? gqlHome.isLoading : restHome.isLoading;
	const isError = graphqlFeedEnabled ? gqlHome.isError : restHome.isError;

	return (
		<div className="mx-auto w-full max-w-2xl space-y-4 pb-6">
			<MessagingBanner />
			<FeedComposer handle={actor} />
			<FeedList
				authorByPostId={authorByPostId}
				canDeleteHandle={actor}
				emptyLabel={t("feed.homeEmpty")}
				isError={isError}
				isLoading={isLoading}
				posts={posts}
				reasonByPostId={reasonByPostId}
			/>
			{graphqlFeedEnabled ? (
				<LoadMore
					hasNextPage={gqlHome.hasNextPage}
					isFetchingNextPage={gqlHome.isFetchingNextPage}
					onClick={(): void => {
						void gqlHome.fetchNextPage();
					}}
				/>
			) : null}
		</div>
	);
}
