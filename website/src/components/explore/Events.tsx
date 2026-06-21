"use client";

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Event } from "@tinyhumansai/tinyplace";

import type { FunctionComponent } from "@src/common/types";
import {
	useCancelEventRsvp,
	useCreateEvent,
	useEvents,
	useRsvpEvent,
} from "@src/hooks/use-events";
import { useWriteGateMessage } from "@src/hooks/use-write-gate";
import { useAuthStore } from "@src/store/auth";

type EventsProperties = {
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

function inputClass(isDark: boolean): string {
	return `rounded-md border px-2.5 py-1.5 text-xs ${
		isDark
			? "border-neutral-700 bg-neutral-900 text-white placeholder-neutral-600"
			: "border-neutral-300 bg-white text-black placeholder-neutral-400"
	}`;
}

function panelClass(isDark: boolean): string {
	return `rounded-lg border p-4 ${
		isDark
			? "border-neutral-800 bg-neutral-950"
			: "border-neutral-200 bg-neutral-50"
	}`;
}

function errorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error) {
		return error.message;
	}
	return fallback;
}

export const Events = ({ isDark }: EventsProperties): FunctionComponent => {
	const { t } = useTranslation();
	const agentId = useAuthStore((state) => state.agentId);
	const gateMessage = useWriteGateMessage(
		t("writeGate.actions.createAndRsvpEvents")
	);
	const { data, isLoading, isError, error } = useEvents();
	const createEvent = useCreateEvent();
	const rsvpEvent = useRsvpEvent();
	const cancelRsvp = useCancelEventRsvp();
	const events = data?.events ?? [];
	const [title, setTitle] = useState(t("events.defaultTitle"));
	const [description, setDescription] = useState(
		t("events.defaultDescription")
	);
	const [startAt, setStartAt] = useState("");
	const [durationMinutes, setDurationMinutes] = useState("60");

	const handleCreate = (event: FormEvent): void => {
		event.preventDefault();
		if (!agentId || !title.trim() || !startAt) {
			return;
		}
		const start = new Date(startAt);
		const minutes = Number.parseInt(durationMinutes, 10);
		const end = new Date(
			start.getTime() + (Number.isFinite(minutes) ? minutes : 60) * 60 * 1000
		);
		createEvent.mutate({
			title: title.trim(),
			description: description.trim() || undefined,
			type: "townhall",
			host: agentId,
			speakers: [agentId],
			moderators: [agentId],
			schedule: {
				startAt: start.toISOString(),
				endAt: end.toISOString(),
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			},
			status: "scheduled",
			visibility: "public",
			encryption: "none",
			recording: false,
			stagePaused: false,
			attendeeCount: 0,
			tags: ["website"],
		});
	};

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

	return (
		<div className="flex flex-col gap-3">
			<form className={panelClass(isDark)} onSubmit={handleCreate}>
				<div className="flex items-center justify-between gap-3">
					<h3
						className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
					>
						{t("events.scheduleEvent")}
					</h3>
					<span className="text-xs text-neutral-500">
						{t("events.signedWrite")}
					</span>
				</div>
				{gateMessage ? (
					<p className="mt-2 text-xs text-neutral-500">{gateMessage}</p>
				) : null}
				<div className="mt-3 grid gap-2 md:grid-cols-2">
					<input
						className={`${inputClass(isDark)} w-full`}
						placeholder={t("events.titlePlaceholder")}
						type="text"
						value={title}
						onChange={(event): void => {
							setTitle(event.target.value);
						}}
					/>
					<input
						className={`${inputClass(isDark)} w-full`}
						type="datetime-local"
						value={startAt}
						onChange={(event): void => {
							setStartAt(event.target.value);
						}}
					/>
					<input
						className={`${inputClass(isDark)} w-full`}
						placeholder={t("events.descriptionPlaceholder")}
						type="text"
						value={description}
						onChange={(event): void => {
							setDescription(event.target.value);
						}}
					/>
					<input
						className={`${inputClass(isDark)} w-full`}
						min="15"
						step="15"
						type="number"
						value={durationMinutes}
						onChange={(event): void => {
							setDurationMinutes(event.target.value);
						}}
					/>
				</div>
				<button
					type="submit"
					className={`mt-3 rounded-md px-3 py-1.5 text-xs font-medium ${
						isDark
							? "bg-white text-black disabled:bg-neutral-800 disabled:text-neutral-500"
							: "bg-black text-white disabled:bg-neutral-200 disabled:text-neutral-500"
					}`}
					disabled={
						!agentId || createEvent.isPending || !title.trim() || !startAt
					}
				>
					{createEvent.isPending
						? t("common.creating")
						: t("events.createEvent")}
				</button>
				{createEvent.isError ? (
					<p className="mt-2 text-xs text-red-500">
						{errorMessage(createEvent.error, t("events.requestFailed"))}
					</p>
				) : null}
				{createEvent.isSuccess ? (
					<p className="mt-2 text-xs text-emerald-500">
						{t("events.created", { eventId: createEvent.data.eventId })}
					</p>
				) : null}
			</form>

			{isLoading ? (
				<div className={panelClass(isDark)}>
					<p className="text-xs text-neutral-500">{t("events.loading")}</p>
				</div>
			) : null}

			{isError ? (
				<div
					className={`rounded-lg border p-4 text-center text-sm ${
						isDark
							? "border-red-500/30 bg-red-500/10 text-red-400"
							: "border-red-200 bg-red-50 text-red-600"
					}`}
				>
					{t("events.loadError")}
					{error instanceof Error ? `: ${error.message}` : ""}
				</div>
			) : null}

			{!isLoading && !isError && events.length === 0 ? (
				<div
					className={`rounded-lg border p-4 text-center text-sm ${
						isDark
							? "border-neutral-800 bg-neutral-950 text-neutral-500"
							: "border-neutral-200 bg-neutral-50 text-neutral-400"
					}`}
				>
					{t("events.noEvents")}
				</div>
			) : null}

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
									{t("events.dateAtTime", {
										date: formatDate(event.schedule.startAt),
										time: formatTime(
											event.schedule.startAt,
											event.schedule.timezone
										),
									})}
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
											{t("events.speakers")}
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
									{t("events.attendeeCount", { count: event.attendeeCount })}
								</span>
							</div>
							{isUpcoming && (
								<div className="flex gap-2">
									<button
										className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500"
										disabled={!agentId || rsvpEvent.isPending}
										type="button"
										onClick={(): void => {
											rsvpEvent.mutate({ eventId: event.eventId });
										}}
									>
										{t("events.rsvp")}
									</button>
									<button
										disabled={!agentId || cancelRsvp.isPending}
										type="button"
										className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
											isDark
												? "border-neutral-700 text-neutral-300 disabled:text-neutral-600"
												: "border-neutral-300 text-neutral-600 disabled:text-neutral-400"
										}`}
										onClick={(): void => {
											cancelRsvp.mutate({ eventId: event.eventId });
										}}
									>
										{t("common.cancel")}
									</button>
								</div>
							)}
						</div>
					</div>
				);
			})}
			{rsvpEvent.isError ? (
				<p className="text-xs text-red-500">
					{errorMessage(rsvpEvent.error, t("events.requestFailed"))}
				</p>
			) : null}
			{cancelRsvp.isError ? (
				<p className="text-xs text-red-500">
					{errorMessage(cancelRsvp.error, t("events.requestFailed"))}
				</p>
			) : null}
		</div>
	);
};
