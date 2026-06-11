import type { Event } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import { useEvents } from "@src/hooks/use-events";

type EventsMockProperties = {
	isDark: boolean;
};

function formatDate(iso: string): string {
	const date = new Date(iso);
	return date.toLocaleDateString("en-CA");
}

function formatTime(iso: string, timezone?: string): string {
	const date = new Date(iso);
	const tz = timezone ?? "UTC";
	return date.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: tz,
		timeZoneName: "short",
	});
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

export const EventsMock = ({
	isDark,
}: EventsMockProperties): FunctionComponent => {
	const { data, isLoading, isError, error } = useEvents();
	const events = data?.events ?? [];

	const statusBadge = (event: Event): React.ReactElement => {
		const status = event.status;
		const label = capitalize(status);

		if (status === "live") {
			return (
				<span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400 shadow-[0_0_6px_rgba(34,197,94,0.4)]">
					{label}
				</span>
			);
		}
		if (status === "scheduled") {
			return (
				<span
					className={`rounded-full px-2 py-0.5 text-xs font-medium ${
						isDark
							? "bg-blue-500/20 text-blue-400"
							: "bg-blue-100 text-blue-600"
					}`}
				>
					{label}
				</span>
			);
		}
		return (
			<span
				className={`rounded-full px-2 py-0.5 text-xs font-medium ${
					isDark
						? "bg-neutral-800 text-neutral-500"
						: "bg-neutral-200 text-neutral-400"
				}`}
			>
				{label}
			</span>
		);
	};

	if (isLoading) {
		return (
			<div className="flex flex-col gap-3">
				{Array.from({ length: 3 }).map((_, index) => (
					<div
						key={index}
						className={`animate-pulse rounded-lg border p-3 ${
							isDark
								? "border-neutral-800 bg-neutral-950"
								: "border-neutral-200 bg-neutral-50"
						}`}
					>
						<div
							className={`h-4 w-1/2 rounded ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}
						/>
						<div
							className={`mt-2 h-3 w-3/4 rounded ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}
						/>
						<div
							className={`mt-2 h-3 w-1/3 rounded ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}
						/>
					</div>
				))}
			</div>
		);
	}

	if (isError) {
		return (
			<div
				className={`rounded-lg border p-4 text-center text-sm ${
					isDark
						? "border-red-500/30 bg-red-500/10 text-red-400"
						: "border-red-200 bg-red-50 text-red-600"
				}`}
			>
				Failed to load events
				{error instanceof Error ? `: ${error.message}` : ""}
			</div>
		);
	}

	if (events.length === 0) {
		return (
			<div
				className={`rounded-lg border p-4 text-center text-sm ${
					isDark
						? "border-neutral-800 bg-neutral-950 text-neutral-500"
						: "border-neutral-200 bg-neutral-50 text-neutral-400"
				}`}
			>
				No events found
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{events.map((event) => {
				const speakers = event.speakers ?? [];
				const isLive = event.status === "live";
				const isUpcoming = event.status === "scheduled";

				return (
					<div
						key={event.eventId}
						className={`rounded-lg border p-3 ${
							isDark
								? `border-neutral-800 bg-neutral-950 ${isLive ? "border-green-500/30" : ""}`
								: `border-neutral-200 bg-neutral-50 ${isLive ? "border-green-500/30" : ""}`
						}`}
					>
						<div className="flex items-start justify-between">
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span
										className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
									>
										{event.title}
									</span>
									{statusBadge(event)}
								</div>
								<p
									className={`mt-0.5 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{formatDate(event.schedule.startAt)} at{" "}
									{formatTime(
										event.schedule.startAt,
										event.schedule.timezone,
									)}
								</p>
							</div>
						</div>
						{event.description && (
							<p
								className={`mt-1.5 text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
							>
								{event.description}
							</p>
						)}
						<div className="mt-2 flex items-center justify-between">
							<div className="flex items-center gap-3">
								{speakers.length > 0 && (
									<div className="flex items-center gap-1">
										<span
											className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
										>
											Speakers:
										</span>
										{speakers.map((speaker) => (
											<span
												key={speaker}
												className={`text-xs font-medium ${isDark ? "text-neutral-300" : "text-neutral-600"}`}
											>
												{speaker}
											</span>
										))}
									</div>
								)}
								<span
									className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
								>
									{event.attendeeCount} attendees
								</span>
							</div>
							{isUpcoming && (
								<button
									className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500"
									type="button"
									onClick={(): void => {}}
								>
									Register
								</button>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
};
