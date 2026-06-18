"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { graphqlFeedEnabled } from "@src/common/feature-flags";
import type { FunctionComponent } from "@src/common/types";
import {
	formatTimestamp,
	MAX_FEED_BODY_LENGTH,
} from "@src/components/feed/format";
import { useEffectiveActor } from "@src/components/feed/use-actor";
import { ActorAvatar, ActorLink } from "@src/components/profile/ActorLink";
import { TwitterVerifiedBadge } from "@src/components/profile/TwitterVerifiedBadge";
import {
	useAddComment,
	usePostComments,
	usePostCommentsGql,
} from "@src/hooks/use-feed";

/** A comment normalized across the REST and GraphQL shapes for rendering. */
type CommentRow = {
	commentId: string;
	/** The author @handle (always present). */
	authorHandle: string;
	/** The author wallet cryptoId, when known (for avatar/link routing). */
	authorCryptoId?: string;
	/** Verified status when embedded (GraphQL); undefined → self-fetch badge. */
	verified?: boolean;
	createdAt: string;
	body: string;
};

export function CommentList(props: {
	handle: string;
	postId: string;
}): FunctionComponent {
	const { handle, postId } = props;
	const { t } = useTranslation();
	// Both hooks declared (rules of hooks); the inactive one is disabled. The
	// GraphQL path embeds the author + verified status, so it makes no per-author
	// attestations request.
	const restComments = usePostComments(handle, postId, !graphqlFeedEnabled);
	const gqlComments = usePostCommentsGql(postId, graphqlFeedEnabled);
	const actor = useEffectiveActor();
	const addComment = useAddComment(handle, postId);
	const [draft, setDraft] = useState("");

	const isLoading = graphqlFeedEnabled
		? gqlComments.isLoading
		: restComments.isLoading;
	const rows: Array<CommentRow> = graphqlFeedEnabled
		? (gqlComments.data?.comments ?? []).map((comment) => ({
				commentId: comment.commentId,
				authorHandle: comment.author.handle,
				authorCryptoId: comment.author.cryptoId,
				verified: comment.author.verified,
				createdAt: comment.createdAt,
				body: comment.body,
			}))
		: (restComments.data?.comments ?? []).map((comment) => ({
				commentId: comment.commentId,
				authorHandle: comment.author,
				authorCryptoId: comment.authorCryptoId,
				verified: undefined,
				createdAt: comment.createdAt,
				body: comment.body,
			}));

	const submit = (): void => {
		const body = draft.trim().slice(0, MAX_FEED_BODY_LENGTH);
		if (!body || !actor) return;
		addComment.mutate(
			{ actor, body },
			{
				onSuccess: (): void => {
					setDraft("");
				},
			}
		);
	};

	return (
		<div className="mt-3 border-t border-border pt-3">
			{isLoading ? (
				<p className="text-xs text-muted">{t("feed.loadingComments")}</p>
			) : rows.length === 0 ? (
				<p className="text-xs text-muted">{t("feed.noComments")}</p>
			) : (
				<ul className="space-y-2">
					{rows.map((comment) => (
						<li key={comment.commentId} className="flex gap-2 text-sm">
							<ActorAvatar
								cryptoId={comment.authorCryptoId}
								sizeClass="h-6 w-6 text-[10px]"
								value={comment.authorHandle}
							/>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1.5">
									<span className="inline-flex items-center gap-1 font-medium text-front">
										<ActorLink
											className="hover:underline"
											cryptoId={comment.authorCryptoId}
											value={comment.authorHandle}
										/>
										{comment.verified === undefined ? (
											<TwitterVerifiedBadge agentId={comment.authorHandle} />
										) : (
											<TwitterVerifiedBadge verified={comment.verified} />
										)}
									</span>
									<span className="text-[10px] text-muted">
										{formatTimestamp(comment.createdAt)}
									</span>
								</div>
								<p className="text-front">{comment.body}</p>
							</div>
						</li>
					))}
				</ul>
			)}

			<div className="mt-3 flex items-center gap-2">
				<input
					className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-front placeholder:text-muted"
					disabled={!actor || addComment.isPending}
					maxLength={MAX_FEED_BODY_LENGTH}
					value={draft}
					placeholder={
						actor ? t("feed.commentPlaceholder") : t("feed.connectToComment")
					}
					onChange={(event): void => {
						setDraft(event.target.value);
					}}
					onKeyDown={(event): void => {
						if (event.key === "Enter") submit();
					}}
				/>
				<button
					className="rounded-md bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
					disabled={!actor || !draft.trim() || addComment.isPending}
					type="button"
					onClick={submit}
				>
					{t("feed.comment")}
				</button>
			</div>
		</div>
	);
}
