"use client";

import { useEffect, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
	ActivityEvent,
	ActivityListParams,
	ActivityListResponse,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";

const MAX_EVENTS = 200;

export function useActivityEvents(
	parameters?: ActivityListParams
): UseQueryResult<ActivityListResponse> {
	const client = useApiClient();
	return useQuery({
		queryKey: ["activity", "events", parameters] as const,
		queryFn: (): Promise<ActivityListResponse> =>
			client.activity.list(parameters),
	});
}

export type ActivityFeedState = {
	events: Array<ActivityEvent>;
	isLoading: boolean;
	isError: boolean;
	isLive: boolean;
};

function mergeEvents(
	primary: Array<ActivityEvent>,
	secondary: Array<ActivityEvent>
): Array<ActivityEvent> {
	const byId = new Map<string, ActivityEvent>();
	for (const event of secondary) {
		byId.set(event.eventId, event);
	}
	for (const event of primary) {
		byId.set(event.eventId, event);
	}
	return Array.from(byId.values())
		.sort(
			(a, b) =>
				new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
		)
		.slice(0, MAX_EVENTS);
}

/**
 * useActivityFeed combines a REST backfill (for first paint and as a fallback)
 * with the live WebSocket stream. Incoming events are merged into the backfill,
 * deduplicated by eventId, sorted newest-first, and capped.
 */
export function useActivityFeed(
	parameters?: ActivityListParams
): ActivityFeedState {
	const client = useApiClient();
	const query = useActivityEvents(parameters);
	const [liveEvents, setLiveEvents] = useState<Array<ActivityEvent>>([]);
	const [isLive, setIsLive] = useState(false);

	const parametersKey = JSON.stringify(parameters ?? {});

	useEffect(() => {
		const socket = client.activity.stream(parameters);
		if (!socket) {
			return;
		}
		const unsubscribers = [
			socket.on<{ data?: { events?: Array<ActivityEvent> } }>(
				"snapshot",
				(frame) => {
					setLiveEvents(frame.data?.events ?? []);
				}
			),
			socket.on<{ data?: ActivityEvent }>("activity", (frame) => {
				if (frame.data) {
					setLiveEvents((previous) => mergeEvents([frame.data!], previous));
				}
			}),
			socket.on("open", () => { setIsLive(true); }),
			socket.on("close", () => { setIsLive(false); }),
		];
		void socket.connect();
		return (): void => {
			for (const unsubscribe of unsubscribers) {
				unsubscribe();
			}
			socket.close();
			setIsLive(false);
		};
		// parametersKey captures the meaningful identity of `parameters`.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [client, parametersKey]);

	const events = mergeEvents(liveEvents, query.data?.events ?? []);

	return {
		events,
		isLoading: query.isLoading,
		isError: query.isError,
		isLive,
	};
}
