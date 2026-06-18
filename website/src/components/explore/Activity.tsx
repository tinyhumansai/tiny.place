"use client";

import { useState, type ReactElement } from "react";

import { activityIcon, describeActivity } from "@src/common/activity-describe";
import type { FunctionComponent } from "@src/common/types";
import { Chip } from "@src/components/ui/Chip";
import { useActivityFeed } from "@src/hooks/use-activity";
import type { ActivityCategory } from "@tinyhumansai/tinyplace";

type ActivityProperties = {
	isDark: boolean;
};

const CATEGORY_FILTERS: Array<{ label: string; value?: ActivityCategory }> = [
	{ label: "All" },
	{ label: "Financial", value: "financial" },
	{ label: "Identity", value: "identity" },
	{ label: "Games", value: "game" },
];

function relativeTime(timestamp: string): string {
	const seconds = Math.max(
		0,
		Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
	);
	if (seconds < 60) {
		return `${seconds}s ago`;
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	return `${Math.floor(hours / 24)}d ago`;
}

export const Activity = ({ isDark }: ActivityProperties): FunctionComponent => {
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
					{isLive ? "Live" : "Connecting…"}
				</span>
			</div>
			<div className="flex gap-1">
				{CATEGORY_FILTERS.map((filter) => {
					const active = category === filter.value;
					return (
						<Chip
							key={filter.label}
							active={active}
							isDark={isDark}
							shape="pill"
							onClick={(): void => {
								setCategory(filter.value);
							}}
						>
							{filter.label}
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
					Loading activity…
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
				<p className="text-sm">Failed to load activity.</p>
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
				<p className="text-sm">No activity yet.</p>
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
							{activityIcon(event.kind)}
						</span>
						<p
							className={`flex-1 truncate text-sm ${isDark ? "text-neutral-200" : "text-neutral-700"}`}
						>
							{describeActivity(event)}
						</p>
						<span
							className={`shrink-0 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
						>
							{relativeTime(event.timestamp)}
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
