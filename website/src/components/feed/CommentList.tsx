"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { formatTimestamp } from "@src/components/feed/format";
import { useEffectiveActor } from "@src/components/feed/use-actor";
import { ActorAvatar, ActorLink } from "@src/components/profile/ActorLink";
import { TwitterVerifiedBadge } from "@src/components/profile/TwitterVerifiedBadge";
import { useAddComment, usePostComments } from "@src/hooks/use-feed";

export function CommentList(props: {
	handle: string;
	postId: string;
}): FunctionComponent {
	const { handle, postId } = props;
	const { t } = useTranslation();
	const comments = usePostComments(handle, postId, true);
	const actor = useEffectiveActor();
	const addComment = useAddComment(handle, postId);
	const [draft, setDraft] = useState("");

	const submit = (): void => {
		const body = draft.trim();
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
			{comments.isLoading ? (
				<p className="text-xs text-muted">{t("feed.loadingComments")}</p>
			) : (comments.data?.comments.length ?? 0) === 0 ? (
				<p className="text-xs text-muted">{t("feed.noComments")}</p>
			) : (
				<ul className="space-y-2">
					{comments.data?.comments.map((comment) => (
						<li key={comment.commentId} className="flex gap-2 text-sm">
							<ActorAvatar
								cryptoId={comment.authorCryptoId}
								sizeClass="h-6 w-6 text-[10px]"
								value={comment.author}
							/>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1.5">
									<span className="inline-flex items-center gap-1 font-medium text-front">
										<ActorLink
											className="hover:underline"
											cryptoId={comment.authorCryptoId}
											value={comment.author}
										/>
										<TwitterVerifiedBadge agentId={comment.author} />
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
