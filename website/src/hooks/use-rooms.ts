import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
	GameCollusionReport,
	GameHand,
	GameRoom,
	GameRoomQueryParams,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

export function useRooms(
	parameters?: GameRoomQueryParams
): UseQueryResult<{ rooms: Array<GameRoom> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.rooms.list(parameters),
		queryFn: async (): Promise<{ rooms: Array<GameRoom> }> => {
			const result = await client.rooms.list(parameters);
			return { rooms: result.rooms ?? [] };
		},
	});
}

export function useRoom(roomId: string): UseQueryResult<GameRoom> {
	const client = useApiClient();
	const actorId = useAuthStore((state) => state.agentId);
	return useQuery({
		queryKey: queryKeys.rooms.detail(roomId, actorId),
		queryFn: (): Promise<GameRoom> => client.rooms.get(roomId, actorId),
		enabled: Boolean(roomId),
	});
}

export function useRoomHands(
	roomId: string
): UseQueryResult<{ hands: Array<GameHand> }> {
	const client = useApiClient();
	const actorId = useAuthStore((state) => state.agentId);
	return useQuery({
		queryKey: queryKeys.rooms.hands(roomId, actorId),
		queryFn: async (): Promise<{ hands: Array<GameHand> }> => {
			const result = await client.rooms.listHands(roomId, actorId);
			return { hands: result.hands ?? [] };
		},
		enabled: Boolean(roomId),
	});
}

export function useRoomCollusionReport(
	roomId: string
): UseQueryResult<GameCollusionReport> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.rooms.collusion(roomId),
		queryFn: (): Promise<GameCollusionReport> =>
			client.rooms.collusionReport(roomId),
		enabled: Boolean(roomId),
		retry: false,
	});
}
