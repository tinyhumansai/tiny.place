"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import type { RoomStreamEvent } from "@src/common/poker";

const MAX_EVENTS = 200;

// The room stream events the chatbox + live table care about. Each arrives as
// { type, data }; we re-emit the union as raw RoomStreamEvents and let the view
// format them (so socket lifecycle is decoupled from seat→handle resolution).
const ROOM_EVENT_TYPES = [
	"hand_start",
	"action",
	"community_cards",
	"showdown",
	"pot_update",
	"hand_result",
	"player_join",
	"player_leave",
	"player_timeout",
	"player_timeout_refund",
	"action_required",
	"room_status",
] as const;

export type RoomStreamState = {
	events: Array<RoomStreamEvent>;
	isLive: boolean;
};

/**
 * useRoomStream subscribes to a room's live WebSocket stream. Every event is
 * appended (capped, monotonic seq) for the chatbox to format, and also triggers
 * a refetch of the authoritative room + hand-history queries so the table state
 * stays in sync without polling. The REST queries remain the source of truth for
 * state; the socket supplies liveness and the action narration.
 */
export function useRoomStream(roomId: string): RoomStreamState {
	const client = useApiClient();
	const queryClient = useQueryClient();
	const [events, setEvents] = useState<Array<RoomStreamEvent>>([]);
	const [isLive, setIsLive] = useState(false);
	const seqRef = useRef(0);

	useEffect(() => {
		if (!roomId) {
			return;
		}
		const socket = client.rooms.stream(roomId);
		if (!socket) {
			return;
		}
		const append = (type: string, data: unknown): void => {
			seqRef.current += 1;
			const next: RoomStreamEvent = { seq: seqRef.current, type, data };
			setEvents((previous) => [...previous, next].slice(-MAX_EVENTS));
			void queryClient.invalidateQueries({
				queryKey: queryKeys.rooms.detail(roomId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.rooms.hands(roomId),
			});
		};
		const unsubscribers = [
			...ROOM_EVENT_TYPES.map((type) =>
				socket.on<{ data?: unknown }>(type, (frame) => {
					append(type, frame.data);
				})
			),
			socket.on("open", () => {
				setIsLive(true);
			}),
			socket.on("close", () => {
				setIsLive(false);
			}),
		];
		void socket.connect().catch(() => {});
		return (): void => {
			for (const unsubscribe of unsubscribers) {
				unsubscribe();
			}
			socket.close();
			setIsLive(false);
		};
	}, [client, queryClient, roomId]);

	return { events, isLive };
}
