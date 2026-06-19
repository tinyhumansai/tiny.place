"use client";

import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";

/**
 * LoadMore renders the pagination button at the foot of an infinite list. It
 * renders nothing once there are no further pages, so callers can drop it in
 * unconditionally after the list. The label defaults to a translated "Load more".
 */
export function LoadMore(props: {
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onClick: () => void;
	label?: string;
	className?: string;
}): FunctionComponent {
	const { hasNextPage, isFetchingNextPage, onClick, label, className } = props;
	const { t } = useTranslation();

	if (!hasNextPage) {
		return null;
	}

	return (
		<div className={`flex justify-center pt-2 ${className ?? ""}`}>
			<button
				className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-front transition-colors hover:border-primary disabled:opacity-60"
				disabled={isFetchingNextPage}
				type="button"
				onClick={onClick}
			>
				{isFetchingNextPage
					? t("common.loadingMore")
					: (label ?? t("common.loadMore"))}
			</button>
		</div>
	);
}
