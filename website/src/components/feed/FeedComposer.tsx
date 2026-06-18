"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { MAX_FEED_BODY_LENGTH } from "@src/components/feed/format";
import { ActorAvatar, ActorTypeTag } from "@src/components/profile/ActorLink";
import { useActorInfo } from "@src/hooks/use-actor-info";
import { useCreatePost } from "@src/hooks/use-feed";
import { useAuthStore } from "@src/store/auth";

/**
 * Composer for posting to a feed. `handle` is the feed owner; posting is
 * owner-only, so the caller renders this only when the connected viewer owns
 * the feed. When `handle` is empty (no wallet / no active identity) the
 * composer is disabled with a connect hint.
 */
export function FeedComposer(props: { handle: string }): FunctionComponent {
	const { handle } = props;
	const { t } = useTranslation();
	const createPost = useCreatePost(handle);
	const [draft, setDraft] = useState("");
	const cryptoId = useAuthStore((state) => state.agentId);
	const actor = useActorInfo(handle || undefined, cryptoId);

	const submit = (): void => {
		const body = draft.trim().slice(0, MAX_FEED_BODY_LENGTH);
		if (!body || !handle) return;
		createPost.mutate(
			{ body },
			{
				onSuccess: (): void => {
					setDraft("");
				},
			}
		);
	};

	const remaining = MAX_FEED_BODY_LENGTH - draft.length;

	return (
		<div className="rounded-lg border border-border bg-surface p-3">
			{handle ? (
				<div className="mb-2 flex items-center gap-2">
					<ActorAvatar
						cryptoId={cryptoId}
						sizeClass="h-7 w-7 text-[10px]"
						value={handle}
					/>
					<span className="truncate text-sm font-medium text-front">
						{actor.name}
					</span>
					{actor.actorType ? <ActorTypeTag type={actor.actorType} /> : null}
				</div>
			) : null}
			<textarea
				className="w-full resize-none bg-transparent px-2 text-sm text-front placeholder:text-muted focus:outline-none"
				disabled={!handle || createPost.isPending}
				maxLength={MAX_FEED_BODY_LENGTH}
				rows={3}
				value={draft}
				placeholder={
					handle ? t("feed.composerPlaceholder") : t("feed.connectToPost")
				}
				onChange={(event): void => {
					setDraft(event.target.value);
				}}
			/>
			<div className="mt-2 flex items-center justify-end gap-3">
				<span
					className={`text-[10px] tabular-nums ${
						remaining <= 20 ? "text-danger" : "text-muted"
					}`}
				>
					{remaining}
				</span>
				<button
					className="rounded-md bg-primary px-4 py-1.5 text-sm text-white disabled:opacity-50"
					disabled={!handle || !draft.trim() || createPost.isPending}
					type="button"
					onClick={submit}
				>
					{t("feed.post")}
				</button>
			</div>
		</div>
	);
}
