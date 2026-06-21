"use client";

import type { ActivityEvent } from "@tinyhumansai/tinyplace";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type { FunctionComponent } from "@src/common/types";
import { useActivityFeed } from "@src/hooks/use-activity";

const KIND_ICONS: Record<string, string> = {
	"marketplace.purchase": "🛒",
	"identity.registered": "✨",
	"identity.renewed": "♻️",
	subscription: "🔁",
	payment: "💸",
	"event.ticket": "🎟️",
	"event.refund": "↩️",
	"revenue.share": "💰",
	"escrow.fund": "🔒",
	"escrow.release": "🔓",
	"escrow.refund": "↩️",
	"game.won": "🏆",
	"game.lost": "💀",
};

function iconFor(kind: string): string {
	return KIND_ICONS[kind] ?? "•";
}

function shortName(t: TFunction, value?: string | null): string {
	if (!value) return t("activityMarquee.someone");
	if (value.length <= 16) return value;
	return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function amountLabel(event: ActivityEvent): string {
	if (!event.amount) return "";
	return ` ${event.amount}${event.asset ? ` ${event.asset}` : ""}`;
}

function describe(t: TFunction, event: ActivityEvent): string {
	const actor = shortName(t, event.actor);
	const target = shortName(t, event.target);
	const amount = amountLabel(event);
	switch (event.kind) {
		case "marketplace.purchase":
			return t("activityMarquee.marketplacePurchase", {
				actor,
				target,
				amount: amount || t("activityMarquee.anItem"),
			});
		case "identity.registered":
			return t("activityMarquee.identityRegistered", { actor });
		case "identity.renewed":
			return t("activityMarquee.identityRenewed", { actor });
		case "subscription":
			return t("activityMarquee.subscription", { actor, amount });
		case "event.ticket":
			return t("activityMarquee.eventTicket", { actor, amount });
		case "revenue.share":
			return t("activityMarquee.revenueShare", { actor, amount });
		case "escrow.fund":
			return t("activityMarquee.escrowFund", { actor, amount });
		case "escrow.release":
			return t("activityMarquee.escrowRelease", { target, amount });
		case "escrow.refund":
			return t("activityMarquee.escrowRefund", { target, amount });
		case "game.won":
			return t("activityMarquee.gameWon", {
				actor,
				amount: amount || t("activityMarquee.aHand"),
			});
		case "game.lost":
			return t("activityMarquee.gameLost", {
				actor,
				amount: amount || t("activityMarquee.aHand"),
			});
		case "payment":
			return t("activityMarquee.payment", { actor, target, amount });
		default:
			return t("activityMarquee.generic", {
				actor,
				amount: amount ? ` —${amount}` : "",
			});
	}
}

const MARQUEE_KEYFRAMES =
	"@keyframes tp-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }";

/**
 * A horizontally scrolling ticker of recent network activity, shown in the
 * header. Live-updates over the activity websocket via {@link useActivityFeed}.
 * The track renders the events twice and animates by -50% for a seamless loop.
 */
export const ActivityMarquee = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const { t } = useTranslation();
	const { events } = useActivityFeed();
	const items = events.slice(0, 24);
	const itemColor = isDark ? "text-neutral-400" : "text-neutral-500";
	const dotColor = isDark ? "text-neutral-700" : "text-neutral-300";

	// The parent supplies the flex-1 fill (see ExploreShell). Render nothing
	// until activity streams in, so the header doesn't show a blank placeholder
	// strip on every tab when the ticker is empty.
	if (items.length === 0) {
		return null;
	}

	const track = [...items, ...items];

	return (
		<div className="relative w-full overflow-hidden">
			<style>{MARQUEE_KEYFRAMES}</style>
			<div
				className="flex w-max items-center gap-6 whitespace-nowrap"
				style={{ animation: "tp-marquee 8s linear infinite" }}
			>
				{track.map((event, index) => (
					<span
						key={`${event.eventId}-${index}`}
						className={`flex items-center gap-1.5 text-xs ${itemColor}`}
					>
						<span aria-hidden>{iconFor(event.kind)}</span>
						{describe(t, event)}
						<span aria-hidden className={`pl-4 ${dotColor}`}>
							•
						</span>
					</span>
				))}
			</div>
		</div>
	);
};
