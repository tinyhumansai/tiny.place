"use client";

import {
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
} from "react";

import Link from "next/link";

import { profileHref } from "@src/common/profile-link";
import type { FunctionComponent } from "@src/common/types";
import {
	describeActivity,
	iconFor,
	profileTargetForActivity,
} from "@src/components/activity-format";
import { useActivityFeed } from "@src/hooks/use-activity";

// How fast the ticker scrolls, in CSS pixels per second. The animation duration
// is derived from this and the measured track width so the *speed* stays
// constant no matter how many (or how long) the items are — a fixed duration
// would speed up as more activity streams in.
const SPEED_PX_PER_SECOND = 120;
// Horizontal gap between items and between the two looped copies. Kept as a
// number (not a Tailwind class) so the JS width math and the CSS agree exactly,
// which is what makes the loop seamless.
const GAP_PX = 24;

// translateX(0) -> shift one full copy (+ gap) left. Because the items are
// rendered twice, after this shift the second copy sits exactly where the first
// started, so the reset back to 0 is invisible — a seamless loop. The distance
// is supplied as a CSS variable so we can drive it from the measured width.
const MARQUEE_CSS = `
@keyframes tp-marquee {
	to { transform: translateX(calc(-1 * var(--tp-marquee-shift, 0px))); }
}
.tp-marquee-root:hover .tp-marquee-track,
.tp-marquee-root:focus-within .tp-marquee-track {
	animation-play-state: paused;
}
@media (prefers-reduced-motion: reduce) {
	.tp-marquee-track { animation: none !important; transform: none !important; }
}
`;

/**
 * A horizontally scrolling ticker of recent network activity, shown in the
 * header. Live-updates over the activity websocket via {@link useActivityFeed}.
 *
 * The track renders the events twice and animates left by exactly one copy's
 * width (+ gap) for a seamless loop. The animation *duration* is derived from
 * the measured width and a constant px/sec target, so the scroll speed is
 * steady regardless of how much activity is on screen. Hovering (or focusing)
 * pauses it so you can read an item.
 */
export const ActivityMarquee = ({
	isDark,
}: {
	isDark: boolean;
}): FunctionComponent => {
	const { events } = useActivityFeed();
	const items = useMemo(() => events.slice(0, 24), [events]);

	const copyRef = useRef<HTMLDivElement>(null);
	const [shiftPx, setShiftPx] = useState(0);

	// Re-measure whenever the set of items changes (new activity, longer text)
	// or the copy resizes (font load, container reflow), then recompute the
	// shift distance. Duration is derived from it at render time.
	const signature = items.map((event) => event.eventId).join(",");
	useLayoutEffect(() => {
		const copy = copyRef.current;
		if (!copy) return;
		const measure = (): void => {
			const next = copy.offsetWidth + GAP_PX;
			setShiftPx((current) => (current === next ? current : next));
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(copy);
		return (): void => {
			observer.disconnect();
		};
	}, [signature]);

	const itemColor = isDark ? "text-neutral-400" : "text-neutral-500";
	const dotColor = isDark ? "text-neutral-700" : "text-neutral-300";

	// The parent supplies the flex-1 fill (see ExploreShell). Render nothing
	// until activity streams in, so the header doesn't show a blank placeholder
	// strip on every tab when the ticker is empty.
	if (items.length === 0) {
		return null;
	}

	const durationSeconds = shiftPx / SPEED_PX_PER_SECOND;
	const trackStyle: CSSProperties = { gap: `${GAP_PX}px` };
	if (shiftPx > 0) {
		(trackStyle as Record<string, string>)["--tp-marquee-shift"] =
			`${shiftPx}px`;
		trackStyle.animationName = "tp-marquee";
		trackStyle.animationDuration = `${durationSeconds}s`;
		trackStyle.animationTimingFunction = "linear";
		trackStyle.animationIterationCount = "infinite";
	}

	const renderCopy = (copyKey: string): FunctionComponent => {
		// Only the first copy is a real tab stop; the looped duplicate is
		// mouse-clickable but kept out of the keyboard/AT order (aria-hidden).
		const interactive = copyKey === "a";
		return (
			<div
				key={copyKey}
				ref={copyKey === "a" ? copyRef : undefined}
				aria-hidden={copyKey === "b"}
				className="flex items-center"
				style={{ gap: `${GAP_PX}px` }}
			>
				{items.map((event, index) => {
					const href = profileHref(profileTargetForActivity(event));
					const body = (
						<>
							<span aria-hidden>{iconFor(event)}</span>
							{describeActivity(event)}
						</>
					);
					return (
						<span
							key={`${copyKey}-${event.eventId}-${index}`}
							className="flex items-center gap-1.5"
						>
							{href ? (
								<Link
									className={`flex items-center gap-1.5 text-xs transition-colors hover:text-front hover:underline ${itemColor}`}
									href={href}
									tabIndex={interactive ? undefined : -1}
								>
									{body}
								</Link>
							) : (
								<span
									className={`flex items-center gap-1.5 text-xs ${itemColor}`}
								>
									{body}
								</span>
							)}
							<span aria-hidden className={dotColor}>
								•
							</span>
						</span>
					);
				})}
			</div>
		);
	};

	return (
		<div className="tp-marquee-root relative w-full overflow-hidden">
			<style>{MARQUEE_CSS}</style>
			<div
				className="tp-marquee-track flex w-max items-center whitespace-nowrap"
				style={trackStyle}
			>
				{renderCopy("a")}
				{renderCopy("b")}
			</div>
		</div>
	);
};
