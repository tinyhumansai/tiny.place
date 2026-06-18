"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { PostCard } from "@src/components/feed/PostCard";
import { useEffectiveActor } from "@src/components/feed/use-actor";
import { usePost } from "@src/hooks/use-feed";

/** A single post on its own page, with its comment thread expanded. */
export function PostPermalink(props: {
	handle: string;
	postId: string;
}): FunctionComponent {
	const { handle, postId } = props;
	const { t } = useTranslation();
	const viewer = useEffectiveActor();
	const post = usePost(handle, postId, viewer || undefined);

	return (
		<div className="mx-auto w-full max-w-2xl space-y-4 py-6">
			<Link className="text-xs text-muted hover:text-front" href="/feed">
				← {t("feed.backToFeed")}
			</Link>
			{post.isLoading ? (
				<p className="py-6 text-center text-sm text-muted">
					{t("feed.loading")}
				</p>
			) : post.isError || !post.data ? (
				<p className="py-6 text-center text-sm text-danger">
					{t("feed.error")}
				</p>
			) : (
				<PostCard
					defaultCommentsOpen
					canDelete={Boolean(viewer) && post.data.author === viewer}
					handle={handle}
					post={post.data}
				/>
			)}
		</div>
	);
}
