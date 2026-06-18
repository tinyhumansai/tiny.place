"use client";

import { activityIcon, describeActivity } from "@src/common/activity-describe";
import type { FunctionComponent } from "@src/common/types";
import { useActivityFeed } from "@src/hooks/use-activity";

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

	// The parent supplies the flex-1 fill (see ExploreShell), so this just spans
	// the available width. Shows a placeholder until activity streams in.
	if (items.length === 0) {
		return (
			<div className="w-full overflow-hidden">
				<span className={`text-xs ${dotColor}`}>Live activity…</span>
			</div>
		);
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
						<span aria-hidden>{activityIcon(event.kind)}</span>
						{describeActivity(event)}
						<span aria-hidden className={`pl-4 ${dotColor}`}>
							•
						</span>
					</span>
				))}
			</div>
		</div>
	);
};
