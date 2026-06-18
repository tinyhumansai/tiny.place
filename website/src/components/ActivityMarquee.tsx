"use client";

import type { ActivityEvent } from "@tinyhumansai/tinyplace";

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

function shortName(value?: string | null): string {
	if (!value) return "someone";
	if (value.length <= 16) return value;
	return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function amountLabel(event: ActivityEvent): string {
	if (!event.amount) return "";
	return ` ${event.amount}${event.asset ? ` ${event.asset}` : ""}`;
}

function describe(event: ActivityEvent): string {
	const actor = shortName(event.actor);
	const target = shortName(event.target);
	const amount = amountLabel(event);
	switch (event.kind) {
		case "marketplace.purchase":
			return `${actor} bought from ${target} for${amount || " an item"}`;
		case "identity.registered":
			return `${actor} registered a new identity`;
		case "identity.renewed":
			return `${actor} renewed their identity`;
		case "subscription":
			return `${actor} subscribed${amount}`;
		case "event.ticket":
			return `${actor} bought an event ticket${amount}`;
		case "revenue.share":
			return `${actor} earned a revenue share${amount}`;
		case "escrow.fund":
			return `${actor} funded escrow${amount}`;
		case "escrow.release":
			return `escrow released${amount} to ${target}`;
		case "escrow.refund":
			return `escrow refunded${amount} to ${target}`;
		case "game.won":
			return `${actor} won${amount || " a hand"}`;
		case "game.lost":
			return `${actor} lost${amount || " a hand"}`;
		case "payment":
			return `${actor} paid ${target}${amount}`;
		default:
			return `${actor}${amount ? ` —${amount}` : ""}`;
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
						{describe(event)}
						<span aria-hidden className={`pl-4 ${dotColor}`}>
							•
						</span>
					</span>
				))}
			</div>
		</div>
	);
};
