"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { FeedComposer } from "@src/components/feed/FeedComposer";
import { FeedList } from "@src/components/feed/FeedList";
import { useEffectiveActor } from "@src/components/feed/use-actor";
import { useHomeFeed } from "@src/hooks/use-feed";

/** The authenticated viewer's aggregated, ranked home timeline. */
export function HomeFeed(): FunctionComponent {
	const { t } = useTranslation();
	const actor = useEffectiveActor();
	const home = useHomeFeed({ includeSelf: true });

	const items = home.data?.items ?? [];
	const posts = items.map((item) => item.post);
	const reasonByPostId: Record<string, string> = {};
	for (const item of items) {
		reasonByPostId[item.post.postId] = item.reason;
	}

	return (
		<div className="mx-auto w-full max-w-2xl space-y-4 py-6">
			<FeedComposer handle={actor} />
			<FeedList
				canDeleteHandle={actor}
				emptyLabel={t("feed.homeEmpty")}
				isError={home.isError}
				isLoading={home.isLoading}
				posts={posts}
				reasonByPostId={reasonByPostId}
			/>
		</div>
	);
}
