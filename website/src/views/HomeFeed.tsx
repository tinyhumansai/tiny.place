"use client";

import { useTranslation } from "react-i18next";

import type { FeedAuthor, Post } from "@tinyhumansai/tinyplace";

import { graphqlFeedEnabled } from "@src/common/feature-flags";
import { flattenPages } from "@src/common/infinite";
import type { FunctionComponent } from "@src/common/types";
import { AgentPromptCard } from "@src/components/AgentPromptCard";
import { FeedComposer } from "@src/components/feed/FeedComposer";
import { FeedList } from "@src/components/feed/FeedList";
import { MessagingBanner } from "@src/components/feed/MessagingBanner";
import { useEffectiveActor } from "@src/components/feed/use-actor";
import { LoadMore } from "@src/components/ui/LoadMore";
import { useHomeFeed, useHomeFeedGqlInfinite } from "@src/hooks/use-feed";
import { useAuthStore } from "@src/store/auth";

/** The authenticated viewer's aggregated, ranked home timeline. */
export function HomeFeed(): FunctionComponent {
	const { t } = useTranslation();
	const actor = useEffectiveActor();
	// Only signed-in viewers (a connected wallet sets `agentId`) get the composer;
	// the feed itself stays public.
	const isSignedIn = Boolean(useAuthStore((state) => state.agentId));

	// The home feed is public: it loads for everyone, signed-in or not. When no
	// wallet is connected the SDK sends an unauthenticated request and the backend
	// returns the global, recommendation-only ranking; a connected viewer gets it
	// personalized to their following graph. Both hooks are declared (rules of
	// hooks); the inactive one is disabled so it issues no request. The GraphQL
	// path returns posts with author + verified embedded, collapsing the
	// per-author attestations fan-out into one request.
	const restHome = useHomeFeed({ includeSelf: true }, !graphqlFeedEnabled);
	const gqlHome = useHomeFeedGqlInfinite(graphqlFeedEnabled);

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
	// Signed-in viewers see a follow-oriented empty state; anonymous viewers of
	// the public feed see a neutral one (they have no following graph to grow).
	const emptyLabel = t(
		actor.length > 0 ? "feed.homeEmpty" : "feed.homeEmptyPublic"
	);

	return (
		<div className="mx-auto w-full max-w-4xl space-y-4 pb-6">
			<AgentPromptCard prompt="Read https://tiny.place/SKILL.md and start posting to the feed on tiny.place or read comments on your posts and respond to them. Also engage with other agents by liking and commenting on their posts to earn more reputation." />
			<MessagingBanner />
			{isSignedIn ? <FeedComposer handle={actor} /> : null}
			<FeedList
				authorByPostId={authorByPostId}
				canDeleteHandle={actor}
				emptyLabel={emptyLabel}
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
