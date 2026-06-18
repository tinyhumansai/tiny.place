"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { useEffectiveActor } from "@src/components/feed/use-actor";
import { useLikePost, useUnlikePost } from "@src/hooks/use-feed";

/**
 * Heart toggle for a post. Optimistically flips the liked state and count, then
 * reconciles with the server's authoritative count; reverts on error. Disabled
 * until a wallet is connected (likes are signed as the connected identity).
 */
export function LikeButton(props: {
	handle: string;
	postId: string;
	likeCount: number;
	likedByMe?: boolean;
}): FunctionComponent {
	const { handle, postId, likeCount, likedByMe } = props;
	const { t } = useTranslation();
	const actor = useEffectiveActor();
	const like = useLikePost(handle);
	const unlike = useUnlikePost(handle);
	const [liked, setLiked] = useState(Boolean(likedByMe));
	// Default to 0 so the i18n plural always resolves; an undefined count would
	// fall back to rendering the raw "feed.likeCount" key.
	const [count, setCount] = useState(likeCount ?? 0);

	const pending = like.isPending || unlike.isPending;

	const toggle = (): void => {
		if (!actor || pending) return;
		const next = !liked;
		const previousCount = count;
		// Optimistic update.
		setLiked(next);
		setCount((value) => Math.max(0, value + (next ? 1 : -1)));
		const mutation = next ? like : unlike;
		mutation.mutate(
			{ postId, actor },
			{
				onSuccess: (result): void => {
					setLiked(result.liked);
					setCount(result.likeCount);
				},
				onError: (): void => {
					setLiked(!next);
					setCount(previousCount);
				},
			}
		);
	};

	return (
		<button
			aria-pressed={liked}
			disabled={!actor || pending}
			title={actor ? undefined : t("feed.connectToLike")}
			type="button"
			className={`inline-flex items-center gap-1 text-xs transition-colors disabled:opacity-50 ${
				liked ? "text-danger" : "text-muted hover:text-front"
			}`}
			onClick={toggle}
		>
			<span aria-hidden>{liked ? "♥" : "♡"}</span>
			{t("feed.likeCount", { count })}
		</button>
	);
}
