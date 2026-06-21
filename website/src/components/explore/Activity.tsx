"use client";

import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { formatTokenAmount } from "@src/common/format-amount";
import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import { useActivityFeed } from "@src/hooks/use-activity";
import type { ActivityCategory, ActivityEvent } from "@tinyhumansai/tinyplace";

type ActivityProperties = {
	isDark: boolean;
};

const CATEGORY_FILTERS: Array<{ labelKey: string; value?: ActivityCategory }> =
	[
		{ labelKey: "activitySection.filters.all" },
		{ labelKey: "activitySection.filters.financial", value: "financial" },
		{ labelKey: "activitySection.filters.identity", value: "identity" },
		{ labelKey: "activitySection.filters.games", value: "game" },
	];

const KIND_ICONS: Record<string, string> = {
	"marketplace.purchase": "🛒",
	"identity.registered": "✨",
	"identity.renewed": "♻️",
	subscription: "🔁",
	payment: "💸",
	"group.fee": "👥",
	"event.ticket": "🎟️",
	"event.refund": "↩️",
	"revenue.share": "💰",
	"escrow.fund": "🔒",
	"escrow.release": "🔓",
	"escrow.refund": "↩️",
	"arbitration.fee": "⚖️",
	fee: "💸",
	"game.won": "🏆",
	"game.lost": "💀",
	"social.post": "📝",
};

function iconFor(kind: string): string {
	return KIND_ICONS[kind] ?? "•";
}

/** Turn an unknown kind like `foo.bar_baz` into readable `foo bar baz`. */
function humanizeKind(kind: string): string {
	return kind.replace(/[._]/g, " ").trim();
}

function shortName(value: string | null | undefined, t: TFunction): string {
	if (!value) {
		return t("activitySection.someone");
	}
	if (value.length <= 16) {
		return value;
	}
	return value.slice(0, 8) + "…" + value.slice(-4);
}

function amountLabel(event: ActivityEvent): string {
	if (!event.amount) {
		return "";
	}
	// event.amount is in base units; format to "1 USDC" not "1000000 USDC".
	return ` ${formatTokenAmount(event.amount, event.asset ?? undefined)}`;
}

function describe(event: ActivityEvent, t: TFunction): string {
	const actor = shortName(event.actor, t);
	const target = shortName(event.target, t);
	const amount = amountLabel(event);
	switch (event.kind) {
		case "marketplace.purchase":
			return t("activitySection.kinds.marketplacePurchase", {
				actor,
				target,
				amount: amount || ` ${t("activitySection.anItem")}`,
			});
		case "identity.registered":
			return t("activitySection.kinds.identityRegistered", { actor });
		case "identity.renewed":
			return t("activitySection.kinds.identityRenewed", { actor });
		case "subscription":
			return t("activitySection.kinds.subscription", { actor, amount });
		case "group.fee":
			return t("activitySection.kinds.groupFee", { actor, amount });
		case "event.ticket":
			return t("activitySection.kinds.eventTicket", { actor, amount });
		case "event.refund":
			return t("activitySection.kinds.eventRefund", { target, amount });
		case "revenue.share":
			return t("activitySection.kinds.revenueShare", { actor, amount });
		case "escrow.fund":
			return t("activitySection.kinds.escrowFund", { actor, amount });
		case "escrow.release":
			return t("activitySection.kinds.escrowRelease", { target, amount });
		case "escrow.refund":
			return t("activitySection.kinds.escrowRefund", { target, amount });
		case "arbitration.fee":
			return t("activitySection.kinds.arbitrationFee", { actor, amount });
		case "fee":
			return t("activitySection.kinds.fee", { actor, amount });
		case "game.won":
			return t("activitySection.kinds.gameWon", {
				actor,
				amount: amount || ` ${t("activitySection.aHand")}`,
			});
		case "game.lost":
			return t("activitySection.kinds.gameLost", {
				actor,
				amount: amount || ` ${t("activitySection.aHand")}`,
			});
		case "social.post":
			return t("activitySection.kinds.socialPost", { actor });
		case "payment":
			return t("activitySection.kinds.payment", { actor, target, amount });
		default:
			// Unknown/future kind: still describe the action from its kind name
			// rather than showing just the actor id.
			return t("activitySection.kinds.unknown", {
				actor,
				kind: humanizeKind(event.kind),
				amount,
			});
	}
}

function relativeTime(timestamp: string, t: TFunction): string {
	const seconds = Math.max(
		0,
		Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
	);
	if (seconds < 60) {
		return t("activitySection.relativeTime.seconds", { count: seconds });
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return t("activitySection.relativeTime.minutes", { count: minutes });
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return t("activitySection.relativeTime.hours", { count: hours });
	}
	return t("activitySection.relativeTime.days", {
		count: Math.floor(hours / 24),
	});
}

export const Activity = ({ isDark }: ActivityProperties): FunctionComponent => {
	const { t } = useTranslation();
	const [category, setCategory] = useState<ActivityCategory | undefined>(
		undefined
	);
	const { events, isLoading, isError, isLive } = useActivityFeed(
		category ? { category, limit: 50 } : { limit: 50 }
	);

	const headerRow = (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-2">
				<span
					className={`inline-block h-2 w-2 rounded-full ${
						isLive
							? "animate-pulse bg-green-500"
							: isDark
								? "bg-neutral-600"
								: "bg-neutral-300"
					}`}
				/>
				<span
					className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					{isLive ? t("activitySection.live") : t("activitySection.connecting")}
				</span>
			</div>
			<div className="flex gap-1">
				{CATEGORY_FILTERS.map((filter) => {
					const active = category === filter.value;
					return (
						<Chip
							key={filter.labelKey}
							active={active}
							isDark={isDark}
							shape="pill"
							onClick={(): void => {
								setCategory(filter.value);
							}}
						>
							{t(filter.labelKey, { defaultValue: filter.labelKey })}
						</Chip>
					);
				})}
			</div>
		</div>
	);

	let body: ReactElement;
	if (isLoading && events.length === 0) {
		body = (
			<div className="flex flex-col items-center justify-center gap-2 py-12">
				<div
					className={`h-6 w-6 animate-spin rounded-full border-2 border-t-transparent ${
						isDark ? "border-neutral-500" : "border-neutral-400"
					}`}
				/>
				<p
					className={`text-sm ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
				>
					{t("activitySection.loading")}
				</p>
			</div>
		);
	} else if (isError && events.length === 0) {
		body = (
			<div
				className={`rounded-lg border p-4 text-center ${
					isDark
						? "border-red-900/50 bg-red-950/30 text-red-400"
						: "border-red-200 bg-red-50 text-red-600"
				}`}
			>
				<p className="text-sm">{t("activitySection.loadError")}</p>
			</div>
		);
	} else if (events.length === 0) {
		body = (
			<div
				className={`rounded-lg border p-6 text-center ${
					isDark
						? "border-neutral-800 bg-neutral-950 text-neutral-500"
						: "border-neutral-200 bg-neutral-50 text-neutral-400"
				}`}
			>
				<p className="text-sm">{t("activitySection.empty")}</p>
			</div>
		);
	} else {
		body = (
			<div
				className={`flex flex-col divide-y overflow-hidden rounded-lg border ${
					isDark
						? "divide-neutral-800 border-neutral-800"
						: "divide-neutral-200 border-neutral-200"
				}`}
			>
				{events.map((event) => (
					<div
						key={event.eventId}
						className={`flex items-center gap-3 px-3 py-2.5 ${
							isDark ? "bg-neutral-950" : "bg-neutral-50"
						}`}
					>
						<span aria-hidden className="text-base">
							{iconFor(event.kind)}
						</span>
						<p
							className={`flex-1 truncate text-sm ${isDark ? "text-neutral-200" : "text-neutral-700"}`}
						>
							{describe(event, t)}
						</p>
						<span
							className={`shrink-0 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							{relativeTime(event.timestamp, t)}
						</span>
					</div>
				))}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{headerRow}
			{body}
		</div>
	);
};
