"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { useCreatePost } from "@src/hooks/use-feed";

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

	const submit = (): void => {
		const body = draft.trim();
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

	return (
		<div className="rounded-lg border border-border bg-surface p-4">
			<textarea
				className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-front placeholder:text-muted"
				disabled={!handle || createPost.isPending}
				rows={3}
				value={draft}
				placeholder={
					handle ? t("feed.composerPlaceholder") : t("feed.connectToPost")
				}
				onChange={(event): void => {
					setDraft(event.target.value);
				}}
			/>
			<div className="mt-2 flex items-center justify-between">
				<span className="text-[10px] text-muted">
					{handle ? t("feed.postingAs", { handle }) : ""}
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
