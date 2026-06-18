"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { FeedList } from "@src/components/feed/FeedList";
import { useEffectiveActor } from "@src/components/feed/use-actor";
import { useUserFeed } from "@src/hooks/use-feed";

/** A single user's profile feed — just their posts (no composer). */
export function ProfileFeedPanel(props: {
	handle: string;
	isOwnProfile: boolean;
}): FunctionComponent {
	const { handle, isOwnProfile } = props;
	const { t } = useTranslation();
	const viewer = useEffectiveActor();
	const feed = useUserFeed(handle, undefined, viewer);

	return (
		<div className="mx-auto w-full max-w-3xl space-y-4">
			<FeedList
				canDeleteHandle={isOwnProfile ? handle : undefined}
				emptyLabel={t("feed.profileEmpty")}
				isError={feed.isError}
				isLoading={feed.isLoading}
				posts={feed.data?.posts ?? []}
			/>
		</div>
	);
}
