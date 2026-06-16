import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	TinyPlaceError,
	type GameActionRequest,
	type GameActionResponse,
	type GameCloseResponse,
	type GameCollusionReport,
	type GameEmergencyWithdrawalRequest,
	type GameEmergencyWithdrawalResponse,
	type GameHand,
	type GameJoinRequest,
	type GameJoinResponse,
	type GameLeaveRequest,
	type GameLeaveResponse,
	type GameOperatorRequest,
	type GameRoom,
	type GameRoomQueryParams,
	type GameSettleRequest,
	type GameStartHandResponse,
	type GameTimeoutResponse,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { signX402ChallengeAuthorization } from "@src/common/auth-payment";
import { queryKeys } from "@src/common/query-keys";
import { useAuthStore } from "@src/store/auth";

type RoomPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

function roomPaymentChallenge(error: unknown): RoomPaymentChallenge | null {
	if (!(error instanceof TinyPlaceError) || error.status !== 402) {
		return null;
	}
	if (!error.body || typeof error.body !== "object") {
		return null;
	}
	const body = error.body as Partial<RoomPaymentChallenge>;
	if (!body.payment || typeof body.payment !== "object") {
		return null;
	}
	return {
		error: body.error ?? "Payment required",
		payment: body.payment,
	};
}

function invalidateRoom(
	queryClient: ReturnType<typeof useQueryClient>,
	roomId: string
): void {
	void queryClient.invalidateQueries({
		queryKey: queryKeys.rooms.list(),
	});
	void queryClient.invalidateQueries({
		queryKey: queryKeys.rooms.detail(roomId),
	});
	void queryClient.invalidateQueries({
		queryKey: queryKeys.rooms.hands(roomId),
	});
}

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

export function useRoomHand(
	roomId: string,
	handId: string
): UseQueryResult<GameHand> {
	const client = useApiClient();
	const actorId = useAuthStore((state) => state.agentId);
	return useQuery({
		queryKey: queryKeys.rooms.hand(roomId, handId, actorId),
		queryFn: (): Promise<GameHand> =>
			client.rooms.getHand(roomId, handId, actorId),
		enabled: Boolean(roomId && handId),
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

export function useCreateRoom(): UseMutationResult<
	GameRoom,
	Error,
	Partial<GameRoom>
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (room): Promise<GameRoom> => client.rooms.create(room),
		onSuccess: (room): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.rooms.list(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.rooms.detail(room.roomId),
			});
		},
	});
}

export function useJoinRoom(): UseMutationResult<
	GameJoinResponse,
	Error,
	{ roomId: string; request: GameJoinRequest }
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ roomId, request }): Promise<GameJoinResponse> => {
			try {
				return await client.rooms.join(roomId, request);
			} catch (error) {
				const challenge = roomPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				if (!signer) {
					throw new Error("Connect your wallet first");
				}
				const signedPayment = await signX402ChallengeAuthorization({
					fallbackFrom: request.agentId || "",
					noncePrefix: "room",
					payment: challenge.payment,
					signer,
				});
				return client.rooms.join(roomId, {
					...request,
					paymentAuthorization: signedPayment.signature,
				});
			}
		},
		onSuccess: ({ room }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.rooms.list(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.rooms.detail(room.roomId),
			});
		},
	});
}

export function useLeaveRoom(): UseMutationResult<
	GameLeaveResponse,
	Error,
	{ roomId: string; request?: GameLeaveRequest }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ roomId, request }): Promise<GameLeaveResponse> =>
			client.rooms.leave(roomId, request),
		onSuccess: (_response, { roomId }): void => {
			invalidateRoom(queryClient, roomId);
		},
	});
}

export function useCloseRoom(): UseMutationResult<
	GameCloseResponse,
	Error,
	{ roomId: string; request?: GameOperatorRequest }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ roomId, request }): Promise<GameCloseResponse> =>
			client.rooms.close(roomId, request),
		onSuccess: (_response, { roomId }): void => {
			invalidateRoom(queryClient, roomId);
		},
	});
}

export function useEmergencyRoomWithdrawal(): UseMutationResult<
	GameEmergencyWithdrawalResponse,
	Error,
	{ request: GameEmergencyWithdrawalRequest; roomId: string }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			request,
			roomId,
		}): Promise<GameEmergencyWithdrawalResponse> =>
			client.rooms.emergencyWithdrawal(roomId, request),
		onSuccess: (_response, { roomId }): void => {
			invalidateRoom(queryClient, roomId);
		},
	});
}

export function useRoomAction(): UseMutationResult<
	GameActionResponse,
	Error,
	{ roomId: string; request: GameActionRequest }
> {
	const client = useApiClient();
	const signer = useAuthStore((state) => state.signer);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ roomId, request }): Promise<GameActionResponse> => {
			try {
				return await client.rooms.action(roomId, request);
			} catch (error) {
				const challenge = roomPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				if (!signer) {
					throw new Error("Connect your wallet first");
				}
				const signedPayment = await signX402ChallengeAuthorization({
					fallbackFrom: request.agentId || "",
					noncePrefix: "room",
					payment: challenge.payment,
					signer,
				});
				return client.rooms.action(roomId, {
					...request,
					paymentAuthorization: signedPayment.signature,
				});
			}
		},
		onSuccess: (_response, { roomId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.rooms.detail(roomId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.rooms.hands(roomId),
			});
		},
	});
}

export function useTimeoutRoom(): UseMutationResult<
	GameTimeoutResponse,
	Error,
	{ request?: GameOperatorRequest; roomId: string }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ request, roomId }): Promise<GameTimeoutResponse> =>
			client.rooms.timeout(roomId, request),
		onSuccess: (_response, { roomId }): void => {
			invalidateRoom(queryClient, roomId);
		},
	});
}

export function useStartRoomHand(): UseMutationResult<
	GameStartHandResponse,
	Error,
	{ request?: GameOperatorRequest; roomId: string }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ request, roomId }): Promise<GameStartHandResponse> =>
			client.rooms.startHand(roomId, request),
		onSuccess: (_response, { roomId }): void => {
			invalidateRoom(queryClient, roomId);
		},
	});
}

export function useSettleRoomHand(): UseMutationResult<
	GameHand,
	Error,
	{ handId: string; request: GameSettleRequest; roomId: string }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ handId, request, roomId }): Promise<GameHand> =>
			client.rooms.settleHand(roomId, handId, request),
		onSuccess: (_hand, { handId, roomId }): void => {
			invalidateRoom(queryClient, roomId);
			void queryClient.invalidateQueries({
				queryKey: queryKeys.rooms.hand(roomId, handId),
			});
		},
	});
}
